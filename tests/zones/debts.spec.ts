import { expect, type Page, test } from "@playwright/test";
import {
  fieldContainer,
  fillFieldInput,
  knownAccount,
  knownDebt,
  normalizeText,
  readAccountBalance,
  saveByName,
  seedAndLogin,
  selectFieldOption,
  tableRows,
  type KnownState,
} from "../helpers/e2e-utils";

test.describe.configure({ mode: "serial", timeout: 90_000 });

let state: KnownState;

test.beforeEach(async ({ page }) => {
  state = await seedAndLogin(page, "/fr/debts");
});

test("Dettes - Jean-Luc existe et paiement partiel 100 USD laisse 200 USD", async ({ page }) => {
  const seedDebt = knownDebt(state, "Jean-Luc Test");
  const mercury = knownAccount(state, "Mercury Test");
  expect(seedDebt.remaining_amount, "La seed doit demarrer Jean-Luc a 300 USD restant.").toBe(300);

  await payDebt(page, "Jean-Luc Test", "100", "Mercury Test", "QA DEBT PARTIAL 100");

  const rows = await tableRows(state, "debts", { person_name: "Jean-Luc Test" });
  expect(rows).toHaveLength(1);
  const remaining = Number(rows[0].amount) - Number(rows[0].paid_amount);
  console.log(`Dettes S1 - restant attendu=200, actuel=${remaining}; statut attendu=partial, actuel=${rows[0].status}`);
  expect(remaining, `Restant attendu 200, actuel ${remaining}.`).toBe(200);
  expect(rows[0].status, `Statut attendu partial, actuel ${rows[0].status}.`).toBe("partial");

  const actualMercury = await readAccountBalance(page, "Mercury Test");
  const expectedMercury = mercury.balance - 100;
  console.log(`Dettes S1 - Mercury attendu=${expectedMercury}, actuel=${actualMercury}`);
  expect(actualMercury, `Mercury attendu ${expectedMercury} USD, actuel ${actualMercury} USD.`).toBe(expectedMercury);
});

test("Dettes - payer les 200 USD restants marque Jean-Luc comme paye", async ({ page }) => {
  const mercury = knownAccount(state, "Mercury Test");

  await payDebt(page, "Jean-Luc Test", "100", "Mercury Test", "QA DEBT PAY FIRST");
  await payDebt(page, "Jean-Luc Test", "200", "Mercury Test", "QA DEBT PAY REST");

  const rows = await tableRows(state, "debts", { person_name: "Jean-Luc Test" });
  expect(rows).toHaveLength(1);
  const remaining = Number(rows[0].amount) - Number(rows[0].paid_amount);
  console.log(`Dettes S2 - restant attendu=0, actuel=${remaining}; statut attendu=paid, actuel=${rows[0].status}`);
  expect(remaining, `Restant attendu 0, actuel ${remaining}.`).toBe(0);
  expect(rows[0].status, `Statut attendu paid, actuel ${rows[0].status}.`).toBe("paid");

  const actualMercury = await readAccountBalance(page, "Mercury Test");
  const expectedMercury = mercury.balance - 300;
  console.log(`Dettes S2 - Mercury attendu=${expectedMercury}, actuel=${actualMercury}`);
  expect(actualMercury, `Mercury attendu ${expectedMercury} USD, actuel ${actualMercury} USD.`).toBe(expectedMercury);
});

test("Dettes - creer une creance 150 USD apparait dans Creances a recevoir", async ({ page }) => {
  await page.getByRole("button", { name: /Mes cr.ances/i }).click();
  await page.getByRole("button", { name: /Nouvelle entr/i }).click();
  await fillFieldInput(page, /^Personne$/, "Marc Receivable Test");
  await fillFieldInput(page, /^Montant$/, "150", 'input[type="number"]');
  await selectFieldOption(page, /^Devise$/, "USD");
  await fillFieldInput(page, /^Note/, "QA RECEIVABLE 150");
  await saveByName(page, /^Sauvegarder$/, /Sauvegarde/);

  const rows = await tableRows(state, "debts", { person_name: "Marc Receivable Test" });
  expect(rows, "La creance Marc doit etre creee en base.").toHaveLength(1);
  expect(rows[0].direction, `Direction attendue owes_me, actuelle ${rows[0]?.direction}.`).toBe("owes_me");
  expect(Number(rows[0].amount), `Montant attendu 150, actuel ${rows[0]?.amount}.`).toBe(150);

  await page.goto("/fr/dashboard");
  await page.waitForLoadState("networkidle");
  const receivableCard = page.locator("button").filter({ hasText: /Cr.ances . recevoir/i }).first();
  await expect(receivableCard, "Carte Creances a recevoir introuvable sur le dashboard.").toBeVisible();
  const text = normalizeText((await receivableCard.textContent()) ?? "");
  console.log(`Dettes S3 - dashboard creances attendu=150 USD, actuel=${text}`);
  expect(text, "Le dashboard doit afficher la creance de 150 USD.").toMatch(/150/);
});

test("Dettes - double clic paiement cree un seul paiement", async ({ page }) => {
  await openPaymentForm(page, "Jean-Luc Test");
  await fillFieldInput(page, /^Montant$/, "50", 'input[type="number"]');
  await selectFieldOption(page, /Compte/, "Mercury Test");
  await fillFieldInput(page, /^Note/, "QA DEBT DOUBLE PAYMENT");

  const saveButton = page.getByRole("button", { name: /^Sauvegarder$/ });
  await expect(saveButton).toBeEnabled();
  await saveButton.evaluate((button) => {
    (button as HTMLButtonElement).click();
    (button as HTMLButtonElement).click();
  });
  await expect(saveButton).toBeHidden({ timeout: 10_000 });
  await page.waitForLoadState("networkidle");

  const debt = (await tableRows(state, "debts", { person_name: "Jean-Luc Test" }))[0];
  const payments = await tableRows(state, "debt_payments", { debt_id: debt.id });
  const remaining = Number(debt.amount) - Number(debt.paid_amount);
  console.log(`Dettes S4 - paiements attendus=1, actuels=${payments.length}; restant attendu=250, actuel=${remaining}`);
  expect(payments, `DOUBLE SUBMIT: attendu 1 paiement, actuel ${payments.length}.`).toHaveLength(1);
  expect(remaining, `Restant attendu 250 apres un paiement de 50, actuel ${remaining}.`).toBe(250);
});

async function payDebt(page: Page, personName: string, amount: string, accountName: string, note: string) {
  await openPaymentForm(page, personName);
  await fillFieldInput(page, /^Montant$/, amount, 'input[type="number"]');
  await selectFieldOption(page, /Compte/, accountName);
  await fillFieldInput(page, /^Note/, note);
  await saveByName(page, /^Sauvegarder$/, /Sauvegarde/);
}

async function openPaymentForm(page: Page, personName: string) {
  await page.goto("/fr/debts");
  const card = debtCard(page, personName);
  await expect(card).toBeVisible();
  const button = card.getByRole("button", { name: /Ajouter un paiement/i });
  await expect(button).toBeVisible();
  await button.click();
  const amountInput = fieldContainer(page, /^Montant$/).locator('input[type="number"]').first();
  await expect(amountInput).toBeVisible();
}

function debtCard(page: Page, personName: string) {
  return page.locator("article").filter({ hasText: personName }).first();
}
