"use client";

import { useState } from "react";
import { AppShell } from "../_components/app-shell";

export default function DashboardPage() {
  const [showPendingDetails, setShowPendingDetails] = useState(false);

  return (
    <AppShell
      title="Dashboard"
      subtitle="Overview"
    >
      <div className="header-row card" style={{ marginBottom: 12 }}>
        <button
          type="button"
          className="notify-chip"
          title="Pending approval queue"
          onClick={() => setShowPendingDetails((v) => !v)}
        >
          <span className="notify-dot" />
          0 pending approvals
        </button>
      </div>

      {showPendingDetails && (
        <div className="card">
          <ul>
            <li>No pending approval batches.</li>
          </ul>
        </div>
      )}

      <div className="kpi-grid">
        <div className="card">
          <p className="muted">Total Due</p>
          <p className="kpi-value">0</p>
        </div>
        <div className="card">
          <p className="muted">Collected This Month</p>
          <p className="kpi-value">0</p>
        </div>
        <div className="card">
          <p className="muted">Collection Rate</p>
          <p className="kpi-value">0%</p>
        </div>
      </div>

      <div className="card">
        <h3>Energy Loss Overview</h3>
        <p className="muted">
          No data available.
        </p>
      </div>

      <div className="card">
        <h3>Manager Alerts</h3>
        <ul>
          <li>No alerts.</li>
        </ul>
      </div>
    </AppShell>
  );
}
