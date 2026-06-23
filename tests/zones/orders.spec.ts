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

test.describe.configure({ mode: "serial", timeout: 90_000 });

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
  await openOrderDetails(page, "Balance Product");
  const orderCardEl = orderCard(page, "Balance Product");
  // Use toContainText which retries — financial data may load asynchronously
  await expect(orderCardEl, "La commande doit afficher le recu 118.").toContainText("118");
  await expect(orderCardEl, "La commande doit afficher l'achat 80.").toContainText("80");
  await expect(orderCardEl, "Le solde commande attendu est 38.").toContainText("38");

  await page.goto("/fr/clients");
  const divineCard = page.locator("article").filter({ hasText: "Divine Test" }).first();
  await expect(divineCard).toBeVisible({ timeout: 15_000 });
  await expect(divineCard, "Divine doit afficher le total recu 118.").toContainText("118");
  await expect(divineCard, "Divine doit afficher le solde attendu 38.").toContainText("38");
});

test("Commandes - statut nouveau puis sourcing puis commande persiste au rechargement", async ({ page }) => {
  await createOrder(page, {
    clientName: "Divine Test",
    productName: "Status Product",
    currency: "USD",
    advance: "0",
  });

  await updateOrderStatus(page, "Status Product", "En recherche");
  // Let the cache invalidation propagate before reloading
  await page.waitForTimeout(500);
  await page.reload();
  await expect(orderCard(page, "Status Product")).toBeVisible({ timeout: 15_000 });
  await expect(orderCard(page, "Status Product")).toContainText(/En recherche|sourcing/i);

  await updateOrderStatus(page, "Status Product", "Commandé");
  await page.waitForTimeout(500);
  await page.reload();
  await expect(orderCard(page, "Status Product")).toBeVisible({ timeout: 15_000 });
  await expect(orderCard(page, "Status Product")).toContainText(/Command/i);

  const order = await singleRow(state, "orders", { product_name: "Status Product" });
  console.log(`Commandes S4 - statut attendu=ordered, actuel=${order.status}`);
  expect(order.status, `Statut DB attendu ordered, actuel ${order.status}.`).toBe("ordered");
});

test("Commandes - double clic Sauvegarder cree une seule commande", async ({ page }) => {
  await openOrderForm(page);
  await selectFieldOption(page, /^Client$/, "Divine Test");
  await fillFieldInput(page, /^Produit$/, "Double Submit Order");

  // Match both "Sauvegarder" and "Sauvegarde" so toBeHidden only resolves
  // when the modal actually closes, not when the button text flips.
  const saveButton = page.getByRole("button", { name: /Sauvegarde/ });
  await expect(saveButton).toBeEnabled();
  await saveButton.evaluate((button) => {
    (button as HTMLButtonElement).click();
    (button as HTMLButtonElement).click();
  });
  await expect(saveButton).toBeHidden({ timeout: 30_000 });

  const rows = await tableRows(state, "orders", { product_name: "Double Submit Order" });
  console.log(`Commandes S5 - commandes attendues=1, actuelles=${rows.length}`);
  expect(rows, `DOUBLE SUBMIT: attendu 1 commande, actuel ${rows.length}.`).toHaveLength(1);
});

async function createOrder(
  page: Page,
  input: { clientName: string; productName: string; currency: string; advance: string }
) {
  await page.goto("/fr/orders");
  await expect(page.getByRole("button", { name: /Nouvelle commande/i })).toBeVisible({ timeout: 15_000 });
  await openOrderForm(page);
  // Wait for the order form modal to hydrate the client dropdown
  await page.waitForTimeout(800);
  // Scope fields to the modal form to avoid matching page-level filter labels
  const form = page.locator("form").first();
  await selectFieldInForm(form, page, /^Client$/, input.clientName);
  await fillFieldInForm(form, page, /^Produit$/, input.productName);
  await selectFieldInForm(form, page, /^Devise$/, input.currency);
  await fillFieldInForm(form, page, /^Avance/, input.advance, 'input[type="number"]');
  await saveByName(page, /^Sauvegarder$/, /Sauvegarde/);
  await expect(orderCard(page, input.productName)).toBeVisible();
}

async function selectFieldInForm(form: ReturnType<Page['locator']>, page: Page, label: RegExp, optionText: string) {
  const select = form.locator("label").filter({ hasText: label }).first().locator("..").locator("select").first();
  await expect(select).toBeVisible();
  const optionValue = await select.evaluate((el, wanted) => {
    const s = el as HTMLSelectElement;
    const m = Array.from(s.options).find(o => o.textContent?.toLowerCase().includes(String(wanted).toLowerCase()));
    return m?.value ?? null;
  }, optionText);
  expect(optionValue, `Option "${optionText}" introuvable pour ${label}.`).toBeTruthy();
  await select.selectOption(optionValue!);
}
async function fillFieldInForm(form: ReturnType<Page['locator']>, page: Page, label: RegExp, value: string, selector = "input") {
  const input = form.locator("label").filter({ hasText: label }).first().locator("..").locator(selector).first();
  await expect(input).toBeVisible();
  await input.fill(value);
}

async function openOrderForm(page: Page) {
  await page.getByRole("button", { name: /Nouvelle commande/i }).click();
  // Mode choice screen appears first — click "Simple"
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: /^Simple/ }).click();
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
  // Wait for the detail to expand — financial data may take a moment
  await page.waitForTimeout(800);
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
  await expect(page.locator("article").filter({ hasText: input.productName })).toBeVisible({ timeout: 15_000 });
  await openOrderDetails(page, input.productName);
  const card = orderCard(page, input.productName);
  const action = card.locator("button").filter({ hasText: input.actionLabel }).first();
  await expect(action, `Action rapide introuvable: ${input.actionLabel}`).toBeVisible();
  await action.click();

  await expect(page.getByRole("button", { name: /Enregistr/ })).toBeVisible({ timeout: 15_000 });
  // Wait for the transaction modal to fully hydrate the account list and currency fields.
  // In serial mode, rapid sequential opens can race against the previous test's cache
  // invalidation, leaving the select empty for a frame.
  await page.waitForTimeout(800);
  await selectFieldOption(page, /^Compte$/, input.accountName);
  await fillFieldInput(page, /^Montant$/, input.amount, 'input[type="number"]');
  await fillFieldInput(page, /^Montant$/, "USD", 'input[type="text"][maxlength="4"]');
  await selectFieldOption(page, /^Client$/, input.clientName);
  await selectFieldOption(page, /^Commande/, input.productName);
  await fillFieldInput(page, /^Note/, input.note);
  await saveByName(page, /^Enregistrer$/, /Enregistr/);
}

async function updateOrderStatus(page: Page, productName: string, statusLabel: string) {
  await page.goto("/fr/orders");
  const card = orderCard(page, productName);
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: /^Modifier$/ }).click();
  // Wait for the edit modal to hydrate the status select fully
  await page.waitForTimeout(600);
  await selectFieldOption(page, /^Statut$/, statusLabel);
  await saveByName(page, /^Sauvegarder$/, /Sauvegarde/);
}
