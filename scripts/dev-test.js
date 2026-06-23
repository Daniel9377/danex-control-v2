/**
 * Starts `next dev` with the TEST project's environment loaded from .env.test.
 *
 * Why a loader script instead of relying on Next's own env files:
 *   `next dev` always runs with NODE_ENV=development, so Next would load
 *   `.env.local` (which points at PRODUCTION). By populating process.env from
 *   .env.test BEFORE Next boots, the test values win — Next never overrides
 *   variables that are already defined in the environment.
 *
 * Result: `npm run dev:test` runs the whole app against the TEST database and
 * turns on the "Voir la démo" button. `npm run dev` stays on production.
 */
const path = require("path");
const { spawn } = require("child_process");
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env.test") });

if (process.env.DANEX_ENV !== "test") {
  console.error(
    "Refusing to start: .env.test must set DANEX_ENV=test before running dev:test."
  );
  process.exit(1);
}

console.log(`[dev:test] Supabase URL -> ${process.env.NEXT_PUBLIC_SUPABASE_URL}`);
console.log(`[dev:test] Demo button  -> ${process.env.NEXT_PUBLIC_DANEX_ENV === "test" ? "ON" : "off"}`);

const child = spawn("next", ["dev"], { stdio: "inherit", shell: true });
child.on("exit", (code) => process.exit(code ?? 0));
