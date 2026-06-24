/**
 * ═══════════════════════════════════════════════════════════════════════════
 * USE-TEST-DB — Switch the Next.js dev server to the test Supabase project.
 *
 * WHEN TO USE:
 *   The QA test suite (tests/zones/*.spec.ts) needs the app to connect to
 *   the test database (pmvxdjmtpsagcwvkpedx), NOT production.  Running
 *   `npx tsx tests/use-test-db.ts` before starting the dev server fixes:
 *   - "Invalid login credentials" (test user only exists in the test project)
 *   - Test data being contaminated by production data
 *
 * HOW TO USE:
 *   1. npx tsx tests/use-test-db.ts       ← switch to test project
 *   2. npx next dev --port 3000             ← start server (uses .env.local)
 *   3. npx playwright test tests/zones/     ← run the QA suite
 *   4. npx tsx tests/use-test-db.ts --prod  ← switch BACK to production
 *
 *   The script backs up .env.local to .env.local.prod-backup on first run.
 *   Passing --prod restores from that backup.
 *
 * NEVER commit the .env.local with test values.  The backup file is also
 * gitignored (env*.local).
 * ═══════════════════════════════════════════════════════════════════════════
 */

import * as fs from "fs";
import * as path from "path";

const localEnv = path.resolve(process.cwd(), ".env.local");
const backupPath = path.resolve(process.cwd(), ".env.local.prod-backup");
const testEnv = path.resolve(process.cwd(), ".env.test");

function getTestOverrideLines(): string[] {
  if (!fs.existsSync(testEnv)) {
    console.error("ERROR: .env.test not found. Cannot read test Supabase config.");
    process.exit(1);
  }
  const content = fs.readFileSync(testEnv, "utf-8");
  // Extract the NON-suffixed variable definitions from .env.test
  return content.split("\n").filter((line) => {
    const key = line.split("=")[0].trim();
    return key === "NEXT_PUBLIC_SUPABASE_URL" || key === "NEXT_PUBLIC_SUPABASE_ANON_KEY";
  });
}

function switchToTest() {
  if (!fs.existsSync(backupPath)) {
    fs.copyFileSync(localEnv, backupPath);
    console.log("✓ Backed up .env.local → .env.local.prod-backup");
  } else {
    console.log("ℹ Backup already exists at .env.local.prod-backup");
  }

  const overrides = getTestOverrideLines();
  if (overrides.length === 0) {
    console.error("ERROR: No standard NEXT_PUBLIC_* vars found in .env.test. Add them first.");
    process.exit(1);
  }

  let current = fs.readFileSync(localEnv, "utf-8");
  // Remove any previous overrides
  current = current
    .split("\n")
    .filter((l) => {
      const key = l.split("=")[0].trim();
      return key !== "NEXT_PUBLIC_SUPABASE_URL" && key !== "NEXT_PUBLIC_SUPABASE_ANON_KEY";
    })
    .join("\n");

  fs.writeFileSync(
    localEnv,
    current.trim() + "\n\n# === Test overrides (from tests/use-test-db.ts) ===\n" + overrides.join("\n") + "\n"
  );
  console.log("✓ .env.local now points to test Supabase project (pmvxdjmtpsagcwvkpedx)");
  console.log("  Run the dev server, then: npx playwright test tests/zones/");
}

function restoreProduction() {
  if (!fs.existsSync(backupPath)) {
    console.error("ERROR: No backup found at .env.local.prod-backup. Nothing to restore.");
    process.exit(1);
  }
  fs.copyFileSync(backupPath, localEnv);
  // Verify the restore actually worked
  const restored = fs.readFileSync(localEnv, "utf-8");
  const match = restored.match(/NEXT_PUBLIC_SUPABASE_URL=(https:\/\/[^.]+\.supabase\.co)/);
  const projectId = match ? match[1].split("//")[1].split(".")[0] : "UNKNOWN";
  if (projectId === "dhrcuyzrwwjkenjvpeow") {
    console.log("✓ .env.local restored to production Supabase (dhrcuyzrwwjkenjvpeow)");
  } else {
    console.error(`ERROR: Restore produced wrong project: ${projectId}. Expected dhrcuyzrwwjkenjvpeow.`);
    process.exit(1);
  }
}

const arg = process.argv[2];
if (arg === "--prod" || arg === "--restore") {
  restoreProduction();
} else {
  switchToTest();
}
