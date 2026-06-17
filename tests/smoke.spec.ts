import { expect, test } from "@playwright/test";
import { loginAsTestUser } from "./helpers/auth";

test("smoke - login and dashboard load", async ({ page }) => {
  await loginAsTestUser(page);

  await expect(page).toHaveURL(/\/fr\/dashboard(?:$|[?#])/);
  await page.waitForLoadState("networkidle");

  const body = page.locator("body");
  await expect(body).toContainText("DANEX");
  await expect(body).not.toContainText(/404|Page not found|Network error/i);
});
