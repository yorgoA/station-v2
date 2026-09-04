import { test, expect } from "@playwright/test";
import { authFile, type Role } from "../helpers";

/**
 * Every nav item (app/_components/role-nav.ts) should at least render without
 * a server error or a client-side crash. This is intentionally shallow --
 * it's a regression net for "the page 500s / throws," not a check of each
 * page's business logic (that lives in more targeted specs).
 */
const pagesByRole: Record<Role, string[]> = {
  manager: [
    "/manager/dashboard",
    "/manager/customers",
    "/manager/monitors",
    "/manager/approvals",
    "/manager/reports",
    "/manager/settings"
  ],
  employee: [
    "/employee/dashboard",
    "/employee/billing/entry",
    "/employee/billing/preview",
    "/employee/payments",
    "/employee/review-qr",
    "/employee/customers",
    "/employee/monitors"
  ],
  collector: ["/collector/dashboard"]
};

for (const role of Object.keys(pagesByRole) as Role[]) {
  test.describe(`${role} pages`, () => {
    for (const path of pagesByRole[role]) {
      test(`${path} loads without a server or client error`, async ({ browser }) => {
        const context = await browser.newContext({ storageState: authFile(role) });
        const page = await context.newPage();

        const pageErrors: string[] = [];
        page.on("pageerror", (err) => pageErrors.push(err.message));

        const response = await page.goto(path);
        expect(response?.status(), `${path} responded ${response?.status()}`).toBeLessThan(500);
        // Confirms the shell actually mounted rather than an error boundary
        // swallowing everything into a blank page.
        await expect(page.locator(".build-badge")).toBeVisible({ timeout: 10_000 });
        expect(pageErrors, `uncaught client errors on ${path}:\n${pageErrors.join("\n")}`).toHaveLength(0);

        await context.close();
      });
    }
  });
}
