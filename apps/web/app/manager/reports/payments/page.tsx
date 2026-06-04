"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { AppShell } from "../../../_components/app-shell";
import { managerNavItems } from "../../../_components/role-nav";
import { KpiCard, KpiGrid } from "../_components/kpi-components";
import { ReportTable } from "../_components/report-table";
import { ReportScopeFilters, useReportScope } from "../_components/report-scope-controls";

function ManagerPaymentsReportContent() {
  const searchParams = useSearchParams();
  const { monthKey, setMonthKey, region, setRegion } = useReportScope({ searchParams });
  const [paymentRows, setPaymentRows] = useState<Array<{
    customer: string;
    region: string;
    date: string;
    amount: string;
    method: string;
    receiptRef: string;
  }>>([]);

  useEffect(() => {
    fetch(`/api/reports/manager?month=${monthKey}&region=${region}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Failed to load payments report.");
        const payload = (await response.json()) as { payments: typeof paymentRows };
        setPaymentRows(payload.payments ?? []);
      })
      .catch(() => setPaymentRows([]));
  }, [monthKey, region]);

  const kpis = useMemo(() => {
    const totalCollected = paymentRows.reduce((sum, row) => {
      const raw = Number(String(row.amount).replace(/[^\d.-]/g, ""));
      return sum + (Number.isFinite(raw) ? raw : 0);
    }, 0);
    const count = paymentRows.length;
    const avg = count > 0 ? totalCollected / count : 0;
    return { totalCollected, count, avg };
  }, [paymentRows]);

  return (
    <AppShell title="Payments" subtitle="Collection performance and recent payment activity" navItems={managerNavItems}>
      <Link href="/manager/reports" className="back-link">
        ← Back to Reports
      </Link>
      <div className="card">
        <ReportScopeFilters
          idPrefix="payments"
          monthKey={monthKey}
          onMonthChange={setMonthKey}
          region={region}
          onRegionChange={setRegion}
        />
      </div>

      <KpiGrid>
        <KpiCard label="Total collected" value={`${kpis.totalCollected.toLocaleString()} LBP`} />
        <KpiCard label="Payments count" value={kpis.count} />
        <KpiCard label="Average payment" value={`${kpis.avg.toLocaleString(undefined, { maximumFractionDigits: 2 })} LBP`} />
        <KpiCard label="Collection coverage" value="0.0%" />
      </KpiGrid>

      <div className="card">
        <ReportTable
          rows={paymentRows}
          getRowKey={(row) => `${row.customer}-${row.date}`}
          emptyMessage="No payments match current filters."
          columns={[
            { key: "customer", header: "Customer", render: (row) => row.customer },
            { key: "region", header: "Region", render: (row) => row.region },
            { key: "date", header: "Date", render: (row) => row.date },
            { key: "amount", header: "Amount", render: (row) => row.amount },
            { key: "method", header: "Method", render: (row) => row.method },
            { key: "receiptRef", header: "Receipt Ref", render: (row) => row.receiptRef },
          ]}
        />
      </div>
    </AppShell>
  );
}

export default function ManagerPaymentsReportPage() {
  return (
    <Suspense fallback={<div className="card">Loading report...</div>}>
      <ManagerPaymentsReportContent />
    </Suspense>
  );
}
