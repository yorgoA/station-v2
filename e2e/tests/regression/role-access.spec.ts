import { test, expect } from "@playwright/test";
import { authFile } from "../helpers";

/**
 * AppShell's client-side role gate (app/_components/app-shell.tsx) should
 * bounce a signed-in user away from another role's area, back to their own
 * dashboard -- never render the other role's page content.
 */

test("employee is redirected away from the manager area", async ({ browser }) => {
  const context = await browser.newContext({ storageState: authFile("employee") });
  const page = await context.newPage();
  await page.goto("/manager/dashboard");
  await expect(page).toHaveURL(/\/employee\/dashboard/);
  await context.close();
});

test("collector is redirected away from the employee area", async ({ browser }) => {
  const context = await browser.newContext({ storageState: authFile("collector") });
  const page = await context.newPage();
  await page.goto("/employee/billing/entry");
  await expect(page).toHaveURL(/\/collector\/dashboard/);
  await context.close();
});

test("employee is redirected away from the collector area", async ({ browser }) => {
  const context = await browser.newContext({ storageState: authFile("employee") });
  const page = await context.newPage();
  await page.goto("/collector/dashboard");
  await expect(page).toHaveURL(/\/employee\/dashboard/);
  await context.close();
});

test("manager is redirected away from the collector area", async ({ browser }) => {
  const context = await browser.newContext({ storageState: authFile("manager") });
  const page = await context.newPage();
  await page.goto("/collector/dashboard");
  await expect(page).toHaveURL(/\/manager\/dashboard/);
  await context.close();
});

test("signed-out visitor hitting a protected page ends up on /login", async ({ browser }) => {
  const context = await browser.newContext(); // no storageState -- no session
  const page = await context.newPage();
  await page.goto("/manager/dashboard");
  await expect(page).toHaveURL(/\/login/);
  await context.close();
});
