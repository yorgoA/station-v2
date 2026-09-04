"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { AppShell } from "../../../_components/app-shell";
import { managerNavItems } from "../../../_components/role-nav";
import { KpiCard, KpiGrid } from "../_components/kpi-components";
import { ReportScopeFilters, ReportScopeLabel, useReportScope } from "../_components/report-scope-controls";
import { formatLbp } from "../../../../lib/format";

function MoneyOverviewReportContent() {
  const searchParams = useSearchParams();
  const { monthKey, setMonthKey, region, setRegion, query } = useReportScope({ searchParams });
  const [money, setMoney] = useState<{
    totalCustomers: number;
    totalToBePaid: number;
    collected: number;
    unpaidCurrent: number;
    previousUnpaid: number;
    unpaidTillToday: number;
  } | null>(null);

  useEffect(() => {
    fetch(`/api/reports/manager?month=${monthKey}&region=${region}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Failed to load money overview.");
        const payload = (await response.json()) as { moneyOverview: NonNullable<typeof money> };
        setMoney(payload.moneyOverview);
      })
      .catch(() => setMoney(null));
  }, [monthKey, region]);

  return (
    <AppShell
      title="Money Overview"
      subtitle="Billing, collection, and unpaid balance indicators"
      navItems={managerNavItems}
    >
      <Link href="/manager/reports" className="back-link">
        ← Back to Reports
      </Link>
      <div className="card money-section">
        <ReportScopeFilters
          idPrefix="money-overview"
          monthKey={monthKey}
          onMonthChange={setMonthKey}
          region={region}
          onRegionChange={setRegion}
          allRegionsLabel="All"
        />
        <ReportScopeLabel monthKey={monthKey} region={region} />
        <KpiGrid>
          <KpiCard tone="money" label="Total customers" value={money?.totalCustomers ?? 0} />
          <KpiCard tone="money" label="Total to be paid" value={formatLbp(money?.totalToBePaid)} />
          <KpiCard tone="money" label="Collected" value={formatLbp(money?.collected)} />
          <KpiCard
            tone="money"
            label="Unpaid total (current month)"
            value={formatLbp(money?.unpaidCurrent)}
            actionHref={`/manager/reports/bills?${query}&status=unpaid`}
            actionLabel="Check Unpaid Bills"
          />
          <KpiCard tone="money" label="Previous unpaid" value={formatLbp(money?.previousUnpaid)} />
          <KpiCard tone="money" label="Unpaid total (till today)" value={formatLbp(money?.unpaidTillToday)} />
        </KpiGrid>
      </div>
    </AppShell>
  );
}

export default function MoneyOverviewReportPage() {
  return (
    <Suspense fallback={<div className="card">Loading report...</div>}>
      <MoneyOverviewReportContent />
    </Suspense>
  );
}
