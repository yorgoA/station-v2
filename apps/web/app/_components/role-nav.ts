import type { NavItem } from "./app-shell";

export const managerNavItems: NavItem[] = [
  { href: "/manager/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/manager/customers", label: "Customers", icon: "customers" },
  { href: "/manager/monitors", label: "Monitors", icon: "customers" },
  { href: "/manager/approvals", label: "Approvals", icon: "approvals" },
  { href: "/manager/reports", label: "Reports", icon: "reports" },
  { href: "/manager/settings", label: "Settings", icon: "settings" }
];

export const employeeNavItems: NavItem[] = [
  { href: "/employee/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/employee/billing/entry", label: "Billing Entry", icon: "billing" },
  { href: "/employee/billing/preview", label: "Billing Preview", icon: "preview" },
  { href: "/employee/billing/print", label: "Print", icon: "print" },
  { href: "/employee/payments", label: "Payments", icon: "payments" },
  { href: "/employee/review-qr", label: "Review QR", icon: "review_qr" },
  { href: "/employee/customers", label: "Customers", icon: "customers" },
  { href: "/employee/monitors", label: "Monitors", icon: "customers" }
];

export const collectorNavItems: NavItem[] = [
  { href: "/collector/dashboard", label: "Dashboard", icon: "dashboard" }
];
