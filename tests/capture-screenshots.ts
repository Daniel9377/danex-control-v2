import { chromium } from "@playwright/test";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.test"), quiet: true });

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  // Login via UI
  await page.goto("http://localhost:3000/fr/login");
  await page.waitForLoadState("networkidle");
  const emailInput = page.locator('input[type="email"]');
  const passwordInput = page.locator('input[type="password"]');
  await emailInput.fill("test@danex.local");
  await emailInput.dispatchEvent("input");
  await passwordInput.fill("123456789");
  await passwordInput.dispatchEvent("input");
  const submitBtn = page.locator('button[type="submit"]');
  // Wait for the button to become enabled (React controlled form)
  await submitBtn.waitFor({ state: "attached" });
  await page.waitForFunction(
    (sel) => !(document.querySelector(sel) as HTMLButtonElement)?.disabled,
    'button[type="submit"]',
    { timeout: 5_000 }
  );
  await Promise.all([
    page.waitForURL(/\/dashboard/),
    submitBtn.click(),
  ]);

  // Screenshot Dashboard
  await page.waitForSelector("main");
  await page.waitForTimeout(2000);
  await page.screenshot({ path: "tests/reports/screenshots/design-v2-dashboard.png", fullPage: false });
  console.log("Dashboard captured");

  // Screenshot Accounts
  await page.goto("http://localhost:3000/fr/accounts");
  await page.waitForSelector("main");
  await page.waitForTimeout(2000);
  await page.screenshot({ path: "tests/reports/screenshots/design-v2-accounts.png", fullPage: false });
  console.log("Accounts captured");

  // Screenshot Transactions
  await page.goto("http://localhost:3000/fr/transactions");
  await page.waitForSelector("main");
  await page.waitForTimeout(2000);
  await page.screenshot({ path: "tests/reports/screenshots/design-v2-transactions.png", fullPage: false });
  console.log("Transactions captured");

  await browser.close();
  console.log("Done — 3 screenshots saved.");
}

main().catch((e) => { console.error(e); process.exit(1); });
