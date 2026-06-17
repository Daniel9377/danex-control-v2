import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.test"), quiet: true });

function requireTestEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing env var: ${name}`);
  }
  return value;
}

export function assertTestEnvironment(danexEnv: string): void {
  if (danexEnv !== "test") {
    throw new Error(
      `SAFETY GUARD: DANEX_ENV must be exactly "test" in .env.test.\n` +
        `Current DANEX_ENV: ${danexEnv || "(missing)"}\n` +
        "Refusing to use a database unless the test environment is explicit."
    );
  }
}

export function assertTestDatabaseUrl(url: string): void {
  if (/your_test_project|placeholder|replace_me/i.test(url)) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL_TEST still looks like a placeholder. " +
        "Replace .env.test with the real danex-control-test Supabase URL before seeding."
    );
  }
}

export function getTestSupabaseConfig() {
  const danexEnv = requireTestEnv("DANEX_ENV");
  const url = requireTestEnv("NEXT_PUBLIC_SUPABASE_URL_TEST");
  const anonKey = requireTestEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY_TEST");
  const serviceRoleKey = requireTestEnv("SUPABASE_SERVICE_ROLE_KEY_TEST");

  for (const [name, value] of Object.entries({
    NEXT_PUBLIC_SUPABASE_ANON_KEY_TEST: anonKey,
    SUPABASE_SERVICE_ROLE_KEY_TEST: serviceRoleKey,
  })) {
    if (/placeholder|replace_me|your_/i.test(value)) {
      throw new Error(
        `${name} still looks like a placeholder. Replace .env.test with real test Supabase keys before running QA.`
      );
    }
  }

  assertTestEnvironment(danexEnv);
  assertTestDatabaseUrl(url);

  return { danexEnv, url, anonKey, serviceRoleKey };
}

export function createTestAdminClient() {
  const { url, serviceRoleKey } = getTestSupabaseConfig();

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function createTestAnonClient() {
  const { url, anonKey } = getTestSupabaseConfig();

  return createClient(url, anonKey);
}
