import { expect, test } from "@playwright/test";
import {
  createAccountUi,
  fillFieldInput,
  readAccountBalance,
  saveByName,
  seedAndLogin,
  selectFieldOption,
  singleRow,
  tableRows,
} from "../helpers/e2e-utils";

test.skip("DEBUG balance correction logic (no networkidle)", async ({ page }) => {
  page.on("pageerror", (e) => console.log(`PAGEERROR: ${e.message}`));

  const state = await seedAndLogin(page, "/fr/accounts");

  await createAccountUi(page, {
    name: "Test Account",
    currency: "CNY",
    balance: "0",
    typeLabel: /Personnel/i,
    availabilityLabel: /Disponible/i,
  });

  // Reconcile WITHOUT relying on networkidle
  await page.goto("/fr/transactions");
  const reconcileBtn = page.getByRole("button", { name: /R.concilier/i });
  await expect(reconcileBtn).toBeVisible({ timeout: 20000 });
  await reconcileBtn.click();
  await selectFieldOption(page, /^Compte$/, "Test Account");
  await fillFieldInput(page, /^Solde r.el observ/, "500", 'input[type="number"]');
  await fillFieldInput(page, /^Note/, "QA ACCOUNT CORRECTION 500");
  const applyBtn = page.getByRole("button", { name: /^Appliquer$/ });
  await expect(applyBtn).toBeEnabled();
  await applyBtn.click();
  await expect(applyBtn).toBeHidden({ timeout: 15000 });

  // Give the write a moment
  await page.waitForTimeout(2000);

  const account = await singleRow(state, "accounts", { name: "Test Account" });
  console.log(`>>> DB account balance = ${account.balance} ${account.currency}`);

  const corrections = await tableRows(state, "transactions", {
    account_id: account.id,
    sub_type: "balance_correction",
  });
  console.log(`>>> balance_correction rows = ${corrections.length}; amount = ${corrections[0]?.amount}; note = ${corrections[0]?.note}`);

  const visibleBalance = await readAccountBalance(page, "Test Account");
  console.log(`>>> visible balance on /fr/accounts = ${visibleBalance}`);
});
