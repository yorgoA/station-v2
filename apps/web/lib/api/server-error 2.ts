import { NextResponse } from "next/server";

/**
 * Logs the real error server-side (shows up in Vercel's Logs tab immediately)
 * and returns a generic message to the client. Route handlers should never
 * echo error.message back to the caller -- it can leak internal details
 * (raw Postgres constraint text, file paths, etc.).
 */
export function serverError(error: unknown, status = 500) {
  console.error(error);
  return NextResponse.json({ error: "Something went wrong. Please try again." }, { status });
}
