"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { AppShell } from "../../../_components/app-shell";
import { managerNavItems } from "../../../_components/role-nav";
import { KpiCard, KpiGrid } from "../_components/kpi-components";
import {
  ReportScopeFilters,
  ReportScopeLabel,
  useReportScope,
} from "../_components/report-scope-controls";

function ManagerOverviewReportContent() {
  const searchParams = useSearchParams();
  const { monthKey, setMonthKey, region, setRegion, query } = useReportScope({ searchParams });
  const [overview, setOverview] = useState<{
    totalToBePaid: number;
    collected: number;
    unpaidTillToday: number;
    totalKwhProduced: number;
    payingKwh: number;
    lossPercent: number;
    monitorCustomers: number;
    freeCustomers: number;
    totalCustomers: number;
  } | null>(null);

  useEffect(() => {
    fetch(`/api/reports/manager?month=${monthKey}&region=${region}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Failed to load report overview.");
        const payload = (await response.json()) as { overview: NonNullable<typeof overview> };
        setOverview(payload.overview);
      })
      .catch(() => setOverview(null));
  }, [monthKey, region]);

  return (
    <AppShell
      title="Reports Overview"
      subtitle="Executive summary with direct links to KPI detail pages"
      navItems={managerNavItems}
    >
      <Link href="/manager/reports" className="back-link">
        ← Back to Reports
      </Link>
      <div className="card">
        <ReportScopeFilters
          idPrefix="overview"
          monthKey={monthKey}
          onMonthChange={setMonthKey}
          region={region}
          onRegionChange={setRegion}
        />
        <ReportScopeLabel monthKey={monthKey} region={region} prefix="Scoped to" />
      </div>

      <KpiGrid>
        <KpiCard
          tone="money"
          label="Total to be paid"
          value={overview ? `${overview.totalToBePaid.toLocaleString()} LBP` : "—"}
          actionHref={`/manager/reports/money_overview?${query}`}
          actionLabel="Open Money Overview"
        />
        <KpiCard
          tone="money"
          label="Collected"
          value={overview ? `${overview.collected.toLocaleString()} LBP` : "—"}
          actionHref={`/manager/reports/money_overview?${query}`}
          actionLabel="Open Money Overview"
        />
        <KpiCard
          tone="money"
          label="Unpaid (till today)"
          value={overview ? `${overview.unpaidTillToday.toLocaleString()} LBP` : "—"}
          actionHref={`/manager/reports/money_overview?${query}`}
          actionLabel="Open Money Overview"
        />
        <KpiCard
          tone="kwh"
          label="Total kWh produced"
          value={overview ? `${overview.totalKwhProduced.toLocaleString()} kWh` : "—"}
          actionHref={`/manager/reports/kwh_overview?${query}`}
          actionLabel="Open kWh Overview"
        />
        <KpiCard
          tone="kwh"
          label="Paying kWh"
          value={overview ? `${overview.payingKwh.toLocaleString()} kWh` : "—"}
          actionHref={`/manager/reports/kwh_overview?${query}`}
          actionLabel="Open kWh Overview"
        />
        <KpiCard
          tone="kwh"
          label="Loss % (current month)"
          value={overview ? `${overview.lossPercent.toFixed(2)}%` : "—"}
          actionHref={`/manager/reports/loss_mrah?${query}`}
          actionLabel="Open Actual vs Reported"
        />
        <KpiCard
          tone="kwh"
          label="Monitor customers"
          value={overview ? overview.monitorCustomers : "—"}
          actionHref={`/manager/reports/monitors?${query}`}
          actionLabel="Open Monitors Data"
        />
        <KpiCard
          tone="kwh"
          label="Free customers"
          value={overview ? overview.freeCustomers : "—"}
          actionHref={`/manager/reports/free_customers?${query}`}
          actionLabel="Open Free Customers Data"
        />
        <KpiCard
          label="Total customers"
          value={overview ? overview.totalCustomers : "—"}
          actionHref="/manager/customers"
          actionLabel="Open Customers"
        />
      </KpiGrid>
    </AppShell>
  );
}

export default function ManagerOverviewReportPage() {
  return (
    <Suspense fallback={<div className="card">Loading report...</div>}>
      <ManagerOverviewReportContent />
    </Suspense>
  );
}
