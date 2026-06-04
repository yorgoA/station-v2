"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "../../_components/app-shell";
import { managerNavItems } from "../../_components/role-nav";

type MonitorRow = {
  id: string;
  fullName: string;
  customerNumber: string;
  monitorCategory: "theft-controller" | "elevator" | "-";
  linkedTo: string;
  linkedCustomerId: string;
  linkedCustomerName: string;
  monitorKwh: number;
  linkedIncludedKwh: number;
  monitorMatchKwh: number;
};

export default function ManagerMonitorsPage() {
  const router = useRouter();
  const [monthKey, setMonthKey] = useState("2026-05");
  const [region, setRegion] = useState<"all" | "mrah" | "printania">("all");
  const [rows, setRows] = useState<MonitorRow[]>([]);

  useEffect(() => {
    fetch(`/api/customers?month=${monthKey}&region=${region}&view=monitors`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Failed to load monitors.");
        const payload = (await response.json()) as { customers?: MonitorRow[] };
        setRows(payload.customers ?? []);
      })
      .catch(() => setRows([]));
  }, [monthKey, region]);

  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => a.fullName.localeCompare(b.fullName)),
    [rows]
  );

  return (
    <AppShell title="Monitors" subtitle="Monitor-linked customers" navItems={managerNavItems}>
      <div className="card">
        <div className="filters-grid filters-grid-pro">
          <label>
            Month
            <select value={monthKey} onChange={(e) => setMonthKey(e.target.value)}>
              <option value="2026-05">2026-05</option>
              <option value="2026-04">2026-04</option>
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
      <div className="card">
        <p className="muted" style={{ marginTop: 0 }}>
          Total monitor customers: <strong>{sortedRows.length}</strong>
        </p>
        <table>
          <thead>
            <tr>
              <th>Monitor</th>
              <th>Category</th>
              <th>Linked to</th>
              <th>Monitor kWh</th>
              <th>Linked kWh (included)</th>
              <th>Match</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row) => (
              <tr
                key={row.id}
                className="clickable-row"
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
                  {row.linkedCustomerId ? (
                    <button
                      type="button"
                      className="link-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/manager/customers/${row.linkedCustomerId}`);
                      }}
                    >
                      {row.linkedCustomerName}
                    </button>
                  ) : (
                    "Missing link"
                  )}
                </td>
                <td>{(row.monitorKwh ?? 0).toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
                <td>{(row.linkedIncludedKwh ?? 0).toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
                <td>{(row.monitorMatchKwh ?? 0).toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
