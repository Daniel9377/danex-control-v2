import { expect, type Locator, type Page, test } from "@playwright/test";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { createTestAdminClient } from "../config/test-db";
import { loginAsTestUser } from "../helpers/auth";

type KnownAccount = {
  id: string;
  name: string;
  currency: string;
  balance: number;
  type: string;
  availability: string;
};

type KnownClient = {
  id: string;
  name: string;
  city: string | null;
  trust_level: string;
};

type KnownState = {
  test_user: { id: string; email: string };
  accounts: KnownAccount[];
  clients: KnownClient[];
  known_balances: Record<string, number>;
};

const KNOWN_STATE_PATH = path.resolve(process.cwd(), "tests/seed/known-state.json");

test.describe.configure({ mode: "serial", timeout: 90_000 });

let knownState: KnownState;

test.beforeEach(async ({ page }) => {
  execSync("npx tsx tests/seed/seed-test-db.ts", {
    cwd: process.cwd(),
    stdio: "pipe",
  });
  knownState = loadKnownState();

  await loginAsTestUser(page);
  await page.goto("/fr/transactions");
  // /fr/transactions fires continuous Supabase requests — wait for control instead.
  await expect(page.getByRole("button", { name: /Nouvelle transaction/i })).toBeVisible({ timeout: 15_000 });
});

test("Transactions - creation depense CNY: une seule ligne et solde Alipay a 800 CNY", async ({ page }) => {
  const alipay = account("Alipay Test");
  const expectedBalance = alipay.balance - 200;

  await createTransaction(page, {
    subType: /personnelle/i,
    accountName: "Alipay Test",
    amount: "200",
    currency: "CNY",
    category: "Alimentation",
    note: "QA S1 Alipay CNY",
  });

  await expect(transactionRows(page)).toHaveCount(1);

  const dbRows = await transactionsByFilter({ category: "Alimentation" });
  expect(dbRows, "La base de test doit contenir une seule transaction Alimentation.").toHaveLength(1);
  expect(Number(dbRows[0].amount), "Montant stocke attendu: 200.").toBe(200);
  expect(dbRows[0].currency, "Devise stockee attendue: CNY.").toBe("CNY");

  const actualBalance = await readAccountBalance(page, "Alipay Test");
  console.log(`Scenario 1 - Alipay attendu=${expectedBalance} CNY, actuel=${actualBalance} CNY`);
  expect(actualBalance, `Solde Alipay attendu ${expectedBalance} CNY, actuel ${actualBalance} CNY.`).toBe(expectedBalance);
});

test("Transactions - bug Divine: 118 USD reste en USD, jamais en CNY", async ({ page }) => {
  await createTransaction(page, {
    subType: /Argent client/i,
    accountName: "Mercury Test",
    amount: "118",
    currency: "USD",
    clientName: "Divine Test",
    note: "QA S2 Divine USD",
  });

  const divine = client("Divine Test");
  const dbRows = await transactionsByFilter({
    client_id: divine.id,
    sub_type: "client_money_received",
    note: "QA S2 Divine USD",
  });

  expect(dbRows, "Une seule transaction client_money_received doit etre stockee pour Divine.").toHaveLength(1);
  const stored = dbRows[0];
  console.log(`Scenario 2 - DB attendu=118 USD, actuel=${stored.amount} ${stored.currency}`);
  expect(Number(stored.amount), `Montant stocke attendu 118, actuel ${stored.amount}.`).toBe(118);
  expect(stored.currency, `BUG DEVISE: attendu USD, stocke ${stored.currency}.`).toBe("USD");

  await page.goto("/fr/clients");
  await page.waitForLoadState("networkidle");

  const divineCard = page.locator("article").filter({ hasText: "Divine Test" }).first();
  await expect(divineCard).toBeVisible();
  await expect(divineCard, "Le montant client recu doit apparaitre dans la carte Divine.").toContainText(/118/, {
    timeout: 10_000,
  });

  const expandButton = divineCard.getByRole("button", { name: /financier/i });
  await expect(expandButton).toBeVisible();
  await expandButton.click();

  const text = normalizeText((await divineCard.textContent()) ?? "");
  console.log(`Scenario 2 - affichage Divine: ${text}`);

  expect(text, `BUG DEVISE: le montant 118 n'est pas affiche pour Divine. Texte: ${text}`).toMatch(/118/);
  // Accept $ (narrow symbol, new formatMoney) or $US/USD (legacy format)
  expect(text, `BUG DEVISE: l'affichage Divine doit indiquer USD, $US ou $. Texte: ${text}`).toMatch(/USD|US\$|\$\d/i);
  expect(text, `BUG DEVISE: CNY detecte dans l'affichage Divine. Texte: ${text}`).not.toMatch(/CNY|CN\s*Y|\u00A5/i);
  expect(text, `BUG DEVISE: affichage proche de 16 USD detecte au lieu de 118 USD. Texte: ${text}`).not.toMatch(
    /16(?:[,.]\d{1,2})?\s*(?:USD|\$US|US\$|\$)/i
  );
});

// SKIP: edit functionality not yet implemented in design-v2 (no edit button in detail drawer)
test.skip("Transactions - edition: modifier 100 USD en 50 USD met a jour Comptes et Tableau de bord", async ({ page }) => {
  const mercury = account("Mercury Test");
  const afterCreateExpected = mercury.balance - 100;

  await createTransaction(page, {
    subType: /personnelle/i,
    accountName: "Mercury Test",
    amount: "100",
    currency: "USD",
    note: "QA S3 Mercury edit",
  });

  const afterCreate = await readAccountBalance(page, "Mercury Test");
  console.log(`Scenario 3 - Mercury apres creation attendu=${afterCreateExpected} USD, actuel=${afterCreate} USD`);
  expect(afterCreate, `Solde Mercury attendu ${afterCreateExpected} USD apres creation, actuel ${afterCreate} USD.`).toBe(
    afterCreateExpected
  );

  const dashboardBeforeEdit = await readDashboardPhysicalBalance(page);

  await page.goto("/fr/transactions");
  await page.waitForLoadState("networkidle");
  await openTransactionDetails(page, /QA S3 Mercury edit/);

  const editButton = page.getByRole("button", { name: /Modifier|diter|Edit/i });
  await expect(
    editButton,
    "Le scenario d'edition ne peut pas continuer: l'UI Transactions actuelle n'expose aucun bouton Modifier/Editer pour une transaction."
  ).toBeVisible();

  await editButton.click();
  await fillAmount(page, "50");
  await saveTransactionForm(page);

  const afterEditExpected = mercury.balance - 50;
  const afterEdit = await readAccountBalance(page, "Mercury Test");
  console.log(`Scenario 3 - Mercury apres edition attendu=${afterEditExpected} USD, actuel=${afterEdit} USD`);
  expect(afterEdit, `Solde Mercury attendu ${afterEditExpected} USD apres edition, actuel ${afterEdit} USD.`).toBe(
    afterEditExpected
  );

  const dashboardAfterEdit = await readDashboardPhysicalBalance(page);
  console.log(
    `Scenario 3 - Solde physique attendu=${dashboardBeforeEdit + 50} USD, actuel=${dashboardAfterEdit} USD`
  );
  expect(
    dashboardAfterEdit,
    `Solde physique stale: attendu ${dashboardBeforeEdit + 50} USD apres edition, actuel ${dashboardAfterEdit} USD.`
  ).toBeCloseTo(dashboardBeforeEdit + 50, 2);
});

test("Transactions - suppression: supprimer 30 USD restaure Comptes, Clients et Tableau de bord", async ({ page }) => {
  const mercury = account("Mercury Test");
  const dashboardOriginal = await readDashboardPhysicalBalance(page);

  await page.goto("/fr/transactions");
  await page.waitForLoadState("networkidle");
  await createTransaction(page, {
    subType: /personnelle/i,
    accountName: "Mercury Test",
    amount: "30",
    currency: "USD",
    note: "QA S4 Mercury delete",
  });

  const afterCreateExpected = mercury.balance - 30;
  const afterCreate = await readAccountBalance(page, "Mercury Test");
  console.log(`Scenario 4 - Mercury apres creation attendu=${afterCreateExpected} USD, actuel=${afterCreate} USD`);
  expect(afterCreate, `Solde Mercury attendu ${afterCreateExpected} USD apres creation, actuel ${afterCreate} USD.`).toBe(
    afterCreateExpected
  );

  await page.goto("/fr/transactions");
  await page.waitForLoadState("networkidle");
  await openTransactionDetails(page, /QA S4 Mercury delete/);
  await deleteOpenTransaction(page);

  const afterDelete = await readAccountBalance(page, "Mercury Test");
  console.log(`Scenario 4 - Mercury apres suppression attendu=${mercury.balance} USD, actuel=${afterDelete} USD`);
  expect(afterDelete, `Solde Mercury attendu ${mercury.balance} USD apres suppression, actuel ${afterDelete} USD.`).toBe(
    mercury.balance
  );

  await page.goto("/fr/clients");
  await page.waitForLoadState("networkidle");
  const divineText = normalizeText((await page.locator("article").filter({ hasText: "Divine Test" }).first().textContent()) ?? "");
  console.log(`Scenario 4 - Clients apres suppression: ${divineText}`);
  expect(divineText, "La page Clients ne doit pas conserver de trace financiere de la depense Mercury supprimee.").not.toMatch(
    /30(?:[,.]00)?\s*(?:USD|\$US|US\$|\$)/i
  );

  const dashboardAfterDelete = await readDashboardPhysicalBalance(page);
  console.log(`Scenario 4 - Solde physique attendu=${dashboardOriginal} USD, actuel=${dashboardAfterDelete} USD`);
  expect(
    dashboardAfterDelete,
    `Solde physique attendu ${dashboardOriginal} USD apres suppression, actuel ${dashboardAfterDelete} USD.`
  ).toBeCloseTo(dashboardOriginal, 2);
});

test("Transactions - double clic Enregistrer: une seule transaction Cash est creee", async ({ page }) => {
  await openCreateForm(page);
  await pickSubType(page, /personnelle/i);
  await selectFieldOption(page, /^Compte$/, "Cash Test");
  await fillAmount(page, "10");
  await fillCurrency(page, "USD");
  await fillNote(page, "QA S5 Cash double submit");

  const saveButton = page.getByRole("button", { name: /^Enregistrer$/ });
  await expect(saveButton).toBeEnabled();
  await saveButton.evaluate((button) => {
    (button as HTMLButtonElement).click();
    (button as HTMLButtonElement).click();
  });
  await expect(saveButton).toBeHidden({ timeout: 10_000 });
  await expect(transactionRows(page)).toHaveCount(1);

  const rows = await transactionsByFilter({ note: "QA S5 Cash double submit" });
  console.log(`Scenario 5 - transactions attendues=1, actuelles=${rows.length}`);
  expect(rows, `DOUBLE SUBMIT: attendu 1 transaction, actuel ${rows.length}.`).toHaveLength(1);
  expect(Number(rows[0].amount), `Montant stocke attendu 10, actuel ${rows[0]?.amount}.`).toBe(10);
  expect(rows[0].currency, `Devise stockee attendue USD, actuelle ${rows[0]?.currency}.`).toBe("USD");
});

async function createTransaction(
  page: Page,
  input: {
    subType: RegExp;
    accountName: string;
    amount: string;
    currency: string;
    category?: string;
    clientName?: string;
    note?: string;
  }
) {
  await openCreateForm(page);
  await pickSubType(page, input.subType);
  await selectFieldOption(page, /^Compte$/, input.accountName);
  await fillAmount(page, input.amount);
  await fillCurrency(page, input.currency);
  if (input.clientName) await selectFieldOption(page, /^Client$/, input.clientName);
  if (input.category) await selectFieldOption(page, /^Cat.gorie$/, input.category);
  if (input.note) await fillNote(page, input.note);
  await saveTransactionForm(page);
}

async function openCreateForm(page: Page) {
  await page.getByRole("button", { name: /Nouvelle transaction/i }).click();
  await expect(page.locator('input[placeholder*="Rechercher"]')).toBeVisible();
}

async function pickSubType(page: Page, name: RegExp) {
  const button = page.locator("button").filter({ hasText: name }).first();
  await expect(button, `Type d'operation introuvable: ${name}`).toBeVisible();
  await button.click();
  await expect(page.getByRole("button", { name: /^Enregistrer$/ })).toBeVisible();
}

async function selectFieldOption(page: Page, label: RegExp, optionText: string) {
  const select = fieldContainer(page, label).locator("select").first();
  await expect(select, `Select introuvable pour le champ ${label}`).toBeVisible();

  const optionValue = await select.evaluate((element, wantedText) => {
    const selectElement = element as HTMLSelectElement;
    const match = Array.from(selectElement.options).find((option) =>
      option.textContent?.toLowerCase().includes(String(wantedText).toLowerCase())
    );
    return match?.value ?? null;
  }, optionText);

  expect(optionValue, `Option "${optionText}" introuvable pour le champ ${label}.`).toBeTruthy();
  await select.selectOption(optionValue!);
}

async function fillAmount(page: Page, value: string) {
  const amountInput = fieldContainer(page, /^Montant$/).locator('input[type="number"]').first();
  await amountInput.fill(value);
}

async function fillCurrency(page: Page, value: string) {
  const currencyInput = fieldContainer(page, /^Montant$/).locator('input[type="text"][maxlength="4"]').first();
  await currencyInput.fill(value);
}

async function fillNote(page: Page, value: string) {
  const noteInput = fieldContainer(page, /^Note/).locator("input").first();
  await noteInput.fill(value);
}

async function saveTransactionForm(page: Page) {
  const saveButton = page.getByRole("button", { name: /Enregistr/ });
  await expect(saveButton).toBeEnabled();
  await saveButton.click();
  await expect(saveButton).toBeHidden({ timeout: 30_000 });
  // NB: /fr/transactions fires continuous Supabase requests — skip networkidle.
}

function fieldContainer(page: Page, label: RegExp): Locator {
  return page.locator("label").filter({ hasText: label }).first().locator("..");
}

function transactionRows(page: Page): Locator {
  return page.locator("main ul.divide-y > li");
}

async function openTransactionDetails(page: Page, rowText: RegExp) {
  const row = transactionRows(page).filter({ hasText: rowText }).first();
  await expect(row, `Transaction introuvable dans la liste: ${rowText}`).toBeVisible();
  await row.click();
  // Inline expansion uses "Supprimer", legacy drawer uses "Supprimer cette transaction"
  await expect(page.getByRole("button", { name: /Supprimer/i })).toBeVisible();
}

async function deleteOpenTransaction(page: Page) {
  await page.getByRole("button", { name: /Supprimer/i }).last().click();
  const confirm = page.getByRole("button", { name: /^Supprimer$/ });
  await expect(confirm).toBeVisible();
  await confirm.click();
  await expect(confirm).toBeHidden({ timeout: 10_000 });
  // NB: /fr/transactions fires continuous Supabase requests — skip networkidle.
}

async function readAccountBalance(page: Page, accountName: string): Promise<number> {
  await page.goto("/fr/accounts");
  const card = page.locator("article").filter({ hasText: accountName }).first();
  await expect(card, `Compte introuvable: ${accountName}`).toBeVisible({ timeout: 15_000 });
  return firstNumber((await card.textContent()) ?? "");
}

async function readDashboardPhysicalBalance(page: Page): Promise<number> {
  await page.goto("/fr/dashboard");
  const card = page.locator("button").filter({ hasText: /Physique/i }).first();
  await expect(card, "Carte Physique introuvable sur le dashboard.").toBeVisible({ timeout: 15_000 });
  return firstNumber((await card.textContent()) ?? "");
}

function firstNumber(text: string): number {
  const normalized = normalizeText(text);
  const match = normalized.match(/-?\d[\d\s.,]*/);
  if (!match) {
    throw new Error(`Aucun montant numerique trouve dans: ${normalized}`);
  }
  return parseLocaleNumber(match[0]);
}

function parseLocaleNumber(value: string): number {
  let cleaned = value.replace(/\s/g, "");
  const comma = cleaned.lastIndexOf(",");
  const dot = cleaned.lastIndexOf(".");

  if (comma > dot) {
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  } else {
    cleaned = cleaned.replace(/,/g, "");
  }

  const parsed = Number(cleaned.replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(parsed)) {
    throw new Error(`Montant illisible: ${value}`);
  }
  return parsed;
}

function normalizeText(text: string): string {
  return text.replace(/\u00A0/g, " ").replace(/\s+/g, " ").trim();
}

function loadKnownState(): KnownState {
  return JSON.parse(fs.readFileSync(KNOWN_STATE_PATH, "utf-8")) as KnownState;
}

function account(name: string): KnownAccount {
  const match = knownState.accounts.find((item) => item.name === name);
  if (!match) throw new Error(`Compte absent de known-state.json: ${name}`);
  return match;
}

function client(name: string): KnownClient {
  const match = knownState.clients.find((item) => item.name === name);
  if (!match) throw new Error(`Client absent de known-state.json: ${name}`);
  return match;
}

async function transactionsByFilter(filter: Record<string, string>) {
  const db = createTestAdminClient();
  let query = db.from("transactions").select("*").eq("user_id", knownState.test_user.id);

  for (const [key, value] of Object.entries(filter)) {
    query = query.eq(key, value);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Erreur lecture transactions test: ${error.message}`);
  return data ?? [];
}
