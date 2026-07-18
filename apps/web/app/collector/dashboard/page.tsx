"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "../../_components/app-shell";
import { collectorNavItems } from "../../_components/role-nav";
import { type EmployeeRegion } from "../../../lib/types/employee";
import { CURRENT_MONTH_KEY } from "../../../lib/constants/months";
import { useAvailableMonths } from "../../../lib/hooks/use-available-months";

export default function CollectorDashboardPage() {
  const router = useRouter();
  const [regionFilter, setRegionFilter] = useState<"all" | EmployeeRegion>("all");
  const [monthKey, setMonthKey] = useState(CURRENT_MONTH_KEY);
  const months = useAvailableMonths();
  const [filteredCustomers, setFilteredCustomers] = useState<Array<{
    id: string;
    name: string;
    phone: string;
    boxNumber: string;
    building: string;
    billAmount: number;
    paidThisMonth: boolean;
  }>>([]);

  useEffect(() => {
    fetch(`/api/customers?month=${monthKey}&region=${regionFilter}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Failed to load collector customers.");
        const payload = (await response.json()) as {
          customers: Array<{
            id: string;
            fullName: string;
            phone: string;
            boxNumber: string;
            building: string;
            ongoingBalance: number;
            paidThisMonth: boolean;
          }>;
        };
        setFilteredCustomers(
          (payload.customers ?? []).map((customer) => ({
            id: customer.id,
            name: customer.fullName,
            phone: customer.phone,
            boxNumber: customer.boxNumber,
            building: customer.building,
            billAmount: customer.ongoingBalance ?? 0,
            paidThisMonth: customer.paidThisMonth,
          }))
        );
      })
      .catch(() => setFilteredCustomers([]));
  }, [monthKey, regionFilter]);
  const remainingCustomers = useMemo(
    () => filteredCustomers.filter((customer) => !customer.paidThisMonth).length,
    [filteredCustomers]
  );
  const pendingCustomers = filteredCustomers.filter((customer) => !customer.paidThisMonth);

  return (
    <AppShell
      title="Collector Dashboard"
      subtitle="Scan bills and collect payments"
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
        <p className="muted" style={{ marginBottom: 6 }}>Remaining customers</p>
        <p className="kpi-value" style={{ marginTop: 0 }}>{remainingCustomers}</p>
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
        <h3 style={{ marginTop: 0 }}>Customers still needing scan</h3>
        <table>
          <thead>
            <tr>
              <th>Customer</th>
              <th>Phone</th>
              <th>Bill ({monthKey})</th>
              <th>Box</th>
              <th>Building</th>
            </tr>
          </thead>
          <tbody>
            {pendingCustomers.map((customer) => (
              <tr key={customer.id}>
                <td>{customer.name}</td>
                <td>
                  <a href={`tel:${customer.phone.replace(/\s+/g, "")}`} className="action-link-btn">
                    {customer.phone}
                  </a>
                </td>
                <td>{customer.billAmount.toFixed(2)} LBP</td>
                <td>{customer.boxNumber}</td>
                <td>{customer.building}</td>
              </tr>
            ))}
            {pendingCustomers.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">
                  All customers in this filter are already scanned/paid for this month.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
