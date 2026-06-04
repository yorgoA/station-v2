"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { AppShell } from "../../../_components/app-shell";
import { managerNavItems } from "../../../_components/role-nav";
import { KpiCard, KpiGrid } from "../_components/kpi-components";
import { ReportTable } from "../_components/report-table";
import {
  type BillReportRow,
  type BillStatus,
} from "../../../../lib/types/reports";
import { ReportScopeFilters, useReportScope } from "../_components/report-scope-controls";

function ManagerBillsReportContent() {
  const searchParams = useSearchParams();
  const { monthKey, setMonthKey, region, setRegion } = useReportScope({ searchParams });
  const [billRows, setBillRows] = useState<BillReportRow[]>([]);
  const [status, setStatus] = useState<"all" | BillStatus>(
    (searchParams.get("status") as "all" | BillStatus) ?? "all"
  );

  useEffect(() => {
    fetch(`/api/reports/manager?month=${monthKey}&region=${region}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Failed to load bills report.");
        const payload = (await response.json()) as { bills: BillReportRow[] };
        setBillRows(payload.bills ?? []);
      })
      .catch(() => setBillRows([]));
  }, [monthKey, region]);

  const filteredRows = useMemo(
    () =>
      billRows.filter((row) => {
        const byMonth = row.monthKey === monthKey;
        const byRegion = region === "all" || row.region === region;
        const byStatus = status === "all" || row.status === status;
        return byMonth && byRegion && byStatus;
      }),
    [monthKey, region, status]
  );

  const billsIssued = filteredRows.length;
  const billsPaid = filteredRows.filter((row) => row.status === "paid").length;
  const billsUnpaid = filteredRows.filter((row) => row.status === "unpaid").length;
  const completion = billsIssued > 0 ? `${((billsPaid / billsIssued) * 100).toFixed(1)}%` : "0.0%";

  return (
    <AppShell title="Bills" subtitle="Issued bills, paid/unpaid status, and billing completion KPIs" navItems={managerNavItems}>
      <Link href="/manager/reports" className="back-link">
        ← Back to Reports
      </Link>
      <div className="card">
        <ReportScopeFilters
          idPrefix="bills"
          monthKey={monthKey}
          onMonthChange={setMonthKey}
          region={region}
          onRegionChange={setRegion}
        >
          <label htmlFor="bills-status">
            Status
            <select
              id="bills-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as "all" | BillStatus)}
            >
              <option value="all">All</option>
              <option value="paid">Paid</option>
              <option value="unpaid">Unpaid</option>
            </select>
          </label>
        </ReportScopeFilters>
      </div>

      <KpiGrid>
        <KpiCard label="Bills issued" value={billsIssued} />
        <KpiCard label="Bills paid" value={billsPaid} />
        <KpiCard label="Bills unpaid" value={billsUnpaid} />
        <KpiCard label="Billing completion" value={completion} />
      </KpiGrid>

      <div className="card">
        <ReportTable
          rows={filteredRows}
          getRowKey={(row) => `${row.customer}-${row.monthKey}`}
          emptyMessage="No bills match current filters."
          columns={[
            { key: "customer", header: "Customer", render: (row) => row.customer },
            { key: "region", header: "Region", render: (row) => row.region },
            { key: "monthKey", header: "Bill Month", render: (row) => row.monthKey },
            { key: "amount", header: "Bill Amount", render: (row) => `${row.amount} ${row.currency}` },
            { key: "status", header: "Status", render: (row) => (row.status === "paid" ? "Paid" : "Unpaid") },
            { key: "billingType", header: "Billing Type", render: (row) => row.billingType },
          ]}
        />
      </div>
    </AppShell>
  );
}

export default function ManagerBillsReportPage() {
  return (
    <Suspense fallback={<div className="card">Loading report...</div>}>
      <ManagerBillsReportContent />
    </Suspense>
  );
}
