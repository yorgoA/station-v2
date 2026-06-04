"use client";

import Link from "next/link";
import { AppShell } from "../../_components/app-shell";
import { managerNavItems } from "../../_components/role-nav";
import { DEFAULT_REPORT_MONTH, DEFAULT_REPORT_REGION } from "../../../lib/constants/reports";

export default function ManagerReportsPage() {
  const defaultScope = `month=${DEFAULT_REPORT_MONTH}&region=${DEFAULT_REPORT_REGION}`;
  return (
    <AppShell
      title="Reports"
      subtitle="Manager reporting hub for billing performance and loss analysis"
      navItems={managerNavItems}
    >
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Available Reports</h3>
        <p className="muted">Open one of the reports below for detailed breakdown.</p>
      </div>

      <div className="kpi-grid">
        <div className="card">
          <h3 style={{ marginTop: 0 }}>General Overview</h3>
          <p className="muted">Monthly KPI summary: billing, collection, unpaid balances, and alerts.</p>
          <Link href={`/manager/reports/overview?${defaultScope}`} className="action-link-btn">
            Open General Overview
          </Link>
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Money Overview</h3>
          <p className="muted">Customer count, billed totals, collected totals, and unpaid breakdown.</p>
          <Link href={`/manager/reports/money_overview?${defaultScope}`} className="action-link-btn">
            Open Money Overview
          </Link>
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>kWh Overview</h3>
          <p className="muted">Produced kWh, paying kWh, and free-customer kWh indicators.</p>
          <Link href={`/manager/reports/kwh_overview?${defaultScope}`} className="action-link-btn">
            Open kWh Overview
          </Link>
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Actual vs Reported</h3>
          <p className="muted">Compare actual manual values vs reported app values for kWh and money loss.</p>
          <Link href={`/manager/reports/loss_mrah?${defaultScope}`} className="action-link-btn">
            Open Actual vs Reported
          </Link>
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Monitors Data</h3>
          <p className="muted">Track monitor-linked customers, exceptions, and high-consumption indicators.</p>
          <Link href={`/manager/reports/monitors?${defaultScope}`} className="action-link-btn">
            Open Monitors Data
          </Link>
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Free Customers Data</h3>
          <p className="muted">Review free-customer counts, billed values, and consumed kWh impact.</p>
          <Link href={`/manager/reports/free_customers?${defaultScope}`} className="action-link-btn">
            Open Free Customers Data
          </Link>
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Bills</h3>
          <p className="muted">Track issued bills, paid/unpaid split, and billing completion KPIs.</p>
          <Link href={`/manager/reports/bills?${defaultScope}`} className="action-link-btn">
            Open Bills
          </Link>
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Payments</h3>
          <p className="muted">Monitor collected amounts, payment coverage, and recent receipts.</p>
          <Link href={`/manager/reports/payments?${defaultScope}`} className="action-link-btn">
            Open Payments
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
