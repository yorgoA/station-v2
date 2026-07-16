"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createSupabasePublicClient } from "../../lib/supabase/browser-public";

export type NavItem = {
  href: string;
  label: string;
  icon:
    | "dashboard"
    | "customers"
    | "billing"
    | "preview"
    | "approvals"
    | "print"
    | "payments"
    | "review_qr"
    | "reports"
    | "loss"
    | "settings"
    | "logout";
};

type AppShellProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  navItems?: NavItem[];
  appName?: string;
  /** Force a specific nav item active, overriding the default pathname-prefix match.
   *  Needed for shared detail routes (e.g. a monitor's detail page lives at the same
   *  URL as a customer's) where the pathname alone can't tell which nav item should light up. */
  activeHref?: string;
};

const defaultNavItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/customers", label: "Customers", icon: "customers" },
  { href: "/billing/entry", label: "Billing Entry", icon: "billing" },
  { href: "/billing/preview", label: "Billing Preview", icon: "preview" },
  { href: "/billing/approvals", label: "Approvals", icon: "approvals" },
  { href: "/billing/print", label: "Print", icon: "print" },
  { href: "/payments", label: "Payments", icon: "payments" },
  { href: "/reports/overview", label: "Reports Overview", icon: "reports" },
  { href: "/reports/loss-analysis", label: "Loss Analysis", icon: "loss" },
  { href: "/settings", label: "Settings", icon: "settings" }
];

const managerDefaultNavItems: NavItem[] = [
  { href: "/manager/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/manager/customers", label: "Customers", icon: "customers" },
  { href: "/manager/monitors", label: "Monitors", icon: "customers" },
  { href: "/manager/approvals", label: "Approvals", icon: "approvals" },
  { href: "/manager/reports", label: "Reports", icon: "reports" },
  { href: "/manager/settings", label: "Settings", icon: "settings" }
];

const employeeDefaultNavItems: NavItem[] = [
  { href: "/employee/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/employee/billing/entry", label: "Billing Entry", icon: "billing" },
  { href: "/employee/billing/preview", label: "Billing Preview", icon: "preview" },
  { href: "/employee/billing/print", label: "Print", icon: "print" },
  { href: "/employee/payments", label: "Payments", icon: "payments" },
  { href: "/employee/review-qr", label: "Review QR", icon: "review_qr" },
  { href: "/employee/customers", label: "Customers", icon: "customers" },
  { href: "/employee/monitors", label: "Monitors", icon: "customers" }
];

const collectorDefaultNavItems: NavItem[] = [
  { href: "/collector/dashboard", label: "Dashboard", icon: "dashboard" }
];

function NavIcon({ name }: { name: NavItem["icon"] }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (name) {
    case "dashboard":
      return <svg viewBox="0 0 24 24"><path {...common} d="M3 11.5L12 4l9 7.5"/><path {...common} d="M5 10.5V20h14v-9.5"/></svg>;
    case "customers":
      return <svg viewBox="0 0 24 24"><circle {...common} cx="9" cy="8" r="3"/><path {...common} d="M3 19c0-3 2.5-5 6-5s6 2 6 5"/><circle {...common} cx="18" cy="9" r="2"/><path {...common} d="M15.5 18c.5-1.6 1.9-2.9 3.8-3.3"/></svg>;
    case "billing":
      return <svg viewBox="0 0 24 24"><path {...common} d="M7 3h10v18l-3-2-2 2-2-2-3 2z"/><path {...common} d="M9 8h6M9 12h6"/></svg>;
    case "preview":
      return <svg viewBox="0 0 24 24"><path {...common} d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z"/><circle {...common} cx="12" cy="12" r="3"/></svg>;
    case "approvals":
      return <svg viewBox="0 0 24 24"><path {...common} d="M20 7L10 17l-6-6"/></svg>;
    case "print":
      return <svg viewBox="0 0 24 24"><path {...common} d="M7 8V4h10v4"/><rect {...common} x="4" y="8" width="16" height="8" rx="2"/><path {...common} d="M7 14h10v6H7z"/></svg>;
    case "payments":
      return <svg viewBox="0 0 24 24"><rect {...common} x="3" y="6" width="18" height="12" rx="2"/><path {...common} d="M3 10h18"/><path {...common} d="M7 15h3"/></svg>;
    case "review_qr":
      return <svg viewBox="0 0 24 24"><path {...common} d="M4 4h5v5H4z"/><path {...common} d="M15 4h5v5h-5z"/><path {...common} d="M4 15h5v5H4z"/><path {...common} d="M15 15h2m-2 3h5m-2-3v5"/></svg>;
    case "reports":
      return <svg viewBox="0 0 24 24"><path {...common} d="M4 20h16"/><path {...common} d="M7 16V9"/><path {...common} d="M12 16V5"/><path {...common} d="M17 16v-7"/></svg>;
    case "loss":
      return <svg viewBox="0 0 24 24"><path {...common} d="M4 6l6 6 4-4 6 6"/><path {...common} d="M20 14v5h-5"/></svg>;
    case "settings":
      return <svg viewBox="0 0 24 24"><circle {...common} cx="12" cy="12" r="3"/><path {...common} d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a2 2 0 1 1-4 0v-.1a1 1 0 0 0-.6-.9 1 1 0 0 0-1.1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a2 2 0 1 1 0-4h.1a1 1 0 0 0 .9-.6 1 1 0 0 0-.2-1.1l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1 1 0 0 0 1.1.2h.1a1 1 0 0 0 .5-.9V4a2 2 0 1 1 4 0v.1a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1 1 0 0 0-.2 1.1v.1a1 1 0 0 0 .9.5H20a2 2 0 1 1 0 4h-.1a1 1 0 0 0-.9.6z"/></svg>;
    case "logout":
      return <svg viewBox="0 0 24 24"><path {...common} d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path {...common} d="M16 17l5-5-5-5"/><path {...common} d="M21 12H9"/></svg>;
  }
}

export function AppShell({
  title,
  subtitle,
  children,
  navItems,
  appName,
  activeHref
}: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [accessChecked, setAccessChecked] = useState(false);
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;
  const router = useRouter();
  const supabase = useMemo(() => createSupabasePublicClient(), []);

  /** Re-check auth when switching app areas — not on every /manager/* detail route change (avoids blanking the shell). */
  const accessZone = useMemo(() => {
    if (pathname.startsWith("/manager")) return "manager";
    if (pathname.startsWith("/employee")) return "employee";
    if (pathname.startsWith("/collector")) return "collector";
    return "general";
  }, [pathname]);
  const resolvedAppName = appName
    ? appName
    : pathname.startsWith("/manager")
      ? "Station V2 - Manager"
      : pathname.startsWith("/employee")
        ? "Station V2 - Employee"
        : pathname.startsWith("/collector")
          ? "Station V2 - Collector"
        : "Station V2";
  const resolvedNavItems =
    navItems ??
    (pathname.startsWith("/manager")
      ? managerDefaultNavItems
      : pathname.startsWith("/employee")
        ? employeeDefaultNavItems
        : pathname.startsWith("/collector")
          ? collectorDefaultNavItems
        : defaultNavItems);

  useEffect(() => {
    const saved = window.localStorage.getItem("station_v2_sidebar_open");
    if (saved === "0") setSidebarOpen(false);
  }, []);

  useEffect(() => {
    window.localStorage.setItem("station_v2_sidebar_open", sidebarOpen ? "1" : "0");
  }, [sidebarOpen]);

  useEffect(() => {
    let cancelled = false;
    setAccessChecked(false);

    async function checkAccess() {
      const path = pathnameRef.current;
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (cancelled) return;
      if (!user) {
        router.push("/login");
        router.refresh();
        return;
      }

      const role =
        (user.user_metadata?.role as string | undefined) ??
        (user.app_metadata?.role as string | undefined) ??
        "employee";
      const homeByRole =
        role === "manager"
          ? "/manager/dashboard"
          : role === "collector"
            ? "/collector/dashboard"
            : "/employee/dashboard";

      if (path.startsWith("/manager") && role !== "manager") {
        router.push(homeByRole);
        router.refresh();
        return;
      }
      if (path.startsWith("/employee") && role !== "employee") {
        router.push(homeByRole);
        router.refresh();
        return;
      }
      if (path.startsWith("/collector") && role !== "collector") {
        router.push(homeByRole);
        router.refresh();
        return;
      }
      setAccessChecked(true);
    }

    checkAccess();
    return () => {
      cancelled = true;
    };
  }, [accessZone, router, supabase]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  if (!accessChecked) {
    return (
      <main className="page" style={{ maxWidth: 420 }}>
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            Checking access...
          </p>
        </div>
      </main>
    );
  }

  return (
    <div className={`app-shell ${sidebarOpen ? "" : "sidebar-collapsed"}`}>
      <aside className={`sidebar ${sidebarOpen ? "open" : "closed"}`}>
        <button
          type="button"
          className="sidebar-toggle sidebar-toggle-in-sidebar"
          onClick={() => setSidebarOpen((v) => !v)}
          aria-label={sidebarOpen ? "Close menu" : "Open menu"}
          title={sidebarOpen ? "Close menu" : "Open menu"}
        >
          {sidebarOpen ? "✕" : "☰"}
        </button>
        <h2>{resolvedAppName}</h2>
        <p className="muted">Mock UX prototype</p>
        <nav>
          {resolvedNavItems.map((item) => {
            const isActive = activeHref
              ? item.href === activeHref
              : pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-link ${isActive ? "active" : ""}`}
                title={sidebarOpen ? item.label : item.label}
              >
                <span className="nav-icon" aria-hidden>
                  <NavIcon name={item.icon} />
                </span>
                <span className="nav-label">{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <button type="button" className="logout-btn" onClick={handleLogout}>
          <span className="nav-icon" aria-hidden>
            <NavIcon name="logout" />
          </span>
          <span className="nav-label">Logout</span>
        </button>
      </aside>
      {!sidebarOpen ? null : (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Close menu backdrop"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <section className="content">
        <header className="page-header">
          {!sidebarOpen ? (
            <button
              type="button"
              className="sidebar-toggle mobile-only"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open menu"
              title="Open menu"
            >
              ☰
            </button>
          ) : null}
          <h1>{title}</h1>
          {subtitle ? <p className="muted">{subtitle}</p> : null}
        </header>
        <main>{children}</main>
      </section>
    </div>
  );
}
