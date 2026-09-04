import { test as setup, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const authFile = path.join(__dirname, "../../.auth/collector.json");

setup("authenticate as collector", async ({ page }) => {
  const email = process.env.E2E_COLLECTOR_EMAIL;
  const password = process.env.E2E_COLLECTOR_PASSWORD;
  if (!email || !password) {
    throw new Error("E2E_COLLECTOR_EMAIL / E2E_COLLECTOR_PASSWORD are not set.");
  }

  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/collector\/dashboard/, { timeout: 15_000 });

  fs.mkdirSync(path.dirname(authFile), { recursive: true });
  await page.context().storageState({ path: authFile });
});
