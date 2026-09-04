import { test, expect } from "@playwright/test";
import { authFile } from "../helpers";

// Regression guard for the Linked kWh / Match work: the summary row and table
// header must render, and "Linked kWh (included)" must never silently go back
// to being an empty column (the original bug report this session).
for (const role of ["manager", "employee"] as const) {
  test(`${role} Monitors page renders the KPI row and table`, async ({ browser }) => {
    const context = await browser.newContext({ storageState: authFile(role) });
    const page = await context.newPage();

    await page.goto(`/${role}/monitors`);
    await expect(page.getByRole("heading", { name: "Monitors" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Linked kWh (included)" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Match" })).toBeVisible();

    await context.close();
  });
}
