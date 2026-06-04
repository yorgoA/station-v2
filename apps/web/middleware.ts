import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const legacyRoutes = new Set([
  "/dashboard",
  "/customers",
  "/payments",
  "/settings",
  "/billing/entry",
  "/billing/preview",
  "/billing/approvals",
  "/billing/print",
  "/reports/overview",
  "/reports/monthly-bills",
  "/reports/monthly-collections",
  "/reports/loss-analysis",
  "/reports/audit"
]);

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (legacyRoutes.has(pathname)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard",
    "/customers",
    "/payments",
    "/settings",
    "/billing/:path*",
    "/reports/:path*"
  ]
};
