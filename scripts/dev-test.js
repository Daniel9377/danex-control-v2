/**
 * Starts `next dev` with the TEST project's environment loaded from .env.test.
 *
 * Why a loader script instead of relying on Next's own env files:
 *   `next dev` always runs with NODE_ENV=development, so Next would load
 *   `.env.local` (which points at PRODUCTION). By populating process.env from
 *   .env.test BEFORE Next boots AND temporarily hiding .env.local, the test
 *   values are the only ones Next.js sees — no override is possible.
 *
 * Result: `npm run dev:test` runs the whole app against the TEST database and
 * turns on the "Voir la démo" button. `npm run dev` stays on production.
 */
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const ENV_LOCAL = path.join(ROOT, ".env.local");
const ENV_LOCAL_HIDE = path.join(ROOT, ".env.local.dev-test-hidden");

// 1. Load test env into process.env
require("dotenv").config({ path: path.join(ROOT, ".env.test") });

if (process.env.DANEX_ENV !== "test") {
  console.error(
    "Refusing to start: .env.test must set DANEX_ENV=test before running dev:test."
  );
  process.exit(1);
}

// 2. Hide .env.local so Next.js cannot load its production values on top.
//    Handle crash recovery: if a previous run left the file hidden, restore
//    it first so Daniel doesn't end up with a missing .env.local.
let hidden = false;

if (!fs.existsSync(ENV_LOCAL) && fs.existsSync(ENV_LOCAL_HIDE)) {
  // Previous crash detected — hidden file still exists, .env.local is gone.
  console.warn(
    "[dev:test] ⚠ Previous crash detected — .env.local was left hidden."
  );
  try {
    fs.renameSync(ENV_LOCAL_HIDE, ENV_LOCAL);
    console.warn("[dev:test] Restored .env.local automatically.");
  } catch (e) {
    console.error("[dev:test] Could not restore .env.local:", e.message);
    console.error(
      `[dev:test] Manual restore: mv "${ENV_LOCAL_HIDE}" "${ENV_LOCAL}"`
    );
    process.exit(1);
  }
}

if (fs.existsSync(ENV_LOCAL)) {
  try {
    fs.renameSync(ENV_LOCAL, ENV_LOCAL_HIDE);
    hidden = true;
    console.log("[dev:test] .env.local temporarily hidden");
  } catch (e) {
    console.error("[dev:test] Could not hide .env.local:", e.message);
    process.exit(1);
  }
} else {
  console.warn(
    "[dev:test] ⚠ .env.local is missing — running with test env only. " +
    "Run `npm run dev` (without :test) to restore production env."
  );
}

console.log(`[dev:test] Supabase URL -> ${process.env.NEXT_PUBLIC_SUPABASE_URL}`);
console.log(
  `[dev:test] Demo button  -> ${
    process.env.NEXT_PUBLIC_DANEX_ENV === "test" ? "ON" : "off"
  }`
);

// 3. Spawn Next.js — it will only find .env.test values (or nothing)
const child = spawn("next", ["dev"], { stdio: "inherit", shell: true });

function restore() {
  if (!hidden) return;
  try {
    fs.renameSync(ENV_LOCAL_HIDE, ENV_LOCAL);
    console.log("[dev:test] .env.local restored");
  } catch (e) {
    console.error("[dev:test] Could not restore .env.local:", e.message);
    console.error(
      `[dev:test] Manual restore: mv "${ENV_LOCAL_HIDE}" "${ENV_LOCAL}"`
    );
  }
}

// Always restore .env.local on exit
child.on("exit", (code) => {
  restore();
  process.exit(code ?? 0);
});

process.on("SIGINT", () => {
  restore();
  process.exit(0);
});

process.on("SIGTERM", () => {
  restore();
  process.exit(0);
});
