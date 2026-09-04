import { test as setup, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const authFile = path.join(__dirname, "../../.auth/employee.json");

setup("authenticate as employee", async ({ page }) => {
  const email = process.env.E2E_EMPLOYEE_EMAIL;
  const password = process.env.E2E_EMPLOYEE_PASSWORD;
  if (!email || !password) {
    throw new Error("E2E_EMPLOYEE_EMAIL / E2E_EMPLOYEE_PASSWORD are not set.");
  }

  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/employee\/dashboard/, { timeout: 15_000 });

  fs.mkdirSync(path.dirname(authFile), { recursive: true });
  await page.context().storageState({ path: authFile });
});
