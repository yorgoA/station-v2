import { test as setup, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const authFile = path.join(__dirname, "../../.auth/manager.json");

setup("authenticate as manager", async ({ page }) => {
  const email = process.env.E2E_MANAGER_EMAIL;
  const password = process.env.E2E_MANAGER_PASSWORD;
  if (!email || !password) {
    throw new Error("E2E_MANAGER_EMAIL / E2E_MANAGER_PASSWORD are not set.");
  }

  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/manager\/dashboard/, { timeout: 15_000 });

  fs.mkdirSync(path.dirname(authFile), { recursive: true });
  await page.context().storageState({ path: authFile });
});
