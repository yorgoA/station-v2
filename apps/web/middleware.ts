import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Bare (non-role-prefixed) routes whose page.tsx still exists but is meant to be
 * reached only via its role-prefixed path (e.g. /employee/billing/entry re-exports
 * /billing/entry, /manager/approvals re-exports /billing/approvals). AppShell's
 * client-side role gate only restricts paths under /manager, /employee, /collector
 * — a bare path like /billing/entry falls into its ungated "general" zone, so
 * without this redirect any authenticated user of any role could open it directly.
 * Routes whose page.tsx was deleted (old /customers, /payments, /settings,
 * /reports/*, /dashboard, /supabase-check placeholders) don't need an entry here
 * anymore since they 404 on their own.
 */
const legacyRoutes = new Set([
  "/billing/entry",
  "/billing/preview",
  "/billing/approvals",
  "/billing/print"
]);

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (legacyRoutes.has(pathname)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/billing/:path*"]
};
