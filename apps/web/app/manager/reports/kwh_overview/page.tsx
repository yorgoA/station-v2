"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { AppShell } from "../../../_components/app-shell";
import { managerNavItems } from "../../../_components/role-nav";
import { KpiCard, KpiGrid } from "../_components/kpi-components";
import { ReportScopeFilters, ReportScopeLabel, useReportScope } from "../_components/report-scope-controls";
import { formatKwh } from "../../../../lib/format";

function KwhOverviewReportContent() {
  const searchParams = useSearchParams();
  const { monthKey, setMonthKey, region, setRegion } = useReportScope({ searchParams });
  const [kwh, setKwh] = useState<{
    totalKwhProduced: number;
    payingKwh: number;
    freeKwh: number;
  } | null>(null);

  useEffect(() => {
    fetch(`/api/reports/manager?month=${monthKey}&region=${region}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Failed to load kWh overview.");
        const payload = (await response.json()) as { kwhOverview: NonNullable<typeof kwh> };
        setKwh(payload.kwhOverview);
      })
      .catch(() => setKwh(null));
  }, [monthKey, region]);

  return (
    <AppShell
      title="kWh Overview"
      subtitle="Production and consumption indicators"
      navItems={managerNavItems}
    >
      <Link href="/manager/reports" className="back-link">
        ← Back to Reports
      </Link>
      <div className="card kwh-section">
        <ReportScopeFilters
          idPrefix="kwh-overview"
          monthKey={monthKey}
          onMonthChange={setMonthKey}
          region={region}
          onRegionChange={setRegion}
          allRegionsLabel="All"
        />
        <ReportScopeLabel monthKey={monthKey} region={region} />
        <KpiGrid>
          <KpiCard tone="kwh" label="Total kWh produced" value={formatKwh(kwh?.totalKwhProduced ?? 0)} />
          <KpiCard tone="kwh" label="Paying kWh" value={formatKwh(kwh?.payingKwh ?? 0)} />
          <KpiCard tone="kwh" label="Free customers kWh" value={formatKwh(kwh?.freeKwh ?? 0)} />
        </KpiGrid>
      </div>
    </AppShell>
  );
}

export default function KwhOverviewReportPage() {
  return (
    <Suspense fallback={<div className="card">Loading report...</div>}>
      <KwhOverviewReportContent />
    </Suspense>
  );
}
