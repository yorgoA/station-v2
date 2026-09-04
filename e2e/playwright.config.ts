import { defineConfig, devices } from "@playwright/test";

/**
 * Runs against an already-deployed environment (staging by default) -- there's
 * no local dev server here on purpose, so these tests exercise the real
 * Vercel + Supabase staging stack, not a mocked one.
 *
 * Required env vars (see .env.example):
 *   E2E_BASE_URL
 *   E2E_MANAGER_EMAIL / E2E_MANAGER_PASSWORD
 *   E2E_EMPLOYEE_EMAIL / E2E_EMPLOYEE_PASSWORD
 *   E2E_COLLECTOR_EMAIL / E2E_COLLECTOR_PASSWORD
 * Optional:
 *   VERCEL_AUTOMATION_BYPASS_SECRET -- required when the target deployment has
 *   Vercel Authentication (Deployment Protection) turned on, e.g. staging.
 *   Generate it in Vercel -> Project Settings -> Deployment Protection ->
 *   Protection Bypass for Automation.
 */

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3010";
const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 3 : undefined,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",

  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...(bypassSecret ? { extraHTTPHeaders: { "x-vercel-protection-bypass": bypassSecret } } : {})
  },

  projects: [
    {
      name: "setup",
      testDir: "./tests/auth",
      testMatch: /.*\.setup\.ts/
    },
    {
      name: "smoke",
      testDir: "./tests/smoke",
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"] }
    },
    {
      name: "regression",
      testDir: "./tests/regression",
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});
