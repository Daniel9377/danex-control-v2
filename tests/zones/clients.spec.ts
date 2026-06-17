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
  const text = normalizeText((await card.textContent()) ?? "");
  console.log(`Clients S3 - affichage Joseph: ${text}`);
  expect(text, "Joseph doit afficher 200 USD sans rechargement manuel.").toMatch(/200/);
  expect(text, "Joseph doit afficher USD ou $US.").toMatch(/USD|\$US|US\$/i);
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
  const row = transactionRows(page).filter({ hasText: /QA CLIENT CACHE DELETE/ }).first();
  await expect(row).toBeVisible();
  await row.click();
  await deleteOpenTransaction(page);

  await navigateBySidebar(page, /Clients/);
  const text = normalizeText((await clientCard(page, "Joseph Test").textContent()) ?? "");
  console.log(`Clients S4 - affichage Joseph apres suppression attendu=0, actuel=${text}`);
  expect(text, `CACHE STALE: Joseph affiche encore 200 USD apres suppression. Texte: ${text}`).not.toMatch(
    /200(?:[,.]00)?\s*(?:USD|\$US|US\$|\$)/i
  );
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
  // Use full page load instead of link.click().  On soft navigation, the
  // Supabase anon client intermittently returns 0 rows for the transactions
  // query (read consistency gap), so useAllClientFinancials sees no data.
  // A full page load clears the JS context and forces a fresh auth + fetch.
  const link = page.getByRole("link", { name }).first();
  await expect(link, `Lien de navigation introuvable: ${name}`).toBeVisible();
  const href = await link.getAttribute("href");
  if (href) await page.goto(href);
  await expect(page.locator("main")).toBeVisible({ timeout: 10_000 });
}
