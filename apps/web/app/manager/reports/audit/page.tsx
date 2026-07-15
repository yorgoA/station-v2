"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { AppShell } from "../../../_components/app-shell";
import { managerNavItems } from "../../../_components/role-nav";
import { KpiCard, KpiGrid } from "../_components/kpi-components";
import { ReportTable } from "../_components/report-table";
import { ReportScopeFilters, useReportScope } from "../_components/report-scope-controls";

type AuditEventRow = {
  id: string;
  monthKey: string;
  region: "mrah" | "printania";
  fromStatus: string | null;
  toStatus: string;
  actorName: string;
  note: string;
  createdAt: string;
};

type AuditSummary = {
  totalEvents: number;
  approvals: number;
  rejections: number;
  uniqueBatches: number;
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  pending_review: "Pending Review",
  changes_requested: "Changes Requested",
  approved_posted: "Approved & Posted"
};

function formatStatus(status: string | null) {
  if (!status) return "-";
  return STATUS_LABELS[status] ?? status;
}

function ManagerAuditReportContent() {
  const searchParams = useSearchParams();
  const { monthKey, setMonthKey, region, setRegion } = useReportScope({ searchParams });
  const [events, setEvents] = useState<AuditEventRow[]>([]);
  const [summary, setSummary] = useState<AuditSummary>({
    totalEvents: 0,
    approvals: 0,
    rejections: 0,
    uniqueBatches: 0
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    fetch(`/api/reports/audit?month=${monthKey}&region=${region}`)
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Failed to load audit report.");
        setEvents(payload.events ?? []);
        setSummary(payload.summary ?? { totalEvents: 0, approvals: 0, rejections: 0, uniqueBatches: 0 });
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load audit report.");
        setEvents([]);
      })
      .finally(() => setLoading(false));
  }, [monthKey, region]);

  return (
    <AppShell
      title="Audit Report"
      subtitle="Approval/rejection lifecycle log for billing batches"
      navItems={managerNavItems}
    >
      <div className="card">
        <ReportScopeFilters
          idPrefix="audit"
          monthKey={monthKey}
          onMonthChange={setMonthKey}
          region={region}
          onRegionChange={setRegion}
        />
      </div>
      {error ? <p style={{ color: "var(--danger)" }}>{error}</p> : null}
      <KpiGrid>
        <KpiCard label="Total events" value={summary.totalEvents} />
        <KpiCard label="Approvals" value={summary.approvals} />
        <KpiCard label="Rejections (changes requested)" value={summary.rejections} />
        <KpiCard label="Batches affected" value={summary.uniqueBatches} />
      </KpiGrid>
      <div className="card">
        {loading ? <p className="muted" style={{ marginTop: 0 }}>Loading...</p> : null}
        <ReportTable
          rows={events}
          getRowKey={(row) => row.id}
          emptyMessage="No batch lifecycle events for this scope yet."
          columns={[
            { key: "createdAt", header: "When", render: (row) => new Date(row.createdAt).toLocaleString() },
            { key: "monthKey", header: "Month", render: (row) => row.monthKey },
            { key: "region", header: "Region", render: (row) => row.region },
            {
              key: "transition",
              header: "Transition",
              render: (row) => `${formatStatus(row.fromStatus)} -> ${formatStatus(row.toStatus)}`
            },
            { key: "actorName", header: "Actor", render: (row) => row.actorName },
            { key: "note", header: "Note", render: (row) => row.note || "-" }
          ]}
        />
      </div>
    </AppShell>
  );
}

export default function ManagerAuditReportPage() {
  return (
    <Suspense fallback={<div className="card">Loading report...</div>}>
      <ManagerAuditReportContent />
    </Suspense>
  );
}
