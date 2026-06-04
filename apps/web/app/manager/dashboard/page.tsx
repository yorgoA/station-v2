"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "../../_components/app-shell";
import { managerNavItems } from "../../_components/role-nav";

export default function ManagerDashboardPage() {
  const [showPendingDetails, setShowPendingDetails] = useState(false);
  const [qrModificationTickets, setQrModificationTickets] = useState<Array<Record<string, unknown>>>([]);
  const [approvalBatches, setApprovalBatches] = useState<
    Array<{
      id: string;
      monthKey: string;
      regionCode: string;
      status: "pending_review" | "changes_requested" | "approved_posted";
      submittedAt?: string;
      managerNote?: string;
    }>
  >([]);
  const [monthKey, setMonthKey] = useState("2026-05");
  const [regionFilter, setRegionFilter] = useState<"all" | "mrah" | "printania">("all");

  useEffect(() => {
    const params = new URLSearchParams();
    params.set("month", monthKey);
    if (regionFilter !== "all") params.set("region", regionFilter);
    fetch(`/api/billing/batches?${params.toString()}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Failed to load approval queue metrics.");
        const payload = (await response.json()) as {
          batches: Array<{
            id: string;
            monthKey: string;
            regionCode: string;
            status: "pending_review" | "changes_requested" | "approved_posted";
            submittedAt?: string;
            managerNote?: string;
          }>;
        };
        setApprovalBatches(payload.batches ?? []);
      })
      .catch(() => setApprovalBatches([]));
  }, [monthKey, regionFilter]);

  useEffect(() => {
    const params = new URLSearchParams();
    params.set("month", monthKey);
    if (regionFilter !== "all") params.set("region", regionFilter);
    fetch(`/api/qr-collections/modifications?${params.toString()}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Failed to load manager QR modification alerts.");
        const payload = (await response.json()) as { tickets: Array<Record<string, unknown>> };
        setQrModificationTickets(payload.tickets ?? []);
      })
      .catch(() => setQrModificationTickets([]));
  }, [monthKey, regionFilter]);

  const pendingApprovalCount = useMemo(
    () => approvalBatches.filter((batch) => batch.status === "pending_review").length,
    [approvalBatches]
  );

  const requestedChangesCount = useMemo(
    () => approvalBatches.filter((batch) => batch.status === "changes_requested").length,
    [approvalBatches]
  );

  const approvedCount = useMemo(
    () => approvalBatches.filter((batch) => batch.status === "approved_posted").length,
    [approvalBatches]
  );

  const filteredQrModificationTickets = useMemo(
    () =>
      qrModificationTickets.filter((ticket) => {
        const ticketMonth = String(ticket.monthKey ?? "");
        if (monthKey !== ticketMonth) return false;
        if (regionFilter === "all") return true;
        return String(ticket.region ?? "").toLowerCase() === regionFilter;
      }),
    [monthKey, qrModificationTickets, regionFilter]
  );

  const monitorExcessCount = 0;
  const hasNotifications =
    pendingApprovalCount > 0 ||
    filteredQrModificationTickets.length > 0 ||
    monitorExcessCount > 0;

  return (
    <AppShell
      title="Manager Dashboard"
      subtitle="Manager-only overview and approvals monitoring"
      navItems={managerNavItems}
      appName="Station V2 - Manager"
    >
      <div className="header-row card" style={{ marginBottom: 12 }}>
        <div className="filters-grid filters-grid-pro" style={{ width: "100%" }}>
          <label htmlFor="manager-dashboard-month">
            Month
            <select
              id="manager-dashboard-month"
              value={monthKey}
              onChange={(e) => setMonthKey(e.target.value)}
            >
              <option value="2026-05">2026-05</option>
              <option value="2026-04">2026-04</option>
            </select>
          </label>
          <label htmlFor="manager-dashboard-region">
            Region
            <select
              id="manager-dashboard-region"
              value={regionFilter}
              onChange={(e) => setRegionFilter(e.target.value as "all" | "mrah" | "printania")}
            >
              <option value="all">All</option>
              <option value="mrah">Mrah</option>
              <option value="printania">Printania</option>
            </select>
          </label>
        </div>
      </div>

      <div className="header-row card" style={{ marginBottom: 12 }}>
        <button
          type="button"
          className="notify-chip"
          title="Pending approval queue"
          onClick={() => setShowPendingDetails((v) => !v)}
        >
          <span className="notify-dot" />
          {pendingApprovalCount} pending approvals
        </button>
        <Link href="/manager/approvals" className="action-link-btn">
          Open Approvals Queue
        </Link>
      </div>

      {showPendingDetails && (
        <div className="card">
          <ul>
            <li>{pendingApprovalCount} monthly billing batches pending review.</li>
            <li>{requestedChangesCount} batches currently in changes-requested state.</li>
            <li>{approvedCount} batches approved for posting in selected filter.</li>
          </ul>
        </div>
      )}

      {filteredQrModificationTickets.length > 0 && (
        <div className="card row-needs-change">
          <h3 style={{ marginTop: 0 }}>QR Modification Alerts</h3>
          <p className="muted">
            Employee-edited collector tickets requiring manager visibility.
          </p>
          <table>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Month</th>
                <th>Amount Change</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {filteredQrModificationTickets.slice(0, 10).map((ticket) => (
                <tr key={String(ticket.id)}>
                  <td>{String(ticket.customerName ?? "-")}</td>
                  <td>{String(ticket.monthKey ?? "-")}</td>
                  <td>
                    {String(ticket.collectedAmount ?? "-")} {String(ticket.currency ?? "LBP")}
                  </td>
                  <td>{String(ticket.reason ?? "-")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className={`card ${hasNotifications ? "row-needs-change" : ""}`}>
        <h3 style={{ marginTop: 0 }}>Notifications</h3>
        <ul>
          {pendingApprovalCount > 0 && <li>Pending approvals ({monthKey}): {pendingApprovalCount}</li>}
          {filteredQrModificationTickets.length > 0 && (
            <li>QR modification alerts: {filteredQrModificationTickets.length}</li>
          )}
          {monitorExcessCount > 0 && (
            <li>Monitor excess (red match): {monitorExcessCount} accounts require immediate review.</li>
          )}
        </ul>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Reports Shortcut</h3>
        <p className="muted">
          Money and kWh indicators are moved to Reports to keep dashboard focused on approvals and alerts.
        </p>
        <Link href="/manager/reports" className="action-link-btn">
          Open Reports
        </Link>
      </div>

    </AppShell>
  );
}
