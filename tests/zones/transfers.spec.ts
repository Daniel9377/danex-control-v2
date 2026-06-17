import { expect, type Page, test } from "@playwright/test";
import {
  fieldContainer,
  fillFieldInput,
  knownAccount,
  readAccountBalance,
  saveByName,
  seedAndLogin,
  selectFieldOption,
  tableRows,
  type KnownState,
} from "../helpers/e2e-utils";

test.describe.configure({ mode: "serial" });

let state: KnownState;

test.beforeEach(async ({ page }) => {
  state = await seedAndLogin(page, "/fr/transfers");
});

test("Transferts - 100 USD de Mercury vers Cash met les soldes a jour", async ({ page }) => {
  const mercury = knownAccount(state, "Mercury Test");
  const cash = knownAccount(state, "Cash Test");
  const expectedMercury = mercury.balance - 100;
  const expectedCash = cash.balance + 100;

  await createTransfer(page, {
    from: "Mercury Test",
    to: "Cash Test",
    fromAmount: "100",
    note: "QA TRANSFER USD",
  });

  const rows = await tableRows(state, "transfers", { note: "QA TRANSFER USD" });
  expect(rows, "Un seul transfert Mercury -> Cash doit etre enregistre.").toHaveLength(1);
  expect(Number(rows[0].from_amount), `Montant envoye attendu 100, actuel ${rows[0]?.from_amount}.`).toBe(100);
  expect(Number(rows[0].to_amount), `Montant recu attendu 100, actuel ${rows[0]?.to_amount}.`).toBe(100);

  const actualMercury = await readAccountBalance(page, "Mercury Test");
  const actualCash = await readAccountBalance(page, "Cash Test");
  console.log(`Transferts S1 - Mercury attendu=${expectedMercury}, actuel=${actualMercury}`);
  console.log(`Transferts S1 - Cash attendu=${expectedCash}, actuel=${actualCash}`);
  expect(actualMercury, `Mercury attendu ${expectedMercury} USD, actuel ${actualMercury} USD.`).toBe(expectedMercury);
  expect(actualCash, `Cash attendu ${expectedCash} USD, actuel ${actualCash} USD.`).toBe(expectedCash);
});

test("Transferts - conversion 500 CNY Alipay vers Mercury applique le taux", async ({ page }) => {
  const alipay = knownAccount(state, "Alipay Test");
  const mercury = knownAccount(state, "Mercury Test");
  const rate = 0.14;
  const expectedReceived = 500 * rate;
  const expectedAlipay = alipay.balance - 500;
  const expectedMercury = mercury.balance + expectedReceived;

  await createTransfer(page, {
    from: "Alipay Test",
    to: "Mercury Test",
    fromAmount: "500",
    exchangeRate: String(rate),
    note: "QA TRANSFER FX",
  });

  const rows = await tableRows(state, "transfers", { note: "QA TRANSFER FX" });
  expect(rows, "Un seul transfert multi-devise doit etre enregistre.").toHaveLength(1);
  console.log(
    `Transferts S2 - conversion attendue=500 CNY * ${rate} = ${expectedReceived} USD, actuelle=${rows[0]?.to_amount} ${rows[0]?.to_currency}`
  );
  expect(Number(rows[0].from_amount), `Montant envoye attendu 500, actuel ${rows[0]?.from_amount}.`).toBe(500);
  expect(Number(rows[0].to_amount), `Montant recu attendu ${expectedReceived}, actuel ${rows[0]?.to_amount}.`).toBeCloseTo(
    expectedReceived,
    2
  );
  expect(Number(rows[0].exchange_rate), `Taux attendu ${rate}, actuel ${rows[0]?.exchange_rate}.`).toBeCloseTo(rate, 4);

  const actualAlipay = await readAccountBalance(page, "Alipay Test");
  const actualMercury = await readAccountBalance(page, "Mercury Test");
  console.log(`Transferts S2 - Alipay attendu=${expectedAlipay}, actuel=${actualAlipay}`);
  console.log(`Transferts S2 - Mercury attendu=${expectedMercury}, actuel=${actualMercury}`);
  expect(actualAlipay, `Alipay attendu ${expectedAlipay} CNY, actuel ${actualAlipay} CNY.`).toBe(expectedAlipay);
  expect(actualMercury, `Mercury attendu ${expectedMercury} USD, actuel ${actualMercury} USD.`).toBeCloseTo(
    expectedMercury,
    2
  );
});

test("Transferts - double clic Sauvegarder cree un seul transfert", async ({ page }) => {
  await openTransferForm(page);
  await selectFieldOption(page, /^De$/, "Mercury Test");
  await selectFieldOption(page, /^Vers$/, "Cash Test");
  await fillFieldInput(page, /envoy/i, "10", 'input[type="number"]');
  await fillFieldInput(page, /^Note/, "QA TRANSFER DOUBLE");

  const saveButton = page.getByRole("button", { name: /^Sauvegarder$/ });
  await expect(saveButton).toBeEnabled();
  await saveButton.evaluate((button) => {
    (button as HTMLButtonElement).click();
    (button as HTMLButtonElement).click();
  });
  await expect(saveButton).toBeHidden({ timeout: 10_000 });
  await page.waitForLoadState("networkidle");

  const rows = await tableRows(state, "transfers", { note: "QA TRANSFER DOUBLE" });
  console.log(`Transferts S3 - transferts attendus=1, actuels=${rows.length}`);
  expect(rows, `DOUBLE SUBMIT: attendu 1 transfert, actuel ${rows.length}.`).toHaveLength(1);
});

async function createTransfer(
  page: Page,
  input: { from: string; to: string; fromAmount: string; exchangeRate?: string; note: string }
) {
  await openTransferForm(page);
  await selectFieldOption(page, /^De$/, input.from);
  await selectFieldOption(page, /^Vers$/, input.to);
  await fillFieldInput(page, /envoy/i, input.fromAmount, 'input[type="number"]');
  if (input.exchangeRate) {
    await fillFieldInput(page, /^Taux de change$/, input.exchangeRate, 'input[type="number"]');
  }
  await fillFieldInput(page, /^Note/, input.note);

  const receivedInput = fieldContainer(page, /re.u/i).locator('input[type="number"]').first();
  await expect(receivedInput, "Le champ Montant recu doit etre present.").toBeVisible();
  await saveByName(page, /^Sauvegarder$/, /Sauvegarde/);

async function openTransferForm(page: Page) {
  await page.getByRole("button", { name: /Nouveau transfert/i }).click();
  await expect(page.getByRole("button", { name: /^Sauvegarder$/ })).toBeVisible();
}
