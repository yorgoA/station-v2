import path from "node:path";

export type Role = "manager" | "employee" | "collector";

/** Path to the storageState JSON written by tests/auth/<role>.setup.ts. */
export function authFile(role: Role): string {
  return path.join(__dirname, "..", ".auth", `${role}.json`);
}

/** Headers needed to reach a Vercel-Authentication-protected deployment (staging). */
export function bypassHeaders(): Record<string, string> {
  const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  return secret ? { "x-vercel-protection-bypass": secret } : {};
}
