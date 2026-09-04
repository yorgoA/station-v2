import { test, expect } from "@playwright/test";
import { authFile } from "../helpers";

const cases: Array<{ role: "manager" | "employee" | "collector"; path: string; heading: string }> = [
  { role: "manager", path: "/manager/dashboard", heading: "Manager Dashboard" },
  { role: "employee", path: "/employee/dashboard", heading: "Employee Dashboard" },
  { role: "collector", path: "/collector/dashboard", heading: "Collector Dashboard" }
];

for (const { role, path, heading } of cases) {
  test(`${role} dashboard loads with no console errors`, async ({ browser }) => {
    const context = await browser.newContext({ storageState: authFile(role) });
    const page = await context.newPage();

    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => consoleErrors.push(err.message));

    const response = await page.goto(path);
    expect(response?.ok(), `${path} should respond 2xx/3xx`).toBeTruthy();
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();

    // The sidebar + build badge are on every authenticated page -- a good
    // proxy that the shell rendered rather than an error boundary.
    await expect(page.locator(".build-badge")).toBeVisible();

    expect(consoleErrors, `console errors on ${path}:\n${consoleErrors.join("\n")}`).toHaveLength(0);
    await context.close();
  });
}
