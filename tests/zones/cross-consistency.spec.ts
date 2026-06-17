import { expect, type Page, test } from "@playwright/test";
import {
  createTransactionUi,
  fieldContainer,
  fillFieldInput,
  firstMoneyNumber,
  knownAccount,
  knownClient,
  normalizeText,
  readAccountBalance,
  readDashboardPhysicalBalance,
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

test("Coherence - Divine affiche le meme 118 USD partout", async ({ page }) => {
  const divine = knownClient(state, "Divine Test");
  const mercury = knownAccount(state, "Mercury Test");

  await createOrder(page, "Divine Test", "Divine Consistency Order", "118");
  const order = (await tableRows(state, "orders", { product_name: "Divine Consistency Order" }))[0];

  await createTransactionUi(page, {
    subType: /Argent client re.u/i,
    accountName: "Mercury Test",
    amount: "118",
    currency: "USD",
    clientName: "Divine Test",
    orderName: "Divine Consistency Order",
    note: "QA CROSS DIVINE 118",
  });

  const txRows = await tableRows(state, "transactions", {
    client_id: divine.id,
    order_id: order.id,
    sub_type: "client_money_received",
    note: "QA CROSS DIVINE 118",
  });
  expect(txRows, "Une seule transaction 118 USD doit exister pour Divine et la commande.").toHaveLength(1);

  const clientText = await divineClientText(page);
  const orderText = await orderDetailText(page, "Divine Consistency Order");
  const dashboardClientHeld = await readDashboardCardValue(page, /Argent client d.tenu/i);
  const mercuryBalance = await readAccountBalance(page, "Mercury Test");

  console.log(`Cross S1 - DB attendu=118 USD, actuel=${txRows[0].amount} ${txRows[0].currency}`);
  console.log(`Cross S1 - Clients Divine: ${clientText}`);
  console.log(`Cross S1 - Commande Divine: ${orderText}`);
  console.log(`Cross S1 - Dashboard Argent client attendu=118, actuel=${dashboardClientHeld}`);
  console.log(`Cross S1 - Mercury attendu=${mercury.balance + 118}, actuel=${mercuryBalance}`);

  expect(Number(txRows[0].amount), `DB attendue 118, actuelle ${txRows[0]?.amount}.`).toBe(118);
  expect(txRows[0].currency, `DB attendue USD, actuelle ${txRows[0]?.currency}.`).toBe("USD");
  expect(clientText, `Clients: Divine doit afficher 118 USD. Texte: ${clientText}`).toMatch(/118/);
  expect(clientText, `Clients: Divine doit afficher USD ou $US. Texte: ${clientText}`).toMatch(/USD|\$US|US\$/i);
  expect(orderText, `Orders: la commande liee doit afficher 118 USD. Texte: ${orderText}`).toMatch(/118/);
  expect(orderText, `Orders: la commande liee doit afficher USD ou $US. Texte: ${orderText}`).toMatch(/USD|\$US|US\$/i);
  expect(dashboardClientHeld, `Dashboard attendu 118 USD, actuel ${dashboardClientHeld} USD.`).toBeCloseTo(118, 2);
  expect(mercuryBalance, `Mercury attendu ${mercury.balance + 118} USD, actuel ${mercuryBalance} USD.`).toBe(
    mercury.balance + 118
  );
});

test("Coherence - transfert conserve le total source plus destination et le dashboard", async ({ page }) => {
  const mercury = knownAccount(state, "Mercury Test");
  const cash = knownAccount(state, "Cash Test");
  const expectedPairTotal = mercury.balance + cash.balance;
  const dashboardBefore = await readDashboardPhysicalBalance(page);

  await createTransfer(page, "Mercury Test", "Cash Test", "100", "QA CROSS TRANSFER");

  const mercuryAfter = await readAccountBalance(page, "Mercury Test");
  const cashAfter = await readAccountBalance(page, "Cash Test");
  const pairTotalAfter = mercuryAfter + cashAfter;
  const dashboardAfter = await readDashboardPhysicalBalance(page);

  console.log(`Cross S2 - total Mercury+Cash attendu=${expectedPairTotal}, actuel=${pairTotalAfter}`);
  console.log(`Cross S2 - Solde physique dashboard avant=${dashboardBefore}, apres=${dashboardAfter}`);
  expect(mercuryAfter, `Mercury attendu ${mercury.balance - 100}, actuel ${mercuryAfter}.`).toBe(mercury.balance - 100);
  expect(cashAfter, `Cash attendu ${cash.balance + 100}, actuel ${cashAfter}.`).toBe(cash.balance + 100);
  expect(pairTotalAfter, `Total source+destination attendu ${expectedPairTotal}, actuel ${pairTotalAfter}.`).toBe(
    expectedPairTotal
  );
  expect(dashboardAfter, `Solde physique doit rester ${dashboardBefore}, actuel ${dashboardAfter}.`).toBeCloseTo(
    dashboardBefore,
    2
  );
});

test("Coherence - paiement dette aligne compte dette restante et dashboard", async ({ page }) => {
  const mercury = knownAccount(state, "Mercury Test");

  await payDebt(page, "Jean-Luc Test", "100", "Mercury Test", "QA CROSS DEBT 100");

  const mercuryAfter = await readAccountBalance(page, "Mercury Test");
  const debtRows = await tableRows(state, "debts", { person_name: "Jean-Luc Test" });
  expect(debtRows).toHaveLength(1);
  const remaining = Number(debtRows[0].amount) - Number(debtRows[0].paid_amount);
  const dashboardDebt = await readDashboardCardValue(page, /Dettes . payer/i);

  console.log(`Cross S3 - Mercury attendu=${mercury.balance - 100}, actuel=${mercuryAfter}`);
  console.log(`Cross S3 - Dette restante attendue=200, actuelle=${remaining}`);
  console.log(`Cross S3 - Dashboard Dettes a payer attendu=200, actuel=${dashboardDebt}`);
  expect(mercuryAfter, `Mercury attendu ${mercury.balance - 100}, actuel ${mercuryAfter}.`).toBe(mercury.balance - 100);
  expect(remaining, `Dette restante attendue 200, actuelle ${remaining}.`).toBe(200);
  expect(debtRows[0].status, `Statut attendu partial, actuel ${debtRows[0].status}.`).toBe("partial");
  expect(dashboardDebt, `Dashboard Dettes a payer attendu 200 USD, actuel ${dashboardDebt} USD.`).toBeCloseTo(200, 2);
});

async function createOrder(page: Page, clientName: string, productName: string, advance: string) {
  await page.goto("/fr/orders");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /Nouvelle commande/i }).click();
  await selectFieldOption(page, /^Client$/, clientName);
  await fillFieldInput(page, /^Produit$/, productName);
  await selectFieldOption(page, /^Devise$/, "USD");
  await fillFieldInput(page, /^Avance/, advance, 'input[type="number"]');
  await saveByName(page, /^Sauvegarder$/, /Sauvegarde/);
  await expect(page.locator("article").filter({ hasText: productName }).first()).toBeVisible();
}

async function divineClientText(page: Page) {
  await page.goto("/fr/clients");
  await page.waitForLoadState("networkidle");
  const card = page.locator("article").filter({ hasText: "Divine Test" }).first();
  await expect(card).toBeVisible();
  const expand = card.getByRole("button", { name: /financier/i });
  await expect(expand).toBeVisible();
  await expand.click();
  return normalizeText((await card.textContent()) ?? "");
}

async function orderDetailText(page: Page, productName: string) {
  await page.goto("/fr/orders");
  await page.waitForLoadState("networkidle");
  const card = page.locator("article").filter({ hasText: productName }).first();
  await expect(card).toBeVisible();
  const details = card.getByRole("button", { name: /Voir d.tail/i });
  await expect(details).toBeVisible();
  await details.click();
  return normalizeText((await card.textContent()) ?? "");
}

async function readDashboardCardValue(page: Page, label: RegExp) {
  await page.goto("/fr/dashboard");
  const card = page.locator("button").filter({ hasText: label }).first();
  await expect(card, `Carte dashboard introuvable: ${label}`).toBeVisible({ timeout: 15_000 });
  return firstMoneyNumber((await card.textContent()) ?? "");
}

async function createTransfer(page: Page, from: string, to: string, amount: string, note: string) {
  await page.goto("/fr/transfers");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /Nouveau transfert/i }).click();
  await selectFieldOption(page, /^De$/, from);
  await selectFieldOption(page, /^Vers$/, to);
  await fillFieldInput(page, /envoy/i, amount, 'input[type="number"]');
  await fillFieldInput(page, /^Note/, note);
  await saveByName(page, /^Sauvegarder$/, /Sauvegarde/);
}

async function payDebt(page: Page, personName: string, amount: string, accountName: string, note: string) {
  await page.goto("/fr/debts");
  await page.waitForLoadState("networkidle");
  const card = page.locator("article").filter({ hasText: personName }).first();
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: /Ajouter un paiement/i }).click();
  await expect(fieldContainer(page, /^Montant$/).locator('input[type="number"]').first()).toBeVisible();
  await fillFieldInput(page, /^Montant$/, amount, 'input[type="number"]');
  await selectFieldOption(page, /Compte/, accountName);
  await fillFieldInput(page, /^Note/, note);
  await saveByName(page, /^Sauvegarder$/, /Sauvegarde/);
}
