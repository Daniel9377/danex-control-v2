import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { createTestAdminClient, getTestSupabaseConfig } from "../config/test-db";

dotenv.config({ path: path.resolve(process.cwd(), ".env.test"), quiet: true });

const KNOWN_STATE_PATH = path.resolve(process.cwd(), "tests/seed/known-state.json");

const TABLES_TO_WIPE = [
  "debt_payments",
  "transfers",
  "orders",
  "transactions",
  "clients",
  "debts",
  "accounts",
] as const;

const ACCOUNTS_TO_INSERT = [
  { name: "Alipay Test", currency: "CNY", balance: 1000, type: "personnel", availability: "immediate" },
  { name: "WeChat Test", currency: "CNY", balance: 500, type: "personnel", availability: "immediate" },
  { name: "Mercury Test", currency: "USD", balance: 200, type: "business", availability: "immediate" },
  { name: "Cash Test", currency: "USD", balance: 100, type: "personnel", availability: "immediate" },
  { name: "BOC Test", currency: "CNY", balance: 2000, type: "epargne", availability: "distant" },
] as const;

const CLIENTS_TO_INSERT = [
  { name: "Divine Test", city: "Lubumbashi", trust_level: "standard" },
  { name: "Cedric Test", city: "Lubumbashi", trust_level: "risky" },
] as const;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing env var: ${name}`);
  }
  return value;
}

async function ensureTestUser() {
  const db = createTestAdminClient();
  const email = requireEnv("TEST_USER_EMAIL");
  const password = requireEnv("TEST_USER_PASSWORD");
  const normalizedEmail = email.toLowerCase();

  let page = 1;
  let userId: string | null = null;

  while (!userId) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) {
      throw new Error(`Could not list Supabase users: ${error.message}`);
    }

    const match = data.users.find((user) => user.email?.toLowerCase() === normalizedEmail);
    if (match) {
      userId = match.id;
      break;
    }

    if (data.users.length < 1000) {
      break;
    }
    page += 1;
  }

  if (userId) {
    const { error } = await db.auth.admin.updateUserById(userId, {
      password,
      email_confirm: true,
      user_metadata: { full_name: "QA Test User" },
    });
    if (error) {
      throw new Error(`Could not update test user password: ${error.message}`);
    }
  } else {
    const { data, error } = await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: "QA Test User" },
    });
    if (error) {
      throw new Error(`Could not create test user: ${error.message}`);
    }
    if (!data.user?.id) {
      throw new Error("Supabase did not return a user id for the test user.");
    }
    userId = data.user.id;
  }

  const { error: profileError } = await db.from("profiles").upsert(
    {
      id: userId,
      email,
      full_name: "QA Test User",
      role: "user",
      preferred_language: "fr",
    },
    { onConflict: "id" }
  );
  if (profileError) {
    throw new Error(`Could not upsert test profile: ${profileError.message}`);
  }

  return { id: userId, email };
}

async function wipeKnownTables() {
  const db = createTestAdminClient();

  for (const table of TABLES_TO_WIPE) {
    const { error } = await db
      .from(table)
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");

    if (error) {
      throw new Error(`Could not wipe ${table}: ${error.message}`);
    }
  }
}

async function seed() {
  const { danexEnv } = getTestSupabaseConfig();
  const db = createTestAdminClient();

  console.log("Starting test database seed.");
  console.log('Safety guard passed: DANEX_ENV is exactly "test".');

  const testUser = await ensureTestUser();
  console.log(`Using test user: ${testUser.email} (${testUser.id})`);

  console.log("Wiping known financial tables...");
  await wipeKnownTables();

  console.log("Inserting accounts...");
  const { data: accounts, error: accountsError } = await db
    .from("accounts")
    .insert(ACCOUNTS_TO_INSERT.map((account) => ({ ...account, user_id: testUser.id })))
    .select("id,name,currency,balance,type,availability");
  if (accountsError) {
    throw new Error(`Failed to insert accounts: ${accountsError.message}`);
  }
  if (!accounts) {
    throw new Error("Supabase returned no account rows after insert.");
  }

  console.log("Inserting clients...");
  const { data: clients, error: clientsError } = await db
    .from("clients")
    .insert(CLIENTS_TO_INSERT.map((client) => ({ ...client, user_id: testUser.id })))
    .select("id,name,city,trust_level");
  if (clientsError) {
    throw new Error(`Failed to insert clients: ${clientsError.message}`);
  }
  if (!clients) {
    throw new Error("Supabase returned no client rows after insert.");
  }

  console.log("Inserting debt...");
  const { data: debts, error: debtsError } = await db
    .from("debts")
    .insert([
      {
        user_id: testUser.id,
        person_name: "Jean-Luc Test",
        direction: "i_owe",
        amount: 300,
        paid_amount: 0,
        currency: "USD",
        status: "unpaid",
      },
    ])
    .select("id,person_name,direction,amount,paid_amount,currency,status");
  if (debtsError) {
    throw new Error(`Failed to insert debts: ${debtsError.message}`);
  }
  if (!debts) {
    throw new Error("Supabase returned no debt rows after insert.");
  }

  const knownState = {
    seeded_at: new Date().toISOString(),
    database_guard: {
      danex_env: danexEnv,
      danex_env_is_test: danexEnv === "test",
    },
    test_user: testUser,
    accounts: accounts.map((account) => ({
      id: account.id,
      name: account.name,
      currency: account.currency,
      balance: Number(account.balance),
      type: account.type,
      availability: account.availability,
    })),
    clients: clients.map((client) => ({
      id: client.id,
      name: client.name,
      city: client.city,
      trust_level: client.trust_level,
      risk_level: client.trust_level,
    })),
    debts: debts.map((debt) => ({
      id: debt.id,
      person_name: debt.person_name,
      direction: debt.direction,
      amount: Number(debt.amount),
      paid_amount: Number(debt.paid_amount),
      remaining_amount: Number(debt.amount) - Number(debt.paid_amount),
      currency: debt.currency,
      status: debt.status,
    })),
    known_balances: {
      CNY: 3500,
      USD: 300,
    },
  };

  fs.mkdirSync(path.dirname(KNOWN_STATE_PATH), { recursive: true });
  fs.writeFileSync(KNOWN_STATE_PATH, JSON.stringify(knownState, null, 2));

  console.log("\nSeed summary");
  console.log("Accounts:");
  for (const account of knownState.accounts) {
    console.log(
      `- ${account.name}: id=${account.id}, balance=${account.balance} ${account.currency}, type=${account.type}, availability=${account.availability}`
    );
  }
  console.log("Clients:");
  for (const client of knownState.clients) {
    console.log(
      `- ${client.name}: id=${client.id}, city=${client.city}, trust_level=${client.trust_level}`
    );
  }
  console.log("Debts:");
  for (const debt of knownState.debts) {
    console.log(
      `- ${debt.person_name}: id=${debt.id}, direction=${debt.direction}, remaining=${debt.remaining_amount} ${debt.currency}, status=${debt.status}`
    );
  }
  console.log(`Known state written to ${KNOWN_STATE_PATH}`);
  console.log("Seed complete.");
}

seed().catch((error) => {
  console.error("Seed failed.");
  console.error(error);
  process.exit(1);
});
