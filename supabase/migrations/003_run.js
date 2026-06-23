/**
 * Migration 003: Add quantity column to orders table.
 *
 * RUN THIS SCRIPT against the TEST database first:
 *   1. Make sure .env.test is correct (DANEX_ENV=test)
 *   2. node supabase/migrations/003_run.js
 *
 * If the script can't connect (corporate network, firewall), run the SQL
 * manually in the Supabase SQL Editor:
 *   ALTER TABLE orders ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1;
 *
 * The app code handles a missing quantity column gracefully (defaults to 1).
 *
 * Production migration: ONLY after testing. Same SQL, same script with
 * .env.local loaded instead.
 */
require("dotenv").config({ path: ".env.test" });

const { Pool } = require("pg");
const net = require("net");

if (process.env.DANEX_ENV !== "test") {
  console.error("SAFETY: DANEX_ENV must be 'test'. Aborting.");
  process.exit(1);
}

const PROJECT_REF = "pmvxdjmtpsagcwvkpedx";
const PASSWORD = process.env.SUPABASE_SERVICE_ROLE_KEY_TEST;

const HOSTS = [
  // Transaction pooler (port 6543) — pass tenant via SNI hostname
  {
    label: "Pooler tx (SNI)",
    host: "aws-0-us-east-1.pooler.supabase.com",
    port: 6543,
    user: "postgres",
    sni: `db.${PROJECT_REF}.supabase.co`,   // tenant identified via TLS SNI
  },
  // Session pooler (port 5432) — tenant in username
  {
    label: "Pooler session",
    host: "aws-0-us-east-1.pooler.supabase.com",
    port: 5432,
    user: `postgres.${PROJECT_REF}`,
    sni: null,
  },
  // Direct connection
  {
    label: "Direct",
    host: `db.${PROJECT_REF}.supabase.co`,
    port: 5432,
    user: "postgres",
    sni: null,
  },
];

async function tryHost(host, port) {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    sock.setTimeout(3000);
    sock.on("connect", () => { sock.destroy(); resolve(true); });
    sock.on("error", () => resolve(false));
    sock.on("timeout", () => { sock.destroy(); resolve(false); });
    sock.connect(port, host);
  });
}

async function main() {
  // Find a working host
  let connStr = null;
  let selectedHost = null;
  for (const h of HOSTS) {
    console.log(`Trying ${h.label} (${h.host}:${h.port}, user=${h.user})...`);
    const reachable = await tryHost(h.host, h.port);
    if (reachable) {
      console.log(`  ✓ Reachable`);
      connStr = `postgresql://${encodeURIComponent(h.user)}:${encodeURIComponent(PASSWORD)}@${h.host}:${h.port}/postgres`;
      selectedHost = h;
      break;
    }
    console.log(`  ✗ Unreachable`);
  }

  if (!connStr) {
    console.error("\nCould not reach any Supabase PostgreSQL host.");
    console.error("Run this SQL manually in the Supabase Dashboard SQL Editor:");
    console.error("  ALTER TABLE orders ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1;");
    console.error("\nTarget project:", PROJECT_REF);
    console.error("The app handles missing 'quantity' gracefully (defaults to 1).");
    process.exit(1);
  }

  console.log("\nConnecting...");
  const sslOpts = { rejectUnauthorized: false };
  if (selectedHost.sni) {
    sslOpts.servername = selectedHost.sni;
    console.log(`  SNI hostname: ${selectedHost.sni}`);
  }
  const pool = new Pool({
    connectionString: connStr,
    ssl: sslOpts,
    connectionTimeoutMillis: 10000,
  });

  try {
    // Check if column already exists
    const { rows: before } = await pool.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'quantity'"
    );

    if (before.length > 0) {
      console.log("Column 'quantity' already exists. Skipping migration.");
    } else {
      await pool.query("ALTER TABLE orders ADD COLUMN quantity INTEGER NOT NULL DEFAULT 1");
      console.log("✓ Migration applied: quantity INTEGER NOT NULL DEFAULT 1.");
    }

    // Verify
    const { rows: verify } = await pool.query(
      "SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'quantity'"
    );
    console.log("Schema:", JSON.stringify(verify));

    // Null check
    const { rows: nulls } = await pool.query(
      "SELECT COUNT(*) as c FROM orders WHERE quantity IS NULL"
    );
    if (parseInt(nulls[0]?.c || "0") > 0) {
      console.error("CRITICAL: NULL quantities found!");
    } else {
      console.log("✓ No NULL quantities — clean.");
    }

    // Sample
    const { rows: sample } = await pool.query(
      "SELECT id, product_name, quantity FROM orders ORDER BY created_at DESC LIMIT 3"
    );
    console.log("Sample:", JSON.stringify(sample));
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error("Migration failed:", e.message);
  process.exit(1);
});
