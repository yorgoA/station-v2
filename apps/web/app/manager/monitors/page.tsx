"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "../../_components/app-shell";
import { managerNavItems } from "../../_components/role-nav";
import { CURRENT_MONTH_KEY } from "../../../lib/constants/months";
import { formatNumber } from "../../../lib/format";
import { useAvailableMonths } from "../../../lib/hooks/use-available-months";

type MonitorRow = {
  id: string;
  fullName: string;
  customerNumber: string;
  monitorCategory: "theft-controller" | "elevator" | "-";
  linkedTo: string;
  linkedCustomers: Array<{ id: string; fullName: string; customerNumber: string }>;
  linkedCustomerId: string;
  linkedCustomerName: string;
  monitorKwh: number;
  linkedIncludedKwh: number;
  linkedKwhAvailable: boolean;
  monitorMatchKwh: number;
  monitorOverBudget: boolean;
  startingCounter: number;
};

export default function ManagerMonitorsPage() {
  const router = useRouter();
  const [monthKey, setMonthKey] = useState(CURRENT_MONTH_KEY);
  const months = useAvailableMonths();
  const [region, setRegion] = useState<"all" | "mrah" | "printania">("all");
  const [rows, setRows] = useState<MonitorRow[]>([]);
  const [kwhPriceAvailable, setKwhPriceAvailable] = useState(true);
  const [kwhPriceThisMonth, setKwhPriceThisMonth] = useState(0);

  useEffect(() => {
    fetch(`/api/customers?month=${monthKey}&region=${region}&view=monitors`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Failed to load monitors.");
        const payload = (await response.json()) as {
          customers?: MonitorRow[];
          kwhPriceAvailable?: boolean;
          kwhPriceThisMonth?: number;
        };
        setRows(payload.customers ?? []);
        setKwhPriceAvailable(payload.kwhPriceAvailable ?? true);
        setKwhPriceThisMonth(payload.kwhPriceThisMonth ?? 0);
      })
      .catch(() => setRows([]));
  }, [monthKey, region]);

  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => a.fullName.localeCompare(b.fullName)),
    [rows]
  );

  const totals = useMemo(() => {
    const monitorKwh = sortedRows.reduce((sum, row) => sum + (row.monitorKwh ?? 0), 0);
    const linkedIncludedKwh = sortedRows.reduce((sum, row) => sum + (row.linkedIncludedKwh ?? 0), 0);
    return { monitorKwh, linkedIncludedKwh, matchKwh: linkedIncludedKwh - monitorKwh };
  }, [sortedRows]);
  const matchColor =
    totals.matchKwh < 0 ? "var(--danger)" : totals.matchKwh > 0 ? "var(--success)" : "var(--text)";

  return (
    <AppShell title="Monitors" subtitle="Monitor-linked customers" navItems={managerNavItems}>
      <div className="card">
        <div className="filters-grid filters-grid-pro">
          <label>
            Month
            <select value={monthKey} onChange={(e) => setMonthKey(e.target.value)}>
              {months.map((month) => (
                <option key={month} value={month}>
                  {month}
                </option>
              ))}
            </select>
          </label>
          <label>
            Region
            <select value={region} onChange={(e) => setRegion(e.target.value as "all" | "mrah" | "printania")}>
              <option value="all">All</option>
              <option value="mrah">Mrah</option>
              <option value="printania">Printania</option>
            </select>
          </label>
        </div>
      </div>

      {sortedRows.length > 0 && (
        <div className="kpi-grid" style={{ marginBottom: 12 }}>
          <div className="card">
            <p className="muted" style={{ margin: 0 }}>
              Monitors
            </p>
            <p className="kpi-value">{sortedRows.length}</p>
          </div>
          <div className="card kpi-kwh">
            <p className="muted" style={{ margin: 0 }}>
              Monitor total ({monthKey})
            </p>
            <p className="kpi-value">{formatNumber(totals.monitorKwh, { maxDecimals: 1 })} kWh</p>
          </div>
          <div className="card kpi-kwh">
            <p className="muted" style={{ margin: 0 }}>
              Linked total
            </p>
            <p className="kpi-value">{formatNumber(totals.linkedIncludedKwh, { maxDecimals: 1 })} kWh</p>
            <p className="muted" style={{ margin: 0, fontSize: "0.78rem" }}>
              {kwhPriceAvailable
                ? `from fixed-monthly ÷ ${formatNumber(kwhPriceThisMonth)} LBP/kWh`
                : "no kWh price set yet"}
            </p>
          </div>
          <div className="card">
            <p className="muted" style={{ margin: 0 }}>
              Match (linked − monitor)
            </p>
            <p className="kpi-value" style={{ color: matchColor }}>
              {formatNumber(totals.matchKwh, { maxDecimals: 1 })} kWh
            </p>
          </div>
        </div>
      )}

      <div className="card">
        <p className="muted" style={{ marginTop: 0 }}>
          Total monitor customers: <strong>{sortedRows.length}</strong>
        </p>
        <p className="muted" style={{ marginTop: 0, fontSize: "0.85rem" }}>
          Linked kWh sums every customer linked to a monitor. For a
          fixed-monthly customer it&apos;s implied from what they pay this month
          divided by this month&apos;s kWh price (they never get a real meter
          reading) — shown as <strong>—</strong> when there&apos;s nothing to base
          that on yet. Rows in red read meaningfully more on the monitor than
          their linked pricing accounts for — their fixed price may no longer
          match real usage.
        </p>
        {!kwhPriceAvailable && (
          <p className="muted" style={{ marginTop: 0, fontSize: "0.85rem" }}>
            No kWh price is set for {monthKey} yet (Settings → Pricing) — fixed-monthly
            customers&apos; linked kWh will show as <strong>—</strong> until it is.
          </p>
        )}
        <table>
          <thead>
            <tr>
              <th>Monitor</th>
              <th>Category</th>
              <th>Linked to</th>
              <th>Starting Counter</th>
              <th>Monitor kWh</th>
              <th>Linked kWh (included)</th>
              <th>Match</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row) => (
              <tr
                key={row.id}
                className={`clickable-row${row.monitorOverBudget ? " row-needs-change" : ""}`}
                role="link"
                tabIndex={0}
                onClick={() => router.push(`/manager/customers/${row.id}`)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    router.push(`/manager/customers/${row.id}`);
                  }
                }}
              >
                <td>
                  <button
                    type="button"
                    className="link-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      router.push(`/manager/customers/${row.id}`);
                    }}
                  >
                    {row.fullName}
                  </button>
                </td>
                <td>{row.monitorCategory}</td>
                <td>
                  {row.linkedCustomers.length > 0 ? (
                    row.linkedCustomers.map((linked, index) => (
                      <span key={linked.id}>
                        {index > 0 ? ", " : ""}
                        <button
                          type="button"
                          className="link-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/manager/customers/${linked.id}`);
                          }}
                        >
                          {linked.fullName}
                        </button>
                      </span>
                    ))
                  ) : (
                    "Missing link"
                  )}
                </td>
                <td>{formatNumber(row.startingCounter ?? 0)}</td>
                <td>{formatNumber(row.monitorKwh ?? 0, { maxDecimals: 1 })}</td>
                <td>
                  {row.linkedKwhAvailable
                    ? formatNumber(row.linkedIncludedKwh ?? 0, { maxDecimals: 1 })
                    : "—"}
                </td>
                <td>
                  {row.linkedKwhAvailable ? formatNumber(row.monitorMatchKwh ?? 0, { maxDecimals: 1 }) : "—"}
                  {row.monitorOverBudget ? (
                    <span className="notify-chip" style={{ marginLeft: 8 }}>
                      Over budget
                    </span>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
