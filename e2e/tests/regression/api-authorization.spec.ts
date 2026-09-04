import { test, expect, request as pwRequest } from "@playwright/test";
import { authFile, bypassHeaders } from "../helpers";

/**
 * Automates the exact questions from the security review: is the API open to
 * anyone, and can one role see data/actions meant for another? Every case
 * here is grounded in an actual requireRole([...]) call in the API routes --
 * see app/api/**\/route.ts.
 */

const baseURL = process.env.E2E_BASE_URL;

async function contextFor(role: "manager" | "employee" | "collector") {
  return pwRequest.newContext({
    baseURL,
    storageState: authFile(role),
    extraHTTPHeaders: bypassHeaders()
  });
}

test.describe("unauthenticated", () => {
  test("GET /api/customers is rejected without a session", async ({ request }) => {
    const res = await request.get("/api/customers");
    expect(res.status()).toBe(401);
  });
});

test.describe("role boundaries", () => {
  test("employee cannot read manager-only pricing settings", async () => {
    const ctx = await contextFor("employee");
    const res = await ctx.get("/api/settings/pricing");
    expect(res.status()).toBe(403);
    await ctx.dispose();
  });

  test("collector cannot list manager accounts", async () => {
    const ctx = await contextFor("collector");
    const res = await ctx.get("/api/settings/accounts");
    expect(res.status()).toBe(403);
    await ctx.dispose();
  });

  test("employee cannot read the manager-only report endpoint", async () => {
    const ctx = await contextFor("employee");
    const res = await ctx.get("/api/reports/manager?month=2026-08&region=all");
    expect(res.status()).toBe(403);
    await ctx.dispose();
  });

  test("employee cannot list QR modification alerts (manager-only)", async () => {
    const ctx = await contextFor("employee");
    const res = await ctx.get("/api/qr-collections/modifications");
    expect(res.status()).toBe(403);
    await ctx.dispose();
  });
});

test.describe("positive controls (should succeed)", () => {
  test("manager can read pricing settings", async () => {
    const ctx = await contextFor("manager");
    const res = await ctx.get("/api/settings/pricing");
    expect(res.status()).toBe(200);
    await ctx.dispose();
  });

  test("employee can read the shared customers list", async () => {
    const ctx = await contextFor("employee");
    const res = await ctx.get("/api/customers?view=customers");
    expect(res.status()).toBe(200);
    await ctx.dispose();
  });

  test("collector can read the shared customers list", async () => {
    const ctx = await contextFor("collector");
    const res = await ctx.get("/api/customers?view=customers");
    expect(res.status()).toBe(200);
    await ctx.dispose();
  });

  test("manager can read the monitors view used by /manager/monitors", async () => {
    const ctx = await contextFor("manager");
    const res = await ctx.get("/api/customers?view=monitors&month=2026-08");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.customers)).toBe(true);
    await ctx.dispose();
  });
});

test.describe("error handling", () => {
  test("a 500 never leaks raw error text to the client", async () => {
    // Malformed month key -- exercises a real code path without depending on
    // a specific failure; if the route 500s, the body must be the generic
    // message, not a raw Postgres/driver error string.
    const ctx = await contextFor("manager");
    const res = await ctx.get("/api/customers?view=monitors&month=not-a-month");
    if (res.status() >= 500) {
      const body = await res.json();
      expect(body.error).toBe("Something went wrong. Please try again.");
    }
    await ctx.dispose();
  });
});
