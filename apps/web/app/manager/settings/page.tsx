import Link from "next/link";
import { AppShell } from "../../_components/app-shell";
import { managerNavItems } from "../../_components/role-nav";

export default function ManagerSettingsPage() {
  return (
    <AppShell
      title="Settings"
      subtitle="Open a settings area to manage policies, pricing, and account controls"
      navItems={managerNavItems}
    >
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Available Settings</h3>
        <p className="muted">Open one of the settings areas below for detailed controls.</p>
      </div>

      <div className="kpi-grid">
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Numbers and Prices</h3>
          <p className="muted">Manage ampere prices, monthly kWh tariffs, and fallback pricing.</p>
          <Link href="/manager/settings/pricing" className="action-link-btn">
            Open Numbers and Prices
          </Link>
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Notification Policies</h3>
          <p className="muted">Set channels for approvals, QR alerts, and generator reminders.</p>
          <Link href="/manager/settings/notifications" className="action-link-btn">
            Open Notification Policies
          </Link>
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Accounts</h3>
          <p className="muted">Create and manage manager, employee, and collector accounts.</p>
          <Link href="/manager/settings/accounts" className="action-link-btn">
            Open Accounts
          </Link>
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Billing Calendar</h3>
          <p className="muted">
            Months normally open for entry on the 27th. Force a month open early or closed early here.
          </p>
          <Link href="/manager/settings/billing-calendar" className="action-link-btn">
            Open Billing Calendar
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
