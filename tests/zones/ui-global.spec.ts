import { expect, type Page, type TestInfo, test } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import {
  createClientUi,
  createTransactionUi,
  normalizeText,
  seedAndLogin,
  type KnownState,
} from "../helpers/e2e-utils";

test.describe.configure({ mode: "serial" });

let state: KnownState;

test.beforeEach(async ({ page }) => {
  state = await seedAndLogin(page, "/fr/dashboard");
});

// SKIP: design-v2 removed the theme toggle button. Dark mode is now the only theme.
test.skip("UI globale - bascule sombre clair change la classe html et reste lisible", async ({ page }, testInfo) => {
  await page.goto("/fr/dashboard");
  await page.waitForLoadState("networkidle");
  await takeUiScreenshot(page, testInfo, "theme-dark-initial");

  const initialClass = await page.locator("html").getAttribute("class");
  const contrastBefore = await contrastOffenders(page);
  expect(contrastBefore, `Contraste illisible avant bascule: ${JSON.stringify(contrastBefore.slice(0, 5))}`).toHaveLength(0);

  const themeButton = page
    .getByRole("button", { name: /theme|mode|clair|sombre|dark|light/i })
    .first();
  await expect(
    themeButton,
    "Aucun bouton de bascule sombre/clair n'est expose dans l'UI globale."
  ).toBeVisible();
  await themeButton.click();

  await takeUiScreenshot(page, testInfo, "theme-after-toggle");
  const nextClass = await page.locator("html").getAttribute("class");
  const contrastAfter = await contrastOffenders(page);
  console.log(`UI S1 - classe html avant="${initialClass}", apres="${nextClass}"`);
  expect(nextClass, "La classe <html> doit changer apres la bascule sombre/clair.").not.toBe(initialClass);
  expect(contrastAfter, `Contraste illisible apres bascule: ${JSON.stringify(contrastAfter.slice(0, 5))}`).toHaveLength(0);
});

test("UI globale - mobile 390x844 sans scroll horizontal ni debordement", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });

  for (const route of mainRoutes) {
    await openAndAssertResponsive(page, route, testInfo, "mobile");
    await expect(page.getByRole("button", { name: /^Menu$/ }), `Menu mobile attendu sur ${route}.`).toBeVisible();
    const firstAside = page.locator("aside").first();
    await expect(firstAside, `Sidebar permanente doit etre cachee sur mobile pour ${route}.`).toBeHidden();
  }
});

test("UI globale - tablette 820x1180 sans scroll horizontal ni debordement", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 820, height: 1180 });

  for (const route of mainRoutes) {
    await openAndAssertResponsive(page, route, testInfo, "tablet");
    await expect(page.locator("aside").first(), `Sidebar attendue sur tablette pour ${route}.`).toBeVisible();
  }
});

test("UI globale - textes tres longs restent contenus dans les cartes", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const longName =
    "Joseph Test Client Avec Un Nom Extremement Long Pour Tester Les Cartes Et Les Troncatures QA";
  const longNote =
    "Note QA tres longue sans casser la carte: verification du wrapping, de la troncature, des espacements et du scroll horizontal sur mobile.";

  await createClientUi(page, longName, "Lubumbashi");
  await createTransactionUi(page, {
    subType: /Argent client re.u/i,
    accountName: "Mercury Test",
    amount: "25",
    currency: "USD",
    clientName: longName,
    note: longNote,
  });

  await page.goto("/fr/clients");
  await page.waitForLoadState("networkidle");
  await takeUiScreenshot(page, testInfo, "long-text-clients-mobile");
  await assertNoHorizontalScroll(page, "clients long text");
  await assertNoElementOverflow(page, "clients long text");

  const clientText = normalizeText((await page.locator("article").filter({ hasText: /Joseph Test Client/i }).first().textContent()) ?? "");
  console.log(`UI S4 - carte client long texte: ${clientText}`);
  expect(clientText, "Le client long doit rester visible dans une carte.").toMatch(/Joseph Test Client/);

  await page.goto("/fr/transactions");
  await page.waitForLoadState("networkidle");
  await takeUiScreenshot(page, testInfo, "long-text-transactions-mobile");
  await assertNoHorizontalScroll(page, "transactions long text");
  await assertNoElementOverflow(page, "transactions long text");
});

test("UI globale - tous les liens sidebar ouvrent la bonne page", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/fr/dashboard");
  await page.waitForLoadState("networkidle");

  for (const item of sidebarLinks) {
    await page.getByRole("link", { name: item.label }).click();
    await page.waitForLoadState("networkidle");
    await expect(page, `Navigation ${item.label} doit aller vers ${item.href}.`).toHaveURL(
      new RegExp(`/fr${item.href}$`)
    );
    const body = normalizeText((await page.locator("body").innerText()) ?? "");
    console.log(`UI S5 - ${item.label}: ${page.url()}`);
    expect(body, `${item.label} ne doit pas afficher de 404.`).not.toMatch(/404|not found|introuvable/i);
  }
});

const mainRoutes = [
  "dashboard",
  "accounts",
  "transactions",
  "clients",
  "orders",
  "debts",
  "transfers",
  "reports",
  "export",
  "legacy",
  "alerts",
  "settings",
];

const sidebarLinks = [
  { label: /Tableau de bord/i, href: "/dashboard" },
  { label: /^Comptes$/i, href: "/accounts" },
  { label: /^Transactions$/i, href: "/transactions" },
  { label: /^Clients$/i, href: "/clients" },
  { label: /^Commandes$/i, href: "/orders" },
  { label: /Dettes/i, href: "/debts" },
  { label: /^Transferts$/i, href: "/transfers" },
  { label: /^Rapports$/i, href: "/reports" },
  { label: /^Export$/i, href: "/export" },
  { label: /^Migration$/i, href: "/legacy" },
  { label: /^Alertes$/i, href: "/alerts" },
  { label: /^Param.tres$/i, href: "/settings" },
];

async function openAndAssertResponsive(page: Page, route: string, testInfo: TestInfo, prefix: string) {
  await page.goto(`/fr/${route}`);
  // Mobile pages have continuous Supabase polling, never reach networkidle.
  // Wait for the main content instead.
  await expect(page.locator("main")).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(300);
  await expect(page, `${route} doit rester sur sa route.`).toHaveURL(new RegExp(`/fr/${route}$`));
  await assertNoHorizontalScroll(page, `${prefix} ${route}`);
  await assertNoElementOverflow(page, `${prefix} ${route}`);
  const body = normalizeText((await page.locator("body").innerText()) ?? "");
  expect(body, `${route} ne doit pas afficher de 404.`).not.toMatch(/404|not found|introuvable/i);
  await takeUiScreenshot(page, testInfo, `${prefix}-${route}`);
}

async function assertNoHorizontalScroll(page: Page, context: string) {
  const result = await page.evaluate(() => ({
    htmlScroll: document.documentElement.scrollWidth,
    htmlClient: document.documentElement.clientWidth,
    bodyScroll: document.body.scrollWidth,
    bodyClient: document.body.clientWidth,
  }));
  expect(
    result.htmlScroll,
    `${context}: scroll horizontal html ${result.htmlScroll}px > ${result.htmlClient}px.`
  ).toBeLessThanOrEqual(result.htmlClient + 1);
  expect(
    result.bodyScroll,
    `${context}: scroll horizontal body ${result.bodyScroll}px > ${result.bodyClient}px.`
  ).toBeLessThanOrEqual(result.bodyClient + 1);
}

async function assertNoElementOverflow(page: Page, context: string) {
  const offenders = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const selectors = "main article, main section, main button, main a, main li, main form, main [class*='rounded']";
    return Array.from(document.querySelectorAll<HTMLElement>(selectors))
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return false;
        return rect.left < -1 || rect.right > width + 1;
      })
      .slice(0, 10)
      .map((element) => ({
        tag: element.tagName.toLowerCase(),
        text: element.textContent?.trim().slice(0, 80) ?? "",
        left: Math.round(element.getBoundingClientRect().left),
        right: Math.round(element.getBoundingClientRect().right),
        width,
      }));
  });
  expect(offenders, `${context}: elements debordent horizontalement ${JSON.stringify(offenders)}`).toHaveLength(0);
}

async function takeUiScreenshot(page: Page, testInfo: TestInfo, name: string) {
  const dir = path.resolve(process.cwd(), "tests/reports/screenshots/ui-global");
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${testInfo.workerIndex}-${name}.png`);
  await page.screenshot({ path: filePath, fullPage: true });
}

async function contrastOffenders(page: Page) {
  return page.evaluate(() => {
    function rgba(value: string): [number, number, number, number] | null {
      const match = value.match(/rgba?\(([^)]+)\)/);
      if (!match) return null;
      const parts = match[1].split(",").map((part) => Number(part.trim()));
      return [parts[0], parts[1], parts[2], parts[3] ?? 1];
    }

    function luminance([r, g, b]: [number, number, number, number]) {
      const channels = [r, g, b].map((channel) => {
        const c = channel / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
    }

    function effectiveBackground(element: Element): [number, number, number, number] {
      let current: Element | null = element;
      while (current) {
        const bg = rgba(getComputedStyle(current).backgroundColor);
        if (bg && bg[3] > 0.2) return bg;
        current = current.parentElement;
      }
      return [2, 8, 23, 1];
    }

    return Array.from(document.querySelectorAll<HTMLElement>("main p, main span, main a, main button, main h1, main h2, main h3, main label"))
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 4 && rect.height > 4 && getComputedStyle(element).visibility !== "hidden";
      })
      .map((element) => {
        const fg = rgba(getComputedStyle(element).color);
        const bg = effectiveBackground(element);
        if (!fg) return null;
        const l1 = luminance(fg);
        const l2 = luminance(bg);
        const contrast = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
        return {
          contrast,
          text: element.textContent?.trim().slice(0, 80) ?? "",
          tag: element.tagName.toLowerCase(),
        };
      })
      .filter((item): item is { contrast: number; text: string; tag: string } => !!item)
      .filter((item) => item.text.length > 0 && item.contrast < 1.2)
      .slice(0, 10);
  });
}
