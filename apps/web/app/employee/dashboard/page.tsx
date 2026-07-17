 "use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "../../_components/app-shell";
import { employeeNavItems } from "../../_components/role-nav";
import { type EmployeeRegion } from "../../../lib/types/employee";
import { CURRENT_MONTH_KEY, MONTH_OPTIONS } from "../../../lib/constants/months";

export default function EmployeeDashboardPage() {
  const [notifications, setNotifications] = useState<
    Array<{ id: string; message: string; href: string }>
  >([]);
  const [regionFilter, setRegionFilter] = useState<"all" | EmployeeRegion>("all");
  const [monthKey, setMonthKey] = useState(CURRENT_MONTH_KEY);
  const [pendingQrValidations] = useState(0);
  const [changeRequestedCount, setChangeRequestedCount] = useState(0);

  useEffect(() => {
    const saved = window.localStorage.getItem("employee_dashboard_notifications");
    if (!saved) return;
    try {
      setNotifications(JSON.parse(saved) as Array<{ id: string; message: string; href: string }>);
    } catch {
      window.localStorage.removeItem("employee_dashboard_notifications");
    }
  }, []);

  const [filteredCustomersCount, setFilteredCustomersCount] = useState(0);
  const [pendingEntriesCount, setPendingEntriesCount] = useState(0);
  const [missingReceiptCount, setMissingReceiptCount] = useState(0);

  useEffect(() => {
    const params = new URLSearchParams();
    params.set("month", monthKey);
    if (regionFilter !== "all") params.set("region", regionFilter);
    Promise.all([fetch(`/api/customers?month=${monthKey}&region=${regionFilter}`), fetch(`/api/billing/batches?${params.toString()}`)])
      .then(async ([customersResponse, batchesResponse]) => {
        if (!customersResponse.ok) throw new Error("Failed to load customer stats.");
        if (!batchesResponse.ok) throw new Error("Failed to load batch stats.");
        const customersPayload = (await customersResponse.json()) as {
          customers: Array<{ paidThisMonth: boolean; billEnteredThisMonth?: boolean }>;
        };
        const batchesPayload = (await batchesResponse.json()) as {
          batches?: Array<{ status: string }>;
        };
        const rows = customersPayload.customers ?? [];
        const hasOpenWorkflow = (batchesPayload.batches ?? []).some((batch) =>
          ["pending_review", "changes_requested", "approved_posted"].includes(batch.status)
        );
        setFilteredCustomersCount(rows.length);
        setPendingEntriesCount(hasOpenWorkflow ? 0 : rows.filter((row) => row.billEnteredThisMonth !== true).length);
      })
      .catch(() => {
        setFilteredCustomersCount(0);
        setPendingEntriesCount(0);
      });
  }, [monthKey, regionFilter]);

  useEffect(() => {
    const params = new URLSearchParams();
    params.set("month", monthKey);
    params.set("status", "changes_requested");
    if (regionFilter !== "all") params.set("region", regionFilter);
    fetch(`/api/billing/batches?${params.toString()}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Failed to load change requests.");
        const payload = (await response.json()) as { batches?: Array<{ id: string }> };
        setChangeRequestedCount((payload.batches ?? []).length);
      })
      .catch(() => setChangeRequestedCount(0));
  }, [monthKey, regionFilter]);

  useEffect(() => {
    fetch(`/api/reports/manager?month=${monthKey}&region=${regionFilter}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Failed to load payment receipt stats.");
        const payload = (await response.json()) as {
          payments?: Array<{ receiptRef?: string }>;
        };
        const count = (payload.payments ?? []).filter((payment) => {
          const ref = String(payment.receiptRef ?? "").trim();
          return !ref || ref === "-";
        }).length;
        setMissingReceiptCount(count);
      })
      .catch(() => setMissingReceiptCount(0));
  }, [monthKey, regionFilter]);

  const regionLabel = regionFilter === "all" ? "selected regions" : regionFilter;
  const todayTasks = useMemo(() => {
    const tasks: string[] = [];
    if (pendingEntriesCount > 0) {
      tasks.push(
        `Complete and submit billing entries for ${pendingEntriesCount} customers in ${regionLabel}.`
      );
    }
    if (changeRequestedCount > 0) {
      tasks.push(`Correct manager-requested billing entries for ${changeRequestedCount} batch(es).`);
    }
    if (missingReceiptCount > 0) {
      tasks.push(`Upload missing receipt images for ${missingReceiptCount} payments.`);
    }
    if (pendingQrValidations > 0) {
      tasks.push(`Validate ${pendingQrValidations} QR cash handovers.`);
    }
    return tasks;
  }, [changeRequestedCount, missingReceiptCount, pendingEntriesCount, pendingQrValidations, regionLabel]);

  return (
    <AppShell
      title="Employee Dashboard"
      subtitle="Daily collection and billing operations"
      navItems={employeeNavItems}
      appName="Station V2 - Employee"
    >
      <div className="card">
        <div className="filters-grid filters-grid-pro">
          <label htmlFor="employee-dashboard-region">
            Region
            <select
              id="employee-dashboard-region"
              value={regionFilter}
              onChange={(e) => setRegionFilter(e.target.value as "all" | "mrah" | "printania")}
            >
              <option value="all">All</option>
              <option value="mrah">Mrah</option>
              <option value="printania">Printania</option>
            </select>
          </label>
          <label htmlFor="employee-dashboard-month">
            Month
            <select
              id="employee-dashboard-month"
              value={monthKey}
              onChange={(e) => setMonthKey(e.target.value)}
            >
              {MONTH_OPTIONS.map((month) => (
                <option key={month} value={month}>
                  {month}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <div className="kpi-grid">
        <div className="card">
          <p className="muted">Customers ({monthKey})</p>
          <p className="kpi-value">{filteredCustomersCount}</p>
        </div>
        <div className="card">
          <p className="muted">Pending Entries ({monthKey})</p>
          <p className="kpi-value">{pendingEntriesCount}</p>
        </div>
        {changeRequestedCount > 0 ? (
          <div className="card row-needs-change">
            <p className="muted">Changes Requested ({monthKey})</p>
            <p className="kpi-value">{changeRequestedCount}</p>
          </div>
        ) : null}
        {pendingQrValidations > 0 ? (
          <div className="card">
            <p className="muted">Pending QR Validations ({monthKey})</p>
            <p className="kpi-value">{pendingQrValidations}</p>
          </div>
        ) : null}
      </div>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Quick Actions</h3>
        <div className="card-actions-right" style={{ justifyContent: "flex-start", gap: 8 }}>
          <Link href="/employee/customers/add" className="action-link-btn">
            Add Customer
          </Link>
          <Link href="/employee/customers/add-monitor" className="action-link-btn">
            Add Monitor
          </Link>
        </div>
      </div>
      <div className="card">
        <h3>Today Tasks</h3>
        {todayTasks.length > 0 ? (
          <ul>
            {todayTasks.map((task) => (
              <li key={task}>{task}</li>
            ))}
          </ul>
        ) : (
          <p className="muted">No pending tasks for the selected month and region.</p>
        )}
      </div>
      {notifications.length > 0 && (
        <div className="card row-needs-change">
          <h3 style={{ marginTop: 0 }}>Manager Notifications</h3>
          {notifications.map((notification) => (
            <div key={notification.id} style={{ marginBottom: 10 }}>
              <p style={{ marginTop: 0, marginBottom: 6 }}>{notification.message}</p>
              <Link href={notification.href} className="action-link-btn">
                Open Billing Entry Fix
              </Link>
            </div>
          ))}
        </div>
      )}
      {changeRequestedCount > 0 && (
        <div className="card row-needs-change">
          <h3 style={{ marginTop: 0 }}>Billing Corrections Needed</h3>
          <p>Manager requested changes on {changeRequestedCount} batch(es).</p>
          <Link href={`/employee/billing/preview?month=${monthKey}&region=${regionFilter}`} className="action-link-btn">
            Open Billing Preview
          </Link>
        </div>
      )}
    </AppShell>
  );
}
