import { expect, type Locator, type Page } from "@playwright/test";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { createTestAdminClient } from "../config/test-db";
import { loginAsTestUser } from "./auth";

export type KnownAccount = {
  id: string;
  name: string;
  currency: string;
  balance: number;
  type: string;
  availability: string;
};

export type KnownClient = {
  id: string;
  name: string;
  city: string | null;
  trust_level: string;
};

export type KnownDebt = {
  id: string;
  person_name: string;
  direction: string;
  amount: number;
  paid_amount: number;
  remaining_amount: number;
  currency: string;
  status: string;
};

export type KnownState = {
  test_user: { id: string; email: string };
  accounts: KnownAccount[];
  clients: KnownClient[];
  debts: KnownDebt[];
  known_balances: Record<string, number>;
};

const KNOWN_STATE_PATH = path.resolve(process.cwd(), "tests/seed/known-state.json");

export async function seedAndLogin(page: Page, route: string): Promise<KnownState> {
  execSync("npx tsx tests/seed/seed-test-db.ts", {
    cwd: process.cwd(),
    stdio: "pipe",
  });
  const state = loadKnownState();
  await loginAsTestUser(page);
  await page.goto(route);
  await page.waitForLoadState("networkidle");
  return state;
}

export function loadKnownState(): KnownState {
  return JSON.parse(fs.readFileSync(KNOWN_STATE_PATH, "utf-8")) as KnownState;
}

export function knownAccount(state: KnownState, name: string): KnownAccount {
  const match = state.accounts.find((item) => item.name === name);
  if (!match) throw new Error(`Compte absent de known-state.json: ${name}`);
  return match;
}

export function knownClient(state: KnownState, name: string): KnownClient {
  const match = state.clients.find((item) => item.name === name);
  if (!match) throw new Error(`Client absent de known-state.json: ${name}`);
  return match;
}

export function knownDebt(state: KnownState, personName: string): KnownDebt {
  const match = state.debts.find((item) => item.person_name === personName);
  if (!match) throw new Error(`Dette absente de known-state.json: ${personName}`);
  return match;
}

export function fieldContainer(page: Page, label: RegExp): Locator {
  return page.locator("label").filter({ hasText: label }).first().locator("..");
}

export async function fillFieldInput(page: Page, label: RegExp, value: string, selector = "input") {
  const input = fieldContainer(page, label).locator(selector).first();
  await expect(input, `Champ introuvable: ${label}`).toBeVisible();
  await input.fill(value);
}

export async function selectFieldOption(page: Page, label: RegExp, optionText: string) {
  const select = fieldContainer(page, label).locator("select").first();
  await expect(select, `Select introuvable pour le champ ${label}`).toBeVisible();

  const optionValue = await select.evaluate((element, wantedText) => {
    const selectElement = element as HTMLSelectElement;
    const lowerWanted = String(wantedText).toLowerCase();
    const match = Array.from(selectElement.options).find((option) =>
      option.textContent?.toLowerCase().includes(lowerWanted)
    );
    return match?.value ?? null;
  }, optionText);

  expect(optionValue, `Option "${optionText}" introuvable pour le champ ${label}.`).toBeTruthy();
  await select.selectOption(optionValue!);
}

export async function saveByName(
  page: Page,
  name: RegExp = /^(Sauvegarder|Enregistrer)$/,
  /** Regex that also matches the button during submission (text/aria-label changes).
   *  e.g. "Enregistrer" → "Enregistrement…", "Appliquer" → "Application…",
   *       "Sauvegarder" → "Sauvegarde en cours".
   *  When omitted the original name is used, which may cause toBeHidden to pass
   *  prematurely if the accessible name changes on click. */
  submittingName?: RegExp
) {
  // Match both normal and submitting states so toBeHidden only resolves
  // when the button is actually removed from the DOM (modal closed), not
  // when the text merely changes during processing.
  const locatorName = submittingName ?? name;
  const saveButton = page.getByRole("button", { name: locatorName });
  await expect(saveButton).toBeEnabled();
  await saveButton.click();
  await expect(saveButton).toBeHidden({ timeout: 10_000 });
  await page.waitForLoadState("networkidle");
}

export async function createClientUi(page: Page, name: string, city = "Lubumbashi") {
  await page.goto("/fr/clients");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /Nouveau client/i }).click();
  await fillFieldInput(page, /^Nom$/, name);
  await fillFieldInput(page, /^Ville$/, city);
  await saveByName(page, /^Sauvegarder$/, /Sauvegarde/);
  await expect(page.locator("article").filter({ hasText: name }).first()).toBeVisible();
}

export async function createAccountUi(
  page: Page,
  input: { name: string; currency: string; balance?: string; typeLabel?: RegExp; availabilityLabel?: RegExp }
) {
  await page.goto("/fr/accounts");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /Nouveau compte/i }).click();
  await fillFieldInput(page, /^Nom du compte$/, input.name);
  const form = page.locator("form").first();
  if (input.typeLabel) await form.locator("button").filter({ hasText: input.typeLabel }).first().click();
  if (input.availabilityLabel) await form.locator("button").filter({ hasText: input.availabilityLabel }).first().click();
  await selectFieldOption(page, /^Devise$/, input.currency);
  await fillFieldInput(page, /^Solde initial$/, input.balance ?? "0", 'input[type="number"]');
  await saveByName(page, /^Sauvegarder$/, /Sauvegarde/);
  await expect(page.locator("article").filter({ hasText: input.name }).first()).toBeVisible();
}

export async function createTransactionUi(
  page: Page,
  input: {
    subType: RegExp;
    accountName: string;
    amount: string;
    currency: string;
    category?: string;
    clientName?: string;
    orderName?: string;
    note?: string;
  }
) {
  await page.goto("/fr/transactions");
  await page.waitForLoadState("networkidle");
  await openTransactionCreateForm(page);
  await pickTransactionSubType(page, input.subType);
  await selectFieldOption(page, /^Compte$/, input.accountName);
  await fillFieldInput(page, /^Montant$/, input.amount, 'input[type="number"]');
  await fillFieldInput(page, /^Montant$/, input.currency, 'input[type="text"][maxlength="4"]');
  if (input.clientName) await selectFieldOption(page, /^Client$/, input.clientName);
  if (input.orderName) await selectFieldOption(page, /^Commande/, input.orderName);
  if (input.category) await selectFieldOption(page, /^Cat.gorie$/, input.category);
  if (input.note) await fillFieldInput(page, /^Note/, input.note);
  await saveByName(page, /^Enregistrer$/, /Enregistr/);
}

export async function openTransactionCreateForm(page: Page) {
  await page.getByRole("button", { name: /Nouvelle transaction/i }).click();
  await expect(page.locator('input[placeholder*="Rechercher"]')).toBeVisible();
}

export async function pickTransactionSubType(page: Page, name: RegExp) {
  const button = page.locator("button").filter({ hasText: name }).first();
  await expect(button, `Type d'operation introuvable: ${name}`).toBeVisible();
  await button.click();
  await expect(page.getByRole("button", { name: /^Enregistrer$/ })).toBeVisible();
}

export async function openTransactionDetails(page: Page, rowText: RegExp) {
  await page.goto("/fr/transactions");
  await page.waitForLoadState("networkidle");
  const row = transactionRows(page).filter({ hasText: rowText }).first();
  await expect(row, `Transaction introuvable dans la liste: ${rowText}`).toBeVisible();
  await row.click();
  await expect(page.getByRole("button", { name: /Supprimer cette transaction/i })).toBeVisible();
}

export async function deleteOpenTransaction(page: Page) {
  await page.getByRole("button", { name: /Supprimer cette transaction/i }).click();
  const confirm = page.getByRole("button", { name: /^Supprimer$/ });
  await expect(confirm).toBeVisible();
  await confirm.click();
  await expect(confirm).toBeHidden({ timeout: 10_000 });
  await page.waitForLoadState("networkidle");
}

export function transactionRows(page: Page): Locator {
  return page.locator("main ul.divide-y > li");
}

export async function readAccountBalance(page: Page, accountName: string): Promise<number> {
  await page.goto("/fr/accounts");
  await page.waitForLoadState("networkidle");
  const card = page.locator("article").filter({ hasText: accountName }).first();
  await expect(card, `Compte introuvable: ${accountName}`).toBeVisible();
  return firstMoneyNumber((await card.textContent()) ?? "");
}

export async function readDashboardPhysicalBalance(page: Page): Promise<number> {
  await page.goto("/fr/dashboard");
  await page.waitForLoadState("networkidle");
  const card = page.locator("button").filter({ hasText: /Solde physique/i }).first();
  await expect(card, "Carte Solde physique introuvable sur le dashboard.").toBeVisible();
  return firstMoneyNumber((await card.textContent()) ?? "");
}

export function firstMoneyNumber(text: string): number {
  const normalized = normalizeText(text);
  const moneyMatch =
    normalized.match(/\d[\d\s.,]*\s*(?:CNY|USD|\$US|US\$|\$|CN¥|¥)/i) ??
    normalized.match(/(?:CNY|USD|\$US|US\$|\$|CN¥|¥)\s*\d[\d\s.,]*/i);
  const match = moneyMatch ?? normalized.match(/-?\d[\d\s.,]*/);
  if (!match) throw new Error(`Aucun montant numerique trouve dans: ${normalized}`);
  return parseLocaleNumber(match[0]);
}

export function parseLocaleNumber(value: string): number {
  let cleaned = value.replace(/\s/g, "");
  const comma = cleaned.lastIndexOf(",");
  const dot = cleaned.lastIndexOf(".");

  if (comma > dot) {
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  } else {
    cleaned = cleaned.replace(/,/g, "");
  }

  const parsed = Number(cleaned.replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(parsed)) throw new Error(`Montant illisible: ${value}`);
  return parsed;
}

export function normalizeText(text: string): string {
  return text.replace(/\u00A0/g, " ").replace(/\s+/g, " ").trim();
}

export async function tableRows(state: KnownState, table: string, filter: Record<string, unknown> = {}) {
  const db = createTestAdminClient();
  let query: any = db.from(table).select("*").eq("user_id", state.test_user.id);

  for (const [key, value] of Object.entries(filter)) {
    query = query.eq(key, value as string | number | boolean | null);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Erreur lecture ${table}: ${error.message}`);
  return (data ?? []) as any[];
}

export async function singleRow(state: KnownState, table: string, filter: Record<string, unknown> = {}) {
  const rows = await tableRows(state, table, filter);
  expect(rows, `Une seule ligne attendue dans ${table} avec ${JSON.stringify(filter)}.`).toHaveLength(1);
  return rows[0];
}
