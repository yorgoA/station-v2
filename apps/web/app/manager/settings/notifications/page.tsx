"use client";

import Link from "next/link";
import { AppShell } from "../../../_components/app-shell";
import { managerNavItems } from "../../../_components/role-nav";

export default function ManagerNotificationSettingsPage() {
  return (
    <AppShell
      title="Notification Policies"
      subtitle="Configure alert delivery channels for manager workflows"
      navItems={managerNavItems}
    >
      <Link href="/manager/settings" className="back-link">
        ← Back to Settings
      </Link>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Notification Policies</h3>
        <p className="muted">
          Configure where manager alerts are delivered for approvals, QR modifications, and monthly reminders.
        </p>
        <div className="filters-grid filters-grid-pro">
          <label htmlFor="settings-approval-notifications">
            Approval notifications
            <select id="settings-approval-notifications" defaultValue="in_app_email">
              <option value="in_app_email">In-app + email</option>
              <option value="in_app">In-app only</option>
              <option value="email">Email only</option>
            </select>
          </label>
          <label htmlFor="settings-qr-alert-notifications">
            QR modification alerts
            <select id="settings-qr-alert-notifications" defaultValue="in_app">
              <option value="in_app">In-app only</option>
              <option value="in_app_email">In-app + email</option>
              <option value="off">Off</option>
            </select>
          </label>
          <label htmlFor="settings-generator-reminder">
            Generator input reminder
            <select id="settings-generator-reminder" defaultValue="in_app_email">
              <option value="in_app_email">In-app + email</option>
              <option value="in_app">In-app only</option>
              <option value="email">Email only</option>
            </select>
          </label>
        </div>
        <div className="card-actions-right">
          <button type="button" className="success-btn">
            Save Notification Policies
          </button>
        </div>
      </div>
    </AppShell>
  );
}
