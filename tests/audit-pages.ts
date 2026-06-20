import { chromium } from "@playwright/test";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 800, height: 600 } });
  const page = await ctx.newPage();

  // Use the test helper to login — same as smoke test
  await page.goto("http://localhost:3000/fr/login");
  await page.waitForLoadState("networkidle");
  await page.locator('input[type="email"]').fill("test@danex.local");
  await page.locator('input[type="password"]').fill("123456789");
  await page.locator('input[type="password"]').press("Enter");

  // Wait for dashboard or error
  try {
    await page.waitForURL(/dashboard/, { timeout: 25000 });
  } catch {
    const errorText = await page.locator("form p").last().textContent().catch(() => "unknown");
    console.error("Login failed:", errorText);
    await browser.close();
    process.exit(1);
  }
  await page.waitForSelector("main");
  await page.waitForTimeout(2000);

  // ── Audit Dashboard ──
  const dash = await page.evaluate(() => {
    const s = getComputedStyle(document.body);
    return {
      bg: s.backgroundColor,
      color: s.color,
      font: s.fontFamily?.split(",")[0] || "?",
      h1: document.querySelector("h1")?.textContent || "?",
      cards: document.querySelectorAll("article").length,
      sidebar: !!document.querySelector("aside"),
      brand: document.querySelector("aside span")?.textContent?.trim() || "?",
      fontsMono: document.querySelectorAll('[class*="font-mono"]').length,
      bgApp: document.querySelector(".danex-bg") ? "yes" : "NO",
    };
  });
  console.log("=== DASHBOARD ===", JSON.stringify(dash));

  // ── Audit Comptes ──
  await page.goto("http://localhost:3000/fr/accounts");
  await page.waitForSelector("main");
  await page.waitForTimeout(1500);
  const acct = await page.evaluate(() => {
    const s = getComputedStyle(document.body);
    return {
      bg: s.backgroundColor,
      font: s.fontFamily?.split(",")[0] || "?",
      h1: document.querySelector("h1")?.textContent || "?",
      cards: document.querySelectorAll("article").length,
      bgApp: document.querySelector(".danex-bg") ? "yes" : "NO",
    };
  });
  console.log("=== COMPTES ===", JSON.stringify(acct));

  // ── Audit Transactions ──
  await page.goto("http://localhost:3000/fr/transactions");
  await page.waitForSelector("main");
  await page.waitForTimeout(1500);
  const tx = await page.evaluate(() => {
    const s = getComputedStyle(document.body);
    return {
      bg: s.backgroundColor,
      font: s.fontFamily?.split(",")[0] || "?",
      h1: document.querySelector("h1")?.textContent || "?",
      bgApp: document.querySelector(".danex-bg") ? "yes" : "NO",
    };
  });
  console.log("=== TRANSACTIONS ===", JSON.stringify(tx));

  await browser.close();
  console.log("\n✅ Audit terminé");
}

main().catch((e) => { console.error(e); process.exit(1); });
