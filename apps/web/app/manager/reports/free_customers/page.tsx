"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { AppShell } from "../../../_components/app-shell";
import { managerNavItems } from "../../../_components/role-nav";
import { KpiCard, KpiGrid } from "../_components/kpi-components";
import { ReportTable } from "../_components/report-table";
import { ReportScopeFilters, useReportScope } from "../_components/report-scope-controls";
import { resolveAmperePrice, type AmpereTier, type MonthlyTariff } from "../../../../lib/reports/pricing";

type FreeCustomerRow = {
  customer: string;
  region: "mrah" | "printania";
  consumedKwh: number;
  reason: string;
  subscribedAmpere: number;
};

function ManagerFreeCustomersReportContent() {
  const searchParams = useSearchParams();
  const { monthKey, setMonthKey, region, setRegion } = useReportScope({ searchParams });
  const [ampereTiers, setAmpereTiers] = useState<AmpereTier[]>([]);
  const [monthlyTariffs, setMonthlyTariffs] = useState<MonthlyTariff[]>([]);
  const kwhPrice = monthlyTariffs.find((row) => row.monthKey === monthKey)?.kwhPrice ?? 0;
  const [baseRows, setBaseRows] = useState<FreeCustomerRow[]>([]);

  useEffect(() => {
    fetch("/api/settings/pricing")
      .then(async (response) => {
        if (!response.ok) return;
        const payload = (await response.json()) as { ampereTiers: AmpereTier[]; monthlyTariffs: MonthlyTariff[] };
        setAmpereTiers(payload.ampereTiers ?? []);
        setMonthlyTariffs(payload.monthlyTariffs ?? []);
      })
      .catch(() => {
        setAmpereTiers([]);
        setMonthlyTariffs([]);
      });
  }, []);

  useEffect(() => {
    fetch(`/api/reports/manager?month=${monthKey}&region=${region}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Failed to load free customers report.");
        const payload = (await response.json()) as { freeCustomers: FreeCustomerRow[] };
        setBaseRows(payload.freeCustomers ?? []);
      })
      .catch(() => setBaseRows([]));
  }, [monthKey, region]);

  const rows = useMemo(
    () =>
      baseRows
        .filter((row) => region === "all" || row.region === region)
        .map((row) => {
          const ampereCharge = resolveAmperePrice(ampereTiers, row.subscribedAmpere) ?? 0;
          const consumptionCharge = Math.round(row.consumedKwh * kwhPrice);
          const estimatedValue = ampereCharge + consumptionCharge;
          return {
            ...row,
            ampereCharge,
            consumptionCharge,
            estimatedValue,
          };
        }),
    [baseRows, ampereTiers, kwhPrice, region]
  );
  const totalFreeKwh = rows.reduce((sum, row) => sum + row.consumedKwh, 0);
  const totalEstimatedValue = rows.reduce((sum, row) => sum + row.estimatedValue, 0);

  return (
    <AppShell
      title="Free Customers Data"
      subtitle="Free-customer counts, consumed kWh, and estimated value impact"
      navItems={managerNavItems}
    >
      <Link href="/manager/reports" className="back-link">
        ← Back to Reports
      </Link>
      <div className="card">
        <ReportScopeFilters
          idPrefix="free-customers"
          monthKey={monthKey}
          onMonthChange={setMonthKey}
          region={region}
          onRegionChange={setRegion}
        />
      </div>
      {kwhPrice === 0 ? (
        <p className="muted">No kWh price is set for {monthKey} yet (Settings → Pricing) — estimated values below will show as 0 until it is.</p>
      ) : null}
      <KpiGrid>
        <KpiCard label="Total free customers" value={rows.length} />
        <KpiCard label="Free customers kWh" value={`${totalFreeKwh.toLocaleString()} kWh`} />
        <KpiCard label="kWh price used" value={`${kwhPrice.toLocaleString()} LBP`} />
        <KpiCard label="Estimated value impact" value={`${totalEstimatedValue.toLocaleString()} LBP`} />
      </KpiGrid>
      <div className="card">
        <ReportTable
          rows={rows}
          getRowKey={(row) => row.customer}
          columns={[
            { key: "customer", header: "Customer", render: (row) => row.customer },
            { key: "region", header: "Region", render: (row) => row.region },
            { key: "consumedKwh", header: "Consumed kWh", render: (row) => row.consumedKwh },
            { key: "ampereCharge", header: "Ampere charge", render: (row) => `${row.ampereCharge.toLocaleString()} LBP` },
            { key: "consumptionCharge", header: "kWh charge", render: (row) => `${row.consumptionCharge.toLocaleString()} LBP` },
            { key: "estimatedValue", header: "Estimated value", render: (row) => `${row.estimatedValue.toLocaleString()} LBP` },
            { key: "reason", header: "Reason", render: (row) => row.reason },
          ]}
        />
      </div>
    </AppShell>
  );
}

export default function ManagerFreeCustomersReportPage() {
  return (
    <Suspense fallback={<div className="card">Loading report...</div>}>
      <ManagerFreeCustomersReportContent />
    </Suspense>
  );
}
