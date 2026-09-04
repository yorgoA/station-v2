import { test, expect } from "@playwright/test";
import { authFile } from "../helpers";

test.describe("login page (unauthenticated)", () => {
  test("renders and rejects bad credentials without crashing", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Station V2 Login" })).toBeVisible();

    await page.locator("#email").fill("nobody@example.com");
    await page.locator("#password").fill("wrong-password-123");
    await page.getByRole("button", { name: "Sign in" }).click();

    // A real GoTrue error, not a 500/blank page.
    await expect(page.getByText(/invalid login credentials/i)).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("authenticated landing pages", () => {
  test("manager session lands on the manager dashboard", async ({ browser }) => {
    const context = await browser.newContext({ storageState: authFile("manager") });
    const page = await context.newPage();
    await page.goto("/manager/dashboard");
    await expect(page).toHaveURL(/\/manager\/dashboard/);
    await expect(page.getByRole("heading", { name: "Manager Dashboard" })).toBeVisible();
    await context.close();
  });

  test("employee session lands on the employee dashboard", async ({ browser }) => {
    const context = await browser.newContext({ storageState: authFile("employee") });
    const page = await context.newPage();
    await page.goto("/employee/dashboard");
    await expect(page).toHaveURL(/\/employee\/dashboard/);
    await context.close();
  });

  test("collector session lands on the collector dashboard", async ({ browser }) => {
    const context = await browser.newContext({ storageState: authFile("collector") });
    const page = await context.newPage();
    await page.goto("/collector/dashboard");
    await expect(page).toHaveURL(/\/collector\/dashboard/);
    await context.close();
  });
});
