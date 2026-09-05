import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { apiRateLimiter } from "./lib/rate-limit";

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
const legacyRoutes = new Set(["/billing/entry", "/billing/preview", "/billing/approvals", "/billing/print"]);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Applies to every API route, not just login -- login itself goes straight
  // from the browser to Supabase Auth (see app/login/page.tsx) and never
  // touches this server, so Supabase's own rate limiting covers that request;
  // this covers everything our own server does handle.
  if (pathname.startsWith("/api/")) {
    if (apiRateLimiter) {
      const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? request.ip ?? "unknown";
      const { success, reset } = await apiRateLimiter.limit(ip);
      if (!success) {
        return NextResponse.json(
          { error: "Too many requests. Please slow down and try again shortly." },
          {
            status: 429,
            headers: { "Retry-After": Math.max(1, Math.ceil((reset - Date.now()) / 1000)).toString() }
          }
        );
      }
    }
    return NextResponse.next();
  }

  // Bare list routes above, plus the dynamic print-detail route
  // (/billing/print/<batchId>), reachable only via /employee/billing/print/<id>.
  if (legacyRoutes.has(pathname) || pathname.startsWith("/billing/print/")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/billing/:path*", "/api/:path*"]
};
