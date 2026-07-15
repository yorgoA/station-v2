"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { AppShell } from "../../../_components/app-shell";
import { managerNavItems } from "../../../_components/role-nav";
import { KpiCard, KpiGrid } from "../_components/kpi-components";
import { ReportTable } from "../_components/report-table";
import { ReportScopeFilters, useReportScope } from "../_components/report-scope-controls";
import type { MonthlyTariff } from "../../../../lib/reports/pricing";

type MonitorRow = {
  customer: string;
  region: "mrah" | "printania";
  monitorUsageKwh: number;
  linkedFixedMonthlyTotal: number;
  linkedObligatoryCustomer: string;
};

function ManagerMonitorsReportContent() {
  const searchParams = useSearchParams();
  const { monthKey, setMonthKey, region, setRegion } = useReportScope({ searchParams });
  const [monthlyTariffs, setMonthlyTariffs] = useState<MonthlyTariff[]>([]);
  const kwhPrice = monthlyTariffs.find((row) => row.monthKey === monthKey)?.kwhPrice ?? 0;
  const [baseRows, setBaseRows] = useState<MonitorRow[]>([]);

  useEffect(() => {
    fetch("/api/settings/pricing")
      .then(async (response) => {
        if (!response.ok) return;
        const payload = (await response.json()) as { monthlyTariffs: MonthlyTariff[] };
        setMonthlyTariffs(payload.monthlyTariffs ?? []);
      })
      .catch(() => setMonthlyTariffs([]));
  }, []);

  useEffect(() => {
    fetch(`/api/reports/manager?month=${monthKey}&region=${region}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Failed to load monitors report.");
        const payload = (await response.json()) as { monitors: MonitorRow[] };
        setBaseRows(payload.monitors ?? []);
      })
      .catch(() => setBaseRows([]));
  }, [monthKey, region]);

  const rows = useMemo(
    () =>
      baseRows
        .filter((row) => region === "all" || row.region === region)
        .map((row) => {
          const linkedIncludedKwh = kwhPrice > 0 ? row.linkedFixedMonthlyTotal / kwhPrice : 0;
          const matchKwh = row.monitorUsageKwh - linkedIncludedKwh;
          const overuseKwh = Math.max(0, matchKwh);
          return {
            ...row,
            linkedIncludedKwh,
            matchKwh,
            overuseKwh,
            status: overuseKwh > 0 ? "Overusing" : "Within allowance",
          };
        }),
    [baseRows, kwhPrice, region]
  );

  const overusingCount = rows.filter((row) => row.overuseKwh > 0).length;
  const unlinkedCount = rows.filter((row) => row.linkedObligatoryCustomer === "Missing link").length;
  const totalOveruseKwh = rows.reduce((sum, row) => sum + row.overuseKwh, 0);

  return (
    <AppShell
      title="Monitors"
      subtitle={`Compare monitor usage vs linked fixed-plan kWh allowance for theft detection in ${
        region === "all" ? "All regions" : region
      }.`}
      navItems={managerNavItems}
    >
      <div className="card">
        <ReportScopeFilters
          idPrefix="monitors"
          monthKey={monthKey}
          onMonthChange={setMonthKey}
          region={region}
          onRegionChange={setRegion}
        />
      </div>
      {kwhPrice === 0 ? (
        <p className="muted">
          No kWh price is set for {monthKey} yet (Settings → Pricing) — linked included kWh below will show as 0
          until it is.
        </p>
      ) : null}
      <KpiGrid>
        <KpiCard label="Total monitor customers" value={rows.length} />
        <KpiCard label="Unlinked obligatory monitors" value={unlinkedCount} />
        <KpiCard label="Overusing monitors" value={overusingCount} />
        <KpiCard label="Overuse total" value={`${totalOveruseKwh.toLocaleString(undefined, { maximumFractionDigits: 1 })} kWh`} />
      </KpiGrid>
      <div className="card">
        {rows.length === 0 ? (
          <p className="muted" style={{ marginTop: 0 }}>
            No monitor report data available.
          </p>
        ) : null}
        <ReportTable
          rows={rows}
          getRowKey={(row) => row.customer}
          columns={[
            { key: "customer", header: "Customer", render: (row) => row.customer },
            { key: "region", header: "Region", render: (row) => row.region },
            { key: "monitorUsageKwh", header: "Monitor kWh", render: (row) => row.monitorUsageKwh },
            {
              key: "linkedIncludedKwh",
              header: "Linked included kWh",
              render: (row) => row.linkedIncludedKwh.toLocaleString(undefined, { maximumFractionDigits: 1 }),
            },
            {
              key: "matchKwh",
              header: "Match (monitor - linked)",
              render: (row) => row.matchKwh.toLocaleString(undefined, { maximumFractionDigits: 1 }),
            },
            {
              key: "overuseKwh",
              header: "Overuse kWh",
              render: (row) => row.overuseKwh.toLocaleString(undefined, { maximumFractionDigits: 1 }),
            },
            { key: "status", header: "Assessment", render: (row) => row.status },
            {
              key: "linkedObligatoryCustomer",
              header: "Linked obligatory customer",
              render: (row) => row.linkedObligatoryCustomer,
            },
          ]}
        />
      </div>
    </AppShell>
  );
}

export default function ManagerMonitorsReportPage() {
  return (
    <Suspense fallback={<div className="card">Loading report...</div>}>
      <ManagerMonitorsReportContent />
    </Suspense>
  );
}
