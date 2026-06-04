 "use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "../../_components/app-shell";

function badgeColor(status: string) {
  if (status === "pending_review") return "#92400e";
  if (status === "changes_requested") return "#991b1b";
  if (status === "approved_posted") return "#065f46";
  return "#374151";
}

function actionLabelByStatus(status: "pending_review" | "changes_requested" | "approved_posted") {
  if (status === "pending_review") return "Review";
  if (status === "changes_requested") return "Review Sent Batch";
  return "Open Batch";
}

function formatManagerNote(note?: string) {
  if (!note) return "";
  return note.replace(/\[[0-9a-f-]{8,}\]\s*/gi, "").trim();
}

export default function BillingApprovalsPage() {
  const [monthFilter, setMonthFilter] = useState<"all" | string>("all");
  const [regionFilter, setRegionFilter] = useState<"all" | "mrah" | "printania">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending_review" | "changes_requested" | "approved_posted">("all");
  const [serverQueue, setServerQueue] = useState<
    Array<{
      id: string;
      monthKey: string;
      regionCode: string;
      status: "pending_review" | "changes_requested" | "approved_posted";
      submittedAt?: string;
      managerNote?: string;
    }>
  >([]);
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/billing/batches")
      .then(async (response) => {
        if (!response.ok) throw new Error("Failed to load month options.");
        const payload = (await response.json()) as {
          batches: Array<{ monthKey: string }>;
        };
        const months = Array.from(new Set((payload.batches ?? []).map((batch) => batch.monthKey))).sort(
          (a, b) => (a < b ? 1 : -1)
        );
        setAvailableMonths(months);
      })
      .catch(() => setAvailableMonths([]));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (monthFilter !== "all") params.set("month", monthFilter);
    if (regionFilter !== "all") params.set("region", regionFilter);
    if (statusFilter !== "all") params.set("status", statusFilter);
    fetch(`/api/billing/batches?${params.toString()}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Failed to load approval queue.");
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
        setServerQueue(payload.batches ?? []);
      })
      .catch(() => {
        setServerQueue([]);
      });
  }, [monthFilter, regionFilter, statusFilter]);

  const filteredQueue = useMemo(
    () =>
      serverQueue.map((batch) => ({
        ...batch,
        submittedBy: "System",
        itemsCount: 0,
        totalAmount: 0,
      })),
    [serverQueue]
  );
  const pendingCount = filteredQueue.filter((batch) => batch.status === "pending_review").length;
  const changesCount = filteredQueue.filter((batch) => batch.status === "changes_requested").length;
  const approvedCount = filteredQueue.filter((batch) => batch.status === "approved_posted").length;

  return (
    <AppShell
      title="Billing Approvals"
      subtitle="Manager review queue"
    >
      <div className="status-legend status-legend-page" aria-label="approvals color code">
        <span className="status-legend-item danger">Red: pending review</span>
        <span className="status-legend-item changes">Orange: changes requested</span>
        <span className="status-legend-item success">Green: approved</span>
      </div>
      <div className="card">
        <div className="filters-grid filters-grid-pro">
          <label htmlFor="approvals-month-filter">
            Month
            <select
              id="approvals-month-filter"
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
            >
              <option value="all">All</option>
              {availableMonths.map((month) => (
                <option key={month} value={month}>
                  {month}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor="approvals-region-filter">
            Region
            <select
              id="approvals-region-filter"
              value={regionFilter}
              onChange={(e) => setRegionFilter(e.target.value as "all" | "mrah" | "printania")}
            >
              <option value="all">All regions</option>
              <option value="mrah">Mrah</option>
              <option value="printania">Printania</option>
            </select>
          </label>
          <label htmlFor="approvals-status-filter">
            Status
            <select
              id="approvals-status-filter"
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(
                  e.target.value as "all" | "pending_review" | "changes_requested" | "approved_posted"
                )
              }
            >
              <option value="all">All</option>
              <option value="pending_review">Pending review</option>
              <option value="changes_requested">Changes requested</option>
              <option value="approved_posted">Approved</option>
            </select>
          </label>
        </div>
      </div>
      <div className="kpi-grid">
        <div className="card">
          <p className="muted">Pending</p>
          <p className="kpi-value">{pendingCount}</p>
        </div>
        <div className="card">
          <p className="muted">Changes requested</p>
          <p className="kpi-value">{changesCount}</p>
        </div>
        <div className="card">
          <p className="muted">Approved</p>
          <p className="kpi-value">{approvedCount}</p>
        </div>
      </div>
      {filteredQueue.map((batch) => (
        <div
          className={`card batch-status-card ${
            batch.status === "approved_posted"
              ? "tone-success"
              : batch.status === "changes_requested"
                ? "tone-changes"
                : "tone-danger"
          }`}
          key={batch.id}
        >
          <h3 style={{ marginTop: 0 }}>
            Review: {batch.monthKey} - {batch.regionCode}
          </h3>
          <p>
            Status:{" "}
            <span style={{ color: badgeColor(batch.status), fontWeight: 600 }}>
              {batch.status}
            </span>
          </p>
          <p>
            Submitted by {"submittedBy" in batch ? batch.submittedBy : "System"} at {batch.submittedAt ?? "-"}
          </p>
          <p>
            Items: {"itemsCount" in batch ? batch.itemsCount : 0} | Total amount: {"totalAmount" in batch ? batch.totalAmount.toFixed(2) : "0.00"}
          </p>
          {batch.managerNote && <p>Manager note: {formatManagerNote(batch.managerNote)}</p>}
          <Link href={`/manager/approvals/${batch.id}`} className="action-link-btn">
            {actionLabelByStatus(batch.status)}
          </Link>
        </div>
      ))}
      {filteredQueue.length === 0 && (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>No approval batches found for current filters.</p>
        </div>
      )}
    </AppShell>
  );
}
