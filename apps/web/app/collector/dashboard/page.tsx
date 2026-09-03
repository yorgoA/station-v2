"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "../../_components/app-shell";
import { collectorNavItems } from "../../_components/role-nav";
import { type EmployeeRegion } from "../../../lib/types/employee";
import { CURRENT_MONTH_KEY } from "../../../lib/constants/months";
import { formatLbp } from "../../../lib/format";
import { useAvailableMonths } from "../../../lib/hooks/use-available-months";

type CollectorCustomer = {
  id: string;
  customerNumber: string;
  name: string;
  building: string;
  priceToPay: number;
  paidThisMonth: boolean;
  isMonitor: boolean;
};

type QrLog = {
  customerId: string;
  customerNumber: string;
  status?: "pending_employee_validation" | "validated_by_employee";
};

type CollectionStatus = "to_collect" | "pending" | "validated";

const STATUS_LABEL: Record<CollectionStatus, string> = {
  to_collect: "To collect",
  pending: "Scanned — awaiting employee validation",
  validated: "Validated",
};
const STATUS_COLOR: Record<CollectionStatus, string> = {
  to_collect: "var(--danger)",
  pending: "var(--warning)",
  validated: "var(--success)",
};
const STATUS_ORDER: Record<CollectionStatus, number> = { to_collect: 0, pending: 1, validated: 2 };

export default function CollectorDashboardPage() {
  const router = useRouter();
  const [regionFilter, setRegionFilter] = useState<"all" | EmployeeRegion>("all");
  const [monthKey, setMonthKey] = useState(CURRENT_MONTH_KEY);
  const months = useAvailableMonths();
  const [customers, setCustomers] = useState<CollectorCustomer[]>([]);
  const [qrLogs, setQrLogs] = useState<QrLog[]>([]);

  useEffect(() => {
    fetch(`/api/customers?month=${monthKey}&region=${regionFilter}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Failed to load collector customers.");
        const payload = (await response.json()) as {
          customers: Array<{
            id: string;
            customerNumber: string;
            fullName: string;
            building: string;
            ongoingBalance: number;
            paidThisMonth: boolean;
            isMonitor?: boolean;
          }>;
        };
        setCustomers(
          (payload.customers ?? []).map((customer) => ({
            id: customer.id,
            customerNumber: customer.customerNumber,
            name: customer.fullName,
            building: customer.building,
            priceToPay: customer.ongoingBalance ?? 0,
            paidThisMonth: customer.paidThisMonth,
            isMonitor: Boolean(customer.isMonitor),
          }))
        );
      })
      .catch(() => setCustomers([]));
  }, [monthKey, regionFilter]);

  useEffect(() => {
    fetch(`/api/qr-collections?status=all&month=${monthKey}&region=${regionFilter}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Failed to load QR collections.");
        const payload = (await response.json()) as { logs: QrLog[] };
        setQrLogs(payload.logs ?? []);
      })
      .catch(() => setQrLogs([]));
  }, [monthKey, regionFilter]);

  const rows = useMemo(() => {
    const qrByCustomer = new Map<string, QrLog["status"]>();
    for (const log of qrLogs) {
      // Keep the most advanced status seen for a customer this month.
      const key = log.customerId || log.customerNumber;
      const existing = qrByCustomer.get(key);
      if (existing === "validated_by_employee") continue;
      qrByCustomer.set(key, log.status);
    }
    return customers
      .filter((customer) => !customer.isMonitor)
      .filter((customer) => customer.priceToPay > 0 || customer.paidThisMonth || qrByCustomer.has(customer.id) || qrByCustomer.has(customer.customerNumber))
      .map((customer) => {
        const qrStatus = qrByCustomer.get(customer.id) ?? qrByCustomer.get(customer.customerNumber);
        const status: CollectionStatus =
          customer.paidThisMonth || qrStatus === "validated_by_employee"
            ? "validated"
            : qrStatus === "pending_employee_validation"
              ? "pending"
              : "to_collect";
        return { ...customer, status };
      })
      .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.name.localeCompare(b.name));
  }, [customers, qrLogs]);

  const toCollectCount = rows.filter((row) => row.status === "to_collect").length;
  const pendingCount = rows.filter((row) => row.status === "pending").length;
  const validatedCount = rows.filter((row) => row.status === "validated").length;

  return (
    <AppShell
      title="Collector Dashboard"
      subtitle="Scan bills, collect payments, and track what's still owed"
      navItems={collectorNavItems}
      appName="Station V2 - Collector"
    >
      <div className="card">
        <div className="filters-grid filters-grid-pro">
          <label htmlFor="collector-dashboard-region">
            Region
            <select
              id="collector-dashboard-region"
              value={regionFilter}
              onChange={(e) => setRegionFilter(e.target.value as "all" | "mrah" | "printania")}
            >
              <option value="all">All</option>
              <option value="mrah">Mrah</option>
              <option value="printania">Printania</option>
            </select>
          </label>
          <label htmlFor="collector-dashboard-month">
            Month
            <select
              id="collector-dashboard-month"
              value={monthKey}
              onChange={(e) => setMonthKey(e.target.value)}
            >
              {months.map((month) => (
                <option key={month} value={month}>
                  {month}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="kpi-grid" style={{ marginTop: 4 }}>
          <div>
            <p className="muted" style={{ marginBottom: 4 }}>To collect</p>
            <p className="kpi-value" style={{ marginTop: 0, color: "var(--danger)" }}>{toCollectCount}</p>
          </div>
          <div>
            <p className="muted" style={{ marginBottom: 4 }}>Awaiting validation</p>
            <p className="kpi-value" style={{ marginTop: 0, color: "var(--warning)" }}>{pendingCount}</p>
          </div>
          <div>
            <p className="muted" style={{ marginBottom: 4 }}>Validated</p>
            <p className="kpi-value" style={{ marginTop: 0, color: "var(--success)" }}>{validatedCount}</p>
          </div>
        </div>
        <div className="card-actions-right">
          <button
            type="button"
            className="show-all-btn"
            onClick={() => router.push(`/collector/scan?openCamera=1&month=${monthKey}`)}
          >
            Open Camera
          </button>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Customers — {monthKey}</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          Scanning marks a bill on this dashboard for your own tracking. The payment is only final once an
          employee confirms it under Review QR.
        </p>
        <table>
          <thead>
            <tr>
              <th>Number</th>
              <th>Customer</th>
              <th>Building</th>
              <th>Price to pay</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.customerNumber}</td>
                <td>{row.name}</td>
                <td>{row.building || "—"}</td>
                <td>{formatLbp(row.priceToPay)}</td>
                <td style={{ color: STATUS_COLOR[row.status] }}>{STATUS_LABEL[row.status]}</td>
                <td>
                  {row.status === "to_collect" ? (
                    <button
                      type="button"
                      className="action-link-btn"
                      onClick={() =>
                        router.push(
                          `/collector/scan?customerNumber=${encodeURIComponent(row.customerNumber)}&month=${monthKey}`
                        )
                      }
                    >
                      Scan
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  Nothing to collect for this month and region.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
