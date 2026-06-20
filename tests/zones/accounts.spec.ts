import { expect, type Page, test } from "@playwright/test";
import {
  createAccountUi,
  fillFieldInput,
  normalizeText,
  readAccountBalance,
  readDashboardPhysicalBalance,
  saveByName,
  seedAndLogin,
  selectFieldOption,
  singleRow,
  tableRows,
  type KnownAccount,
  type KnownState,
} from "../helpers/e2e-utils";

// Each test re-seeds the DB in beforeEach (~10s) and drives several full page
// navigations, each waiting on remote Supabase round-trips. That exceeds the
// default 30s budget, so give these end-to-end flows more headroom.
test.describe.configure({ mode: "serial", timeout: 90_000 });

let state: KnownState;

test.beforeEach(async ({ page }) => {
  state = await seedAndLogin(page, "/fr/accounts");
});

test("Comptes - creer Test Account en CNY avec solde 0", async ({ page }) => {
  await createAccountUi(page, {
    name: "Test Account",
    currency: "CNY",
    balance: "0",
    typeLabel: /Personnel/i,
    availabilityLabel: /Disponible/i,
  });

  const account = await singleRow(state, "accounts", { name: "Test Account" });
  console.log(`Comptes S1 - compte attendu=Test Account CNY 0, actuel=${account.name} ${account.currency} ${account.balance}`);
  expect(account.currency, `Devise attendue CNY, actuelle ${account.currency}.`).toBe("CNY");
  expect(Number(account.balance), `Solde attendu 0, actuel ${account.balance}.`).toBe(0);
});

test("Comptes - correction de solde cree balance_correction et affiche 500 CNY", async ({ page }) => {
  await createAccountUi(page, {
    name: "Test Account",
    currency: "CNY",
    balance: "0",
    typeLabel: /Personnel/i,
    availabilityLabel: /Disponible/i,
  });

  await reconcileBalance(page, "Test Account", "500", "QA ACCOUNT CORRECTION 500");

  const account = await singleRow(state, "accounts", { name: "Test Account" });
  console.log(`Comptes S2 - solde attendu=500 CNY, actuel=${account.balance} ${account.currency}`);
  expect(Number(account.balance), `Solde compte attendu 500, actuel ${account.balance}.`).toBe(500);

  const corrections = await tableRows(state, "transactions", {
    account_id: account.id,
    sub_type: "balance_correction",
    note: "QA ACCOUNT CORRECTION 500",
  });
  expect(corrections, "Une transaction balance_correction doit etre creee.").toHaveLength(1);
  expect(Number(corrections[0].amount), `Correction attendue 500, actuelle ${corrections[0]?.amount}.`).toBe(500);

  const visibleBalance = await readAccountBalance(page, "Test Account");
  expect(visibleBalance, `Solde visible attendu 500 CNY, actuel ${visibleBalance} CNY.`).toBe(500);
});

test("Comptes - nouveau compte corrige apparait dans Solde physique du dashboard", async ({ page }) => {
  await createAccountUi(page, {
    name: "Dashboard Account",
    currency: "CNY",
    balance: "0",
    typeLabel: /Personnel/i,
    availabilityLabel: /Disponible/i,
  });
  await reconcileBalance(page, "Dashboard Account", "500", "QA DASHBOARD ACCOUNT 500");

  const rates = await currencyRates();
  const expectedPhysical = sumUsd(state.accounts, rates) + 500 * rates.CNY;
  const actualPhysical = await readDashboardPhysicalBalance(page);
  console.log(`Comptes S3 - Solde physique attendu=${expectedPhysical} USD, actuel=${actualPhysical} USD`);
  expect(actualPhysical, `Solde physique attendu ${expectedPhysical} USD, actuel ${actualPhysical} USD.`).toBeCloseTo(
    expectedPhysical,
    1
  );

  const card = page.locator("button").filter({ hasText: /Physique/i }).first();
  await card.click();
  const drawerText = normalizeText((await page.locator("body").textContent()) ?? "");
  expect(drawerText, "Le detail Solde physique doit lister Dashboard Account.").toMatch(/Dashboard Account/);
});

test("Comptes - disponibilite immediate vers bloquee met a jour le split dashboard", async ({ page }) => {
  await createAccountUi(page, {
    name: "Availability Account",
    currency: "CNY",
    balance: "500",
    typeLabel: /Personnel/i,
    availabilityLabel: /Disponible/i,
  });

  const rates = await currencyRates();
  const expectedAvailableBefore = sumUsd(
    [...state.accounts.filter((account) => account.availability === "immediate"), { name: "Availability Account", currency: "CNY", balance: 500, id: "", type: "", availability: "immediate" }],
    rates
  );
  const expectedDistantAfter = sumUsd(
    [...state.accounts.filter((account) => account.availability === "distant" || account.availability === "blocked"), { name: "Availability Account", currency: "CNY", balance: 500, id: "", type: "", availability: "blocked" }],
    rates
  );

  await editAccountAvailability(page, "Availability Account", /Bloqu/i);

  const account = await singleRow(state, "accounts", { name: "Availability Account" });
  console.log(
    `Comptes S4 - disponibilite attendue=blocked, actuelle=${account.availability}; disponible avant attendu=${expectedAvailableBefore}; distant/bloque apres attendu=${expectedDistantAfter}`
  );
  expect(account.availability, `Disponibilite attendue blocked, actuelle ${account.availability}.`).toBe("blocked");

  await page.goto("/fr/dashboard");
  await page.waitForLoadState("networkidle");
  const body = page.locator("body");
  await expect(
    body,
    "Le dashboard doit exposer le split Disponible pour verifier available vs distant."
  ).toContainText(/Disponible/i);
  await expect(
    body,
    "Le dashboard doit exposer le split Eloigne / Bloque pour verifier available vs distant."
  ).toContainText(/Bloqu|loign/i);

  await page.locator("button").filter({ hasText: /Physique/i }).first().click();
  const drawerText = normalizeText((await page.locator("body").textContent()) ?? "");
  expect(drawerText, "Le detail Solde physique doit montrer Availability Account en Bloque.").toMatch(
    /Availability Account[\s\S]*Bloqu/i
  );
});

test("Comptes - double clic Sauvegarder cree un seul compte", async ({ page }) => {
  await page.getByRole("button", { name: /Nouveau compte/i }).click();
  await fillFieldInput(page, /^Nom du compte$/, "Double Account Test");
  await selectFieldOption(page, /^Devise$/, "CNY");
  await fillFieldInput(page, /^Solde initial$/, "0", 'input[type="number"]');

  const saveButton = page.getByRole("button", { name: /^Sauvegarder$/ });
  await expect(saveButton).toBeEnabled();
  await saveButton.evaluate((button) => {
    (button as HTMLButtonElement).click();
    (button as HTMLButtonElement).click();
  });
  await expect(saveButton).toBeHidden({ timeout: 10_000 });
  await page.waitForLoadState("networkidle");

  const rows = await tableRows(state, "accounts", { name: "Double Account Test" });
  console.log(`Comptes S5 - comptes attendus=1, actuels=${rows.length}`);
  expect(rows, `DOUBLE SUBMIT: attendu 1 compte, actuel ${rows.length}.`).toHaveLength(1);
});

async function reconcileBalance(page: Page, accountName: string, targetBalance: string, note: string) {
  await page.goto("/fr/transactions");
  // NB: /fr/transactions keeps firing client-side Supabase requests, so it never
  // reaches "networkidle". Wait for the actual control instead of the load state.
  const reconcileButton = page.getByRole("button", { name: /R.concilier/i });
  await expect(reconcileButton, "Bouton Réconcilier introuvable sur /fr/transactions.").toBeVisible({
    timeout: 15_000,
  });
  await reconcileButton.click();
  await selectFieldOption(page, /^Compte$/, accountName);
  await fillFieldInput(page, /^Solde r.el observ/, targetBalance, 'input[type="number"]');
  await fillFieldInput(page, /^Note/, note);

  // Click "Appliquer" and wait for the reconciliation modal to close.
  // We must NOT use saveByName here because the button text changes from
  // "Appliquer" to "Application…" during submission, which makes
  // getByRole("button", { name: /^Appliquer$/ }) resolve to an empty set
  // and toBeHidden pass instantly — before the async DB writes finish.
  const applyButton = page.getByRole("button", { name: /^(Appliquer|Application…)$/ });
  await expect(applyButton).toBeEnabled();
  await applyButton.click();
  // Wait for the reconciliation modal heading to disappear (confirms
  // handleSubmitAdjustment → addAdjustment → setShowLegacyForm(false) ran).
  await expect(page.getByRole("heading", { name: /Réconciliation/i })).toBeHidden({ timeout: 15_000 });
}

async function editAccountAvailability(page: Page, accountName: string, availabilityLabel: RegExp) {
  await page.goto("/fr/accounts");
  await page.waitForLoadState("networkidle");
  const card = page.locator("article").filter({ hasText: accountName }).first();
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: /Options du compte/i }).click();
  await card.locator("button").filter({ hasText: /^Modifier$/ }).click();
  await page.getByRole("button", { name: availabilityLabel }).click();
  await saveByName(page, /^Sauvegarder$/);
}

async function currencyRates() {
  const rows = await tableRows(state, "currencies");
  const rates: Record<string, number> = { USD: 1, CNY: 0.138 };
  for (const row of rows) rates[row.code] = Number(row.rate_to_usd);
  return rates;
}

function sumUsd(accounts: Array<Pick<KnownAccount, "currency" | "balance">>, rates: Record<string, number>) {
  return accounts.reduce((sum, account) => sum + Number(account.balance) * (rates[account.currency] ?? 1), 0);
}
