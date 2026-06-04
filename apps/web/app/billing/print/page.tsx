"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "../../_components/app-shell";

type PrintBatch = {
  id: string;
  monthKey: string;
  region: "mrah" | "printania";
  status: "draft" | "pending_review" | "changes_requested" | "approved_posted";
};

function statusLabel(status: PrintBatch["status"]) {
  if (status === "approved_posted") return "Approved by manager";
  if (status === "pending_review") return "Waiting manager review";
  if (status === "changes_requested") return "Changes requested by manager";
  return "Draft";
}

export default function BillingPrintPage() {
  const [batches, setBatches] = useState<PrintBatch[]>([]);
  const [monthFilter, setMonthFilter] = useState<"all" | string>("all");
  const [regionFilter, setRegionFilter] = useState<"all" | "mrah" | "printania">("all");

  useEffect(() => {
    fetch("/api/billing/batches")
      .then(async (response) => {
        if (!response.ok) throw new Error("Failed to load print statuses.");
        const payload = (await response.json()) as {
          batches: Array<{
            id: string;
            monthKey: string;
            regionCode: string;
            status: "draft" | "pending_review" | "changes_requested" | "approved_posted";
          }>;
        };
        const mapped: PrintBatch[] = [];
        for (const batch of payload.batches ?? []) {
          if (batch.regionCode !== "mrah" && batch.regionCode !== "printania") continue;
          mapped.push({
            id: batch.id,
            monthKey: batch.monthKey,
            region: batch.regionCode,
            status: batch.status,
          });
        }
        setBatches(mapped);
      })
      .catch(() => setBatches([]));
  }, []);

  const monthOptions = useMemo(
    () => Array.from(new Set(batches.map((batch) => batch.monthKey))).sort((a, b) => (a < b ? 1 : -1)),
    [batches]
  );

  const filteredBatches = useMemo(
    () =>
      batches.filter((batch) => {
        if (monthFilter !== "all" && batch.monthKey !== monthFilter) return false;
        if (regionFilter !== "all" && batch.region !== regionFilter) return false;
        return true;
      }),
    [batches, monthFilter, regionFilter]
  );

  return (
    <AppShell
      title="Billing Print"
      subtitle="Print is available only for manager-approved monthly batches"
    >
      <div className="card">
        <p className="muted" style={{ margin: 0 }}>
          Each card shows a month/region print status. PDF print is enabled only after manager confirmation.
        </p>
      </div>

      <div className="card">
        <div className="filters-grid filters-grid-pro">
          <label htmlFor="billing-print-month-filter">
            Month
            <select
              id="billing-print-month-filter"
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
            >
              <option value="all">All</option>
              {monthOptions.map((month) => (
                <option key={month} value={month}>
                  {month}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor="billing-print-region-filter">
            Region
            <select
              id="billing-print-region-filter"
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

      {filteredBatches.map((batch) => {
        const canPrint = batch.status === "approved_posted";
        return (
          <div className="card" key={batch.id}>
            <h3 style={{ marginTop: 0 }}>
              {batch.monthKey} - {batch.region}
            </h3>
            <p className="muted">Status: {statusLabel(batch.status)}</p>
            <button
              type="button"
              disabled={!canPrint}
              title={
                canPrint
                  ? "Generate print-ready PDF (3 bills per page)"
                  : "Disabled until manager approval"
              }
            >
              {canPrint ? "Print PDF (3 per page)" : "Print locked"}
            </button>
          </div>
        );
      })}
      {filteredBatches.length === 0 && (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            No print batches match the selected filters.
          </p>
        </div>
      )}
    </AppShell>
  );
}
