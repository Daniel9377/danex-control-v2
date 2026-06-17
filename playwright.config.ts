import { defineConfig, devices } from "@playwright/test";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, ".env.test"), quiet: true });

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing env var: ${name}`);
  }
  return value;
}

const testSupabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL_TEST");
const testSupabaseAnonKey = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY_TEST");
const testSupabaseServiceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY_TEST");
const danexEnv = requireEnv("DANEX_ENV");

for (const [name, value] of Object.entries({
  NEXT_PUBLIC_SUPABASE_URL_TEST: testSupabaseUrl,
  NEXT_PUBLIC_SUPABASE_ANON_KEY_TEST: testSupabaseAnonKey,
  SUPABASE_SERVICE_ROLE_KEY_TEST: testSupabaseServiceRoleKey,
})) {
  if (/your_test_project|placeholder|replace_me|your_/i.test(value)) {
    throw new Error(
      `${name} still looks like a placeholder. Replace .env.test with real test Supabase values before running E2E tests.`
    );
  }
}

if (danexEnv !== "test") {
  throw new Error(
    "SAFETY GUARD: DANEX_ENV must be exactly \"test\" in .env.test. " +
      "Refusing to launch E2E tests against an unsafe database."
  );
}

const port = Number(process.env.PLAYWRIGHT_PORT ?? 3000);
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: "./tests",
  outputDir: "./tests/reports/screenshots",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,

  reporter: [
    ["list"],
    ["json", { outputFile: "tests/reports/results.json" }],
  ],

  use: {
    baseURL,
    browserName: "chromium",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },

  projects: [
    {
      name: "chromium",
      use: {
        browserName: "chromium",
        ...devices["Desktop Chrome"],
      },
    },
  ],

  webServer: {
    command: `npm run dev -- --hostname 127.0.0.1 --port ${port}`,
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: testSupabaseUrl,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: testSupabaseAnonKey,
      SUPABASE_SERVICE_ROLE_KEY: testSupabaseServiceRoleKey,
      DANEX_ENV: danexEnv,
    },
  },
});
