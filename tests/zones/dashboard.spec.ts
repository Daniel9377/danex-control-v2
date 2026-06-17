import { expect, type Page, test } from "@playwright/test";
import { createTestAdminClient } from "../config/test-db";
import {
  createTransactionUi,
  fillFieldInput,
  firstMoneyNumber,
  normalizeText,
  saveByName,
  seedAndLogin,
  selectFieldOption,
  tableRows,
  type KnownState,
} from "../helpers/e2e-utils";

test.describe.configure({ mode: "serial" });

let state: KnownState;

test.beforeEach(async ({ page }) => {
  state = await seedAndLogin(page, "/fr/dashboard");
});

test("Dashboard - Solde physique egale la somme des comptes en USD", async ({ page }) => {
  const rates = await currencyRates();
  const expected = sumAccountsUsd(state.accounts, rates);
  const actual = await readDashboardCardValue(page, /Solde physique/i);

  console.log(`Dashboard S1 - Solde physique attendu=${expected} USD, actuel=${actual} USD`);
  expect(actual, `Solde physique attendu ${expected} USD, actuel ${actual} USD.`).toBeCloseTo(expected, 2);
});

test("Dashboard - Argent client detenu egale recu moins couts moins remboursements moins benefice", async ({ page }) => {
  await createOrder(page, "Divine Test", "Dashboard Client Held Order");
  await createTransactionUi(page, {
    subType: /Argent client re.u/i,
    accountName: "Mercury Test",
    amount: "118",
    currency: "USD",
    clientName: "Divine Test",
    orderName: "Dashboard Client Held Order",
    note: "QA DASH CLIENT RECEIVED",
  });
  await createTransactionUi(page, {
    subType: /Achat produit client/i,
    accountName: "Mercury Test",
    amount: "80",
    currency: "USD",
    clientName: "Divine Test",
    orderName: "Dashboard Client Held Order",
    note: "QA DASH CLIENT COST",
  });

  const expected = 118 - 80;
  const actual = await readDashboardCardValue(page, /Argent client d.tenu/i);
  console.log(`Dashboard S2 - Argent client detenu attendu=${expected} USD, actuel=${actual} USD`);
  expect(actual, `Argent client detenu attendu ${expected} USD, actuel ${actual} USD.`).toBeCloseTo(expected, 2);
});

test("Dashboard - Solde personnel estime egale physique moins client moins dettes", async ({ page }) => {
  const rates = await currencyRates();
  const physical = sumAccountsUsd(state.accounts, rates);
  const debts = state.debts
    .filter((debt) => debt.direction === "i_owe" && debt.status !== "paid")
    .reduce((sum, debt) => sum + debt.remaining_amount * (rates[debt.currency] ?? 1), 0);
  const expected = physical - 0 - debts;
  const actual = await readHeroPersonalEstimate(page);

  console.log(`Dashboard S3 - Solde personnel attendu=${expected} USD, actuel=${actual} USD`);
  expect(actual, `Solde personnel attendu ${expected} USD, actuel ${actual} USD.`).toBeCloseTo(expected, 2);
});

test("Dashboard - alertes visibles pour dette en retard et deficit client", async ({ page }) => {
  await makeSeedDebtOverdue();
  await createOrder(page, "Divine Test", "Dashboard Deficit Order");
  await createTransactionUi(page, {
    subType: /Achat produit client/i,
    accountName: "Mercury Test",
    amount: "150",
    currency: "USD",
    clientName: "Divine Test",
    orderName: "Dashboard Deficit Order",
    note: "QA DASH CLIENT DEFICIT",
  });

  await page.goto("/fr/dashboard");
  await page.waitForLoadState("networkidle");

  const alertSection = page.locator("section").filter({ hasText: /Alertes/i }).first();
  await expect(alertSection, "La section Alertes doit etre visible.").toBeVisible();
  const text = normalizeText((await alertSection.textContent()) ?? "");
  console.log(`Dashboard S4 - alertes: ${text}`);
  expect(text, "Une alerte Dette en retard doit apparaitre.").toMatch(/Dette en retard|Jean-Luc Test/i);
  expect(text, "Une alerte Deficit client doit apparaitre.").toMatch(/D.ficit client|Divine Test/i);
});

test("Dashboard - transactions vides affichent des zeros propres sans NaN", async ({ page }) => {
  await wipeTransactionsOnly();
  await page.goto("/fr/dashboard");
  await page.waitForLoadState("networkidle");

  const bodyText = normalizeText((await page.locator("body").textContent()) ?? "");
  console.log(`Dashboard S5 - etat vide: ${bodyText.slice(0, 500)}`);
  expect(bodyText, "Le dashboard ne doit jamais afficher NaN.").not.toMatch(/NaN/i);
  expect(bodyText, "Le dashboard ne doit jamais afficher undefined.").not.toMatch(/undefined/i);

  expect(await readDashboardCardValue(page, /Argent client d.tenu/i), "Argent client detenu attendu 0.").toBeCloseTo(0, 2);
  expect(await readDashboardCardValue(page, /Revenus r.els/i), "Revenus reels attendus 0.").toBeCloseTo(0, 2);
  expect(await readDashboardCardValue(page, /D.penses r.elles/i), "Depenses reelles attendues 0.").toBeCloseTo(0, 2);
  expect(await readDashboardCardValue(page, /B.n.fice valid/i), "Benefice valide attendu 0.").toBeCloseTo(0, 2);
});

async function createOrder(page: Page, clientName: string, productName: string) {
  await page.goto("/fr/orders");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /Nouvelle commande/i }).click();
  await selectFieldOption(page, /^Client$/, clientName);
  await fillFieldInput(page, /^Produit$/, productName);
  await selectFieldOption(page, /^Devise$/, "USD");
  await saveByName(page, /^Sauvegarder$/);
  await expect(page.locator("article").filter({ hasText: productName }).first()).toBeVisible();
}

async function readDashboardCardValue(page: Page, label: RegExp) {
  await page.goto("/fr/dashboard");
  await page.waitForLoadState("networkidle");
  const card = page.locator("button").filter({ hasText: label }).first();
  await expect(card, `Carte dashboard introuvable: ${label}`).toBeVisible();
  return firstMoneyNumber((await card.textContent()) ?? "");
}

async function readHeroPersonalEstimate(page: Page) {
  await page.goto("/fr/dashboard");
  await page.waitForLoadState("networkidle");
  const hero = page.locator("main > div > div").filter({ hasText: /Situation/i }).first();
  await expect(hero, "Carte hero Situation introuvable.").toBeVisible();
  return firstMoneyNumber((await hero.textContent()) ?? "");
}

async function currencyRates() {
  const rows = await tableRows(state, "currencies");
  const rates: Record<string, number> = { USD: 1, CNY: 0.138 };
  for (const row of rows) rates[row.code] = Number(row.rate_to_usd);
  return rates;
}

function sumAccountsUsd(accounts: Array<{ currency: string; balance: number }>, rates: Record<string, number>) {
  return accounts.reduce((sum, account) => sum + Number(account.balance) * (rates[account.currency] ?? 1), 0);
}

async function makeSeedDebtOverdue() {
  const db = createTestAdminClient();
  const due = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10);
  const { error } = await db
    .from("debts")
    .update({ due_date: due })
    .eq("user_id", state.test_user.id)
    .eq("person_name", "Jean-Luc Test");
  if (error) throw new Error(`Erreur preparation dette en retard: ${error.message}`);
}

async function wipeTransactionsOnly() {
  const db = createTestAdminClient();
  const { error: allocError } = await db
    .from("shared_fee_allocations")
    .delete()
    .eq("user_id", state.test_user.id);
  if (allocError) throw new Error(`Erreur wipe allocations: ${allocError.message}`);

  const { error } = await db.from("transactions").delete().eq("user_id", state.test_user.id);
  if (error) throw new Error(`Erreur wipe transactions: ${error.message}`);
}
