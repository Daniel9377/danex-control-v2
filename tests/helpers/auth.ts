import { expect, type Page } from "@playwright/test";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.test"), quiet: true });

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing env var: ${name}`);
  }
  return value;
}

export async function loginAsTestUser(page: Page): Promise<void> {
  const email = requireEnv("TEST_USER_EMAIL");
  const password = requireEnv("TEST_USER_PASSWORD");

  await page.goto("/fr/login");
  // The login page is static — networkidle resolves quickly and ensures
  // the Supabase JS client is loaded before form submission.
  await page.waitForLoadState("networkidle");
  const emailInput = page.locator('input[type="email"][autocomplete="email"]');
  const passwordInput = page.locator('input[type="password"][autocomplete="current-password"]');
  await expect(emailInput).toBeVisible();
  await emailInput.fill(email);
  await emailInput.dispatchEvent("input");
  await passwordInput.fill(password);
  await passwordInput.dispatchEvent("input");

  // Click the submit button rather than pressing Enter — more reliable
  // with React controlled inputs that may not sync on fill() alone.
  const submitBtn = page.locator('button[type="submit"]');
  await expect(submitBtn).toBeEnabled({ timeout: 5_000 });

  try {
    await Promise.all([
      page.waitForURL(/\/dashboard(?:$|[?#])/, { timeout: 25_000 }),
      submitBtn.click(),
    ]);
  } catch (error) {
    const loginError = await page
      .locator("form")
      .locator("p")
      .filter({ hasText: /.+/ })
      .last()
      .textContent()
      .catch(() => null);

    throw new Error(
      `Login did not reach the dashboard.${loginError ? ` Login error: ${loginError}` : ""}\n${String(error)}`
    );
  }
}
