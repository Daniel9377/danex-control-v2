import { chromium } from "@playwright/test";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 800, height: 600 } });
  const page = await ctx.newPage();

  await page.goto("http://localhost:3000/fr/login");
  await page.waitForLoadState("networkidle");
  await page.locator('input[type="email"]').fill("test@danex.local");
  await page.locator('input[type="password"]').fill("123456789");
  await page.locator('input[type="password"]').press("Enter");
  await page.waitForURL(/dashboard/, { timeout: 25000 });
  await page.waitForSelector("main");
  await page.waitForTimeout(3000);

  // Debug: check what's rendered
  const html = await page.evaluate(() => {
    const main = document.querySelector("main");
    if (!main) return "NO MAIN";
    // Get first 500 chars of inner text
    const text = main.textContent?.trim().slice(0, 500) || "(empty)";
    const childCount = main.children.length;
    const firstChildTag = main.children[0]?.tagName || "none";
    const loadingEls = main.querySelectorAll('[class*="animate-pulse"]').length;
    const articles = main.querySelectorAll("article").length;
    const buttons = main.querySelectorAll("button").length;
    const links = main.querySelectorAll("a").length;
    const sections = main.querySelectorAll("section").length;
    return { text: text.slice(0, 200), childCount, firstChildTag, loadingEls, articles, buttons, links, sections };
  });

  console.log(JSON.stringify(html, null, 2));

  // Check for JS errors
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  await page.waitForTimeout(1000);
  if (errors.length > 0) console.log("JS ERRORS:", errors);

  await page.screenshot({ path: "tests/reports/screenshots/design-v2-dashboard-v2.png" });
  console.log("Screenshot saved.");
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
