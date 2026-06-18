import { expect, type Page, test } from "@playwright/test";
import {
  createClientUi,
  createTransactionUi,
  deleteOpenTransaction,
  fillFieldInput,
  normalizeText,
  saveByName,
  seedAndLogin,
  selectFieldOption,
  singleRow,
  tableRows,
  transactionRows,
  type KnownState,
} from "../helpers/e2e-utils";

test.describe.configure({ mode: "serial", timeout: 90_000 });

let state: KnownState;

test.beforeEach(async ({ page }) => {
  state = await seedAndLogin(page, "/fr/clients");
});

test("Clients - creer Joseph Test dans la liste", async ({ page }) => {
  await createClientUi(page, "Joseph Test", "Lubumbashi");

  const joseph = await singleRow(state, "clients", { name: "Joseph Test" });
  console.log(`Clients S1 - client attendu=Joseph Test, actuel=${joseph.name}, ville=${joseph.city}`);
  expect(joseph.city, `Ville attendue Lubumbashi, actuelle ${joseph.city}.`).toBe("Lubumbashi");
  expect(joseph.trust_level, `Niveau attendu standard, actuel ${joseph.trust_level}.`).toBe("standard");
});

test("Clients - creer un argent recu 200 USD pour Joseph Test", async ({ page }) => {
  await createClientUi(page, "Joseph Test", "Lubumbashi");

  await createTransactionUi(page, {
    subType: /Argent client re.u/i,
    accountName: "Mercury Test",
    amount: "200",
    currency: "USD",
    clientName: "Joseph Test",
    note: "QA CLIENT RECEIVED 200",
  });

  const joseph = await singleRow(state, "clients", { name: "Joseph Test" });
  const rows = await tableRows(state, "transactions", {
    client_id: joseph.id,
    sub_type: "client_money_received",
    note: "QA CLIENT RECEIVED 200",
  });
  console.log(`Clients S2 - transactions recues attendues=1, actuelles=${rows.length}`);
  expect(rows).toHaveLength(1);
  expect(Number(rows[0].amount), `Montant attendu 200, actuel ${rows[0]?.amount}.`).toBe(200);
  expect(rows[0].currency, `Devise attendue USD, actuelle ${rows[0]?.currency}.`).toBe("USD");
});

test("Clients - Joseph affiche 200 USD immediatement apres argent recu", async ({ page }) => {
  await createClientUi(page, "Joseph Test", "Lubumbashi");
  await createTransactionUi(page, {
    subType: /Argent client re.u/i,
    accountName: "Mercury Test",
    amount: "200",
    currency: "USD",
    clientName: "Joseph Test",
    note: "QA CLIENT IMMEDIATE 200",
  });

  await navigateBySidebar(page, /Clients/);
  const card = clientCard(page, "Joseph Test");
  await expect(card).toBeVisible();
  // Auto-wait: useAllClientFinancials loads asynchronously after soft nav.
  // toContainText retries until the financial data appears (default 10s).
  await expect(card, "Joseph doit afficher 200 USD (attente chargement async apres soft nav).").toContainText(/200/);
  await expect(card, "Joseph doit afficher USD ou $US.").toContainText(/USD|\$US|US\$/);
  const text = normalizeText((await card.textContent()) ?? "");
  console.log(`Clients S3 - affichage Joseph: ${text}`);
});

test("Clients - supprimer la transaction remet Joseph a 0 sans cache stale", async ({ page }) => {
  await createClientUi(page, "Joseph Test", "Lubumbashi");
  await createTransactionUi(page, {
    subType: /Argent client re.u/i,
    accountName: "Mercury Test",
    amount: "200",
    currency: "USD",
    clientName: "Joseph Test",
    note: "QA CLIENT CACHE DELETE",
  });

  await navigateBySidebar(page, /Clients/);
  await expect(clientCard(page, "Joseph Test")).toContainText(/200/);

  await navigateBySidebar(page, /Transactions/);
  // Notes are hidden in compact rows — filter by visible text instead
  const row = transactionRows(page).filter({ hasText: /Joseph Test/ }).first();
  await expect(row).toBeVisible({ timeout: 10_000 });
  await row.click();
  await deleteOpenTransaction(page);

  await navigateBySidebar(page, /Clients/);
  // Auto-wait + normalize approach for the inverse check
  await expect(async () => {
    const t = normalizeText((await clientCard(page, "Joseph Test").textContent()) ?? "");
    console.log(`Clients S4 - affichage Joseph apres suppression attendu=0, actuel=${t}`);
    expect(t, `CACHE STALE: Joseph affiche encore 200 USD apres suppression. Texte: ${t}`).not.toMatch(
      /200(?:[,.]00)?\s*(?:USD|\$US|US\$|\$)/i
    );
  }).toPass({ timeout: 10_000 });
});

test("Clients - solde client = recu moins couts moins remboursements", async ({ page }) => {
  await createClientUi(page, "Joseph Test", "Lubumbashi");
  await createOrder(page, "Joseph Test", "Joseph Balance Order");

  await createTransactionUi(page, {
    subType: /Argent client re.u/i,
    accountName: "Mercury Test",
    amount: "200",
    currency: "USD",
    clientName: "Joseph Test",
    orderName: "Joseph Balance Order",
    note: "QA CLIENT MATH RECEIVED",
  });
  await createTransactionUi(page, {
    subType: /Achat produit client/i,
    accountName: "Mercury Test",
    amount: "80",
    currency: "USD",
    clientName: "Joseph Test",
    orderName: "Joseph Balance Order",
    note: "QA CLIENT MATH COST",
  });
  await createTransactionUi(page, {
    subType: /Remboursement client/i,
    accountName: "Mercury Test",
    amount: "20",
    currency: "USD",
    clientName: "Joseph Test",
    orderName: "Joseph Balance Order",
    note: "QA CLIENT MATH REFUND",
  });

  await page.goto("/fr/clients");
  await page.waitForLoadState("networkidle");
  const card = clientCard(page, "Joseph Test");
  await expect(card).toBeVisible();
  const expand = card.getByRole("button", { name: /financier/i });
  await expect(expand).toBeVisible();
  await expand.click();

  const text = normalizeText((await card.textContent()) ?? "");
  console.log(`Clients S5 - attendu recu=200, couts=80, rembourse=20, solde=100. Affichage=${text}`);
  expect(text, "Total recu attendu 200 USD.").toMatch(/200/);
  expect(text, "Cout produit attendu 80 USD.").toMatch(/80/);
  expect(text, "Remboursement attendu 20 USD.").toMatch(/20/);
  expect(text, "Solde attendu 100 USD (200 - 80 - 20).").toMatch(/100/);
});

async function createOrder(page: Page, clientName: string, productName: string) {
  await page.goto("/fr/orders");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /Nouvelle commande/i }).click();
  await selectFieldOption(page, /^Client$/, clientName);
  await fillFieldInput(page, /^Produit$/, productName);
  await selectFieldOption(page, /^Devise$/, "USD");
  await saveByName(page, /^Sauvegarder$/, /Sauvegarde/);
  await expect(page.locator("article").filter({ hasText: productName }).first()).toBeVisible();
}

function clientCard(page: Page, clientName: string) {
  return page.locator("article").filter({ hasText: clientName }).first();
}

async function navigateBySidebar(page: Page, name: RegExp) {
  // True user-like navigation: click the sidebar link to trigger a soft
  // (client-side) navigation.  This exercises the real cache pub/sub path
  // (useAllClientFinancials subscribes to "all_client_financials" invalidation
  // and re-fetches on soft-navigation arrival via usePathname detection).
  const link = page.getByRole("link", { name }).first();
  await expect(link, `Lien de navigation introuvable: ${name}`).toBeVisible();
  await link.click();
  await expect(page.locator("main")).toBeVisible({ timeout: 10_000 });
}
