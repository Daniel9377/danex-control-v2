import { expect, type Page, test } from "@playwright/test";
import {
  fillFieldInput,
  knownClient,
  normalizeText,
  saveByName,
  seedAndLogin,
  selectFieldOption,
  singleRow,
  tableRows,
  type KnownState,
} from "../helpers/e2e-utils";

test.describe.configure({ mode: "serial" });

let state: KnownState;

test.beforeEach(async ({ page }) => {
  state = await seedAndLogin(page, "/fr/orders");
});

test("Commandes - creer Test Product pour Divine avec avance 118 USD", async ({ page }) => {
  const divine = knownClient(state, "Divine Test");

  await createOrder(page, {
    clientName: "Divine Test",
    productName: "Test Product",
    currency: "USD",
    advance: "118",
  });

  const order = await singleRow(state, "orders", { product_name: "Test Product" });
  console.log(`Commandes S1 - avance attendue=118 USD, actuelle=${order.advance_received} ${order.currency}`);
  expect(order.client_id, "La commande doit etre liee a Divine Test.").toBe(divine.id);
  expect(Number(order.advance_received), `Avance attendue 118, actuelle ${order.advance_received}.`).toBe(118);
  expect(order.currency, `Devise attendue USD, actuelle ${order.currency}.`).toBe("USD");
  await expect(page.locator("article").filter({ hasText: "Test Product" }).first()).toBeVisible();
});

test("Commandes - action rapide Achat cree une transaction liee a la commande", async ({ page }) => {
  await createOrder(page, {
    clientName: "Divine Test",
    productName: "Quick Action Product",
    currency: "USD",
    advance: "118",
  });
  const order = await singleRow(state, "orders", { product_name: "Quick Action Product" });

  await openOrderDetails(page, "Quick Action Product");
  const card = orderCard(page, "Quick Action Product");
  await expect(card.locator("button").filter({ hasText: /Argent re.u/i }).first()).toBeVisible();
  await expect(card.locator("button").filter({ hasText: /^Achat$/ }).first()).toBeVisible();
  await expect(card.locator("button").filter({ hasText: /^Frais$/ }).first()).toBeVisible();

  await createOrderQuickTransaction(page, {
    productName: "Quick Action Product",
    actionLabel: /^Achat$/,
    accountName: "Mercury Test",
    amount: "80",
    clientName: "Divine Test",
    note: "QA ORDER ACHAT 80",
  });

  const txRows = await tableRows(state, "transactions", {
    order_id: order.id,
    sub_type: "client_product_purchase",
    note: "QA ORDER ACHAT 80",
  });
  console.log(`Commandes S2 - transactions Achat liees attendues=1, actuelles=${txRows.length}`);
  expect(txRows, "Une transaction Achat doit etre liee a la commande.").toHaveLength(1);
  expect(Number(txRows[0].amount), `Montant Achat attendu 80, actuel ${txRows[0]?.amount}.`).toBe(80);
  expect(txRows[0].currency, `Devise Achat attendue USD, actuelle ${txRows[0]?.currency}.`).toBe("USD");
});

test("Commandes - solde commande et solde client suivent recu moins achat", async ({ page }) => {
  await createOrder(page, {
    clientName: "Divine Test",
    productName: "Balance Product",
    currency: "USD",
    advance: "118",
  });

  await createOrderQuickTransaction(page, {
    productName: "Balance Product",
    actionLabel: /Argent re.u/i,
    accountName: "Mercury Test",
    amount: "118",
    clientName: "Divine Test",
    note: "QA ORDER RECEIVED 118",
  });

  await createOrderQuickTransaction(page, {
    productName: "Balance Product",
    actionLabel: /^Achat$/,
    accountName: "Mercury Test",
    amount: "80",
    clientName: "Divine Test",
    note: "QA ORDER PURCHASE 80",
  });

  await page.goto("/fr/orders");
  await page.waitForLoadState("networkidle");
  await openOrderDetails(page, "Balance Product");
  const orderText = normalizeText((await orderCard(page, "Balance Product").textContent()) ?? "");
  console.log(`Commandes S3 - affichage commande: ${orderText}`);
  expect(orderText, "La commande doit afficher le recu 118.").toMatch(/118/);
  expect(orderText, "La commande doit afficher l'achat 80.").toMatch(/80/);
  expect(orderText, "Le solde commande attendu est 38 USD.").toMatch(/38/);

  await page.goto("/fr/clients");
  await page.waitForLoadState("networkidle");
  const divineCard = page.locator("article").filter({ hasText: "Divine Test" }).first();
  await expect(divineCard).toBeVisible();
  const clientText = normalizeText((await divineCard.textContent()) ?? "");
  console.log(`Commandes S3 - affichage client Divine: ${clientText}`);
  expect(clientText, "Divine doit afficher le total recu 118.").toMatch(/118/);
  expect(clientText, "Divine doit afficher le solde attendu 38 USD.").toMatch(/38/);
});

test("Commandes - statut nouveau puis sourcing puis commande persiste au rechargement", async ({ page }) => {
  await createOrder(page, {
    clientName: "Divine Test",
    productName: "Status Product",
    currency: "USD",
    advance: "0",
  });

  await updateOrderStatus(page, "Status Product", "En recherche");
  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(orderCard(page, "Status Product"), "Le statut sourcing doit etre visible apres rechargement.").toContainText(
    /En recherche|sourcing/i
  );

  await updateOrderStatus(page, "Status Product", "Commande");
  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(orderCard(page, "Status Product"), "Le statut ordered doit etre visible apres rechargement.").toContainText(
    /Command/i
  );

  const order = await singleRow(state, "orders", { product_name: "Status Product" });
  console.log(`Commandes S4 - statut attendu=ordered, actuel=${order.status}`);
  expect(order.status, `Statut DB attendu ordered, actuel ${order.status}.`).toBe("ordered");
});

test("Commandes - double clic Sauvegarder cree une seule commande", async ({ page }) => {
  await openOrderForm(page);
  await selectFieldOption(page, /^Client$/, "Divine Test");
  await fillFieldInput(page, /^Produit$/, "Double Submit Order");

  const saveButton = page.getByRole("button", { name: /^Sauvegarder$/ });
  await expect(saveButton).toBeEnabled();
  await saveButton.evaluate((button) => {
    (button as HTMLButtonElement).click();
    (button as HTMLButtonElement).click();
  });
  await expect(saveButton).toBeHidden({ timeout: 10_000 });
  await page.waitForLoadState("networkidle");

  const rows = await tableRows(state, "orders", { product_name: "Double Submit Order" });
  console.log(`Commandes S5 - commandes attendues=1, actuelles=${rows.length}`);
  expect(rows, `DOUBLE SUBMIT: attendu 1 commande, actuel ${rows.length}.`).toHaveLength(1);
});

async function createOrder(
  page: Page,
  input: { clientName: string; productName: string; currency: string; advance: string }
) {
  await page.goto("/fr/orders");
  await page.waitForLoadState("networkidle");
  await openOrderForm(page);
  await selectFieldOption(page, /^Client$/, input.clientName);
  await fillFieldInput(page, /^Produit$/, input.productName);
  await selectFieldOption(page, /^Devise$/, input.currency);
  await fillFieldInput(page, /^Avance/, input.advance, 'input[type="number"]');
  await saveByName(page, /^Sauvegarder$/);
  await expect(orderCard(page, input.productName)).toBeVisible();
}

async function openOrderForm(page: Page) {
  await page.getByRole("button", { name: /Nouvelle commande/i }).click();
  await expect(page.getByRole("button", { name: /^Sauvegarder$/ })).toBeVisible();
}

function orderCard(page: Page, productName: string) {
  return page.locator("article").filter({ hasText: productName }).first();
}

async function openOrderDetails(page: Page, productName: string) {
  const card = orderCard(page, productName);
  await expect(card).toBeVisible();
  const detailButton = card.getByRole("button", { name: /Voir d.tail/i });
  await expect(detailButton).toBeVisible();
  await detailButton.click();
}

async function createOrderQuickTransaction(
  page: Page,
  input: {
    productName: string;
    actionLabel: RegExp;
    accountName: string;
    amount: string;
    clientName: string;
    note: string;
  }
) {
  await page.goto("/fr/orders");
  await page.waitForLoadState("networkidle");
  await openOrderDetails(page, input.productName);
  const card = orderCard(page, input.productName);
  const action = card.locator("button").filter({ hasText: input.actionLabel }).first();
  await expect(action, `Action rapide introuvable: ${input.actionLabel}`).toBeVisible();
  await action.click();

  await expect(page.getByRole("button", { name: /^Enregistrer$/ })).toBeVisible();
  await selectFieldOption(page, /^Compte$/, input.accountName);
  await fillFieldInput(page, /^Montant$/, input.amount, 'input[type="number"]');
  await fillFieldInput(page, /^Montant$/, "USD", 'input[type="text"][maxlength="4"]');
  await selectFieldOption(page, /^Client$/, input.clientName);
  await selectFieldOption(page, /^Commande/, input.productName);
  await fillFieldInput(page, /^Note/, input.note);
  await saveByName(page, /^Enregistrer$/);
}

async function updateOrderStatus(page: Page, productName: string, statusLabel: string) {
  await page.goto("/fr/orders");
  await page.waitForLoadState("networkidle");
  const card = orderCard(page, productName);
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: /^Modifier$/ }).click();
  await selectFieldOption(page, /^Statut$/, statusLabel);
  await saveByName(page, /^Sauvegarder$/);
}
