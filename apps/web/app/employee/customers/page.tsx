"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "../../_components/app-shell";
import { employeeNavItems } from "../../_components/role-nav";
import { type EmployeeBillingType, type EmployeeRegion, type EmployeeStatus } from "../../../lib/types/employee";
import { CURRENT_MONTH_KEY } from "../../../lib/constants/months";
import { useAvailableMonths } from "../../../lib/hooks/use-available-months";

type EmployeeCustomerRow = {
  id: string;
  fullName: string;
  customerNumber: string;
  region: EmployeeRegion;
  billingType: EmployeeBillingType | "free";
  phone: string;
  boxNumber: string;
  building: string;
  status: EmployeeStatus;
  paidThisMonth: boolean;
  ongoingBalance: number;
};

export default function EmployeeCustomersPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [monthKey, setMonthKey] = useState(CURRENT_MONTH_KEY);
  const months = useAvailableMonths();
  const [region, setRegion] = useState<"all" | EmployeeRegion>("all");
  const [status, setStatus] = useState<"all" | EmployeeStatus>("all");
  const [billingType, setBillingType] = useState<"all" | EmployeeBillingType | "free">("all");
  const [paymentStatus, setPaymentStatus] = useState<"all" | "paid" | "unpaid">("all");
  const [balanceStatus, setBalanceStatus] = useState<"all" | "has-balance" | "no-balance">("all");
  const [building, setBuilding] = useState("all");
  const [boxNumber, setBoxNumber] = useState("all");
  const [showColumns, setShowColumns] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [employeeCustomers, setEmployeeCustomers] = useState<EmployeeCustomerRow[]>([]);
  const [visibleColumns, setVisibleColumns] = useState({
    billingType: true,
    phone: true,
    box: true,
    building: true,
    status: true,
    paidThisMonth: true,
    ongoingBalance: true
  });

  useEffect(() => {
    fetch(`/api/customers?month=${monthKey}&region=${region}&view=customers`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Failed to load customers.");
        const payload = (await response.json()) as { customers: EmployeeCustomerRow[] };
        setEmployeeCustomers(payload.customers ?? []);
      })
      .catch(() => setEmployeeCustomers([]));
  }, [monthKey, region]);

  const buildingOptions = useMemo(
    () => Array.from(new Set(employeeCustomers.map((c) => c.building))),
    [employeeCustomers]
  );
  const boxOptions = useMemo(
    () => Array.from(new Set(employeeCustomers.map((c) => c.boxNumber))),
    [employeeCustomers]
  );

  const rows = useMemo(
    () =>
      employeeCustomers.filter((c) => {
        const byRegion = region === "all" || c.region === region;
        const byStatus = status === "all" || c.status === status;
        const byBillingType = billingType === "all" || c.billingType === billingType;
        const thisMonthPayment = c.paidThisMonth ? "paid" : "unpaid";
        const thisMonthBalance = c.ongoingBalance ?? 0;
        const byPaymentStatus = paymentStatus === "all" || thisMonthPayment === paymentStatus;
        const byBalanceStatus =
          balanceStatus === "all" ||
          (balanceStatus === "has-balance" ? thisMonthBalance > 0 : thisMonthBalance <= 0);
        const byBuilding = building === "all" || c.building === building;
        const byBox = boxNumber === "all" || c.boxNumber === boxNumber;
        const q = search.trim().toLowerCase();
        const bySearch =
          q === "" ||
          c.fullName.toLowerCase().includes(q) ||
          c.customerNumber.toLowerCase().includes(q) ||
          c.phone.toLowerCase().includes(q);
        return (
          byRegion &&
          byStatus &&
          byBillingType &&
          byPaymentStatus &&
          byBalanceStatus &&
          byBuilding &&
          byBox &&
          bySearch
        );
      }),
    [balanceStatus, billingType, boxNumber, building, employeeCustomers, paymentStatus, region, search, status]
  );

  function resetAllFilters() {
    setSearch("");
    setMonthKey(CURRENT_MONTH_KEY);
    setRegion("all");
    setStatus("all");
    setBillingType("all");
    setPaymentStatus("all");
    setBalanceStatus("all");
    setBuilding("all");
    setBoxNumber("all");
  }

  function csvEscape(value: string) {
    if (value.includes(",") || value.includes('"') || value.includes("\n")) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  function handleExportCsv() {
    const headers = ["Customer", "Region"];
    if (visibleColumns.billingType) headers.push("Billing Type");
    if (visibleColumns.phone) headers.push("Phone");
    if (visibleColumns.box) headers.push("Box");
    if (visibleColumns.building) headers.push("Building");
    if (visibleColumns.status) headers.push("Status");
    if (visibleColumns.paidThisMonth) headers.push(`Paid This Month (${monthKey})`);
    if (visibleColumns.ongoingBalance) headers.push(`Total Due (through ${monthKey})`);

    const csvRows = rows.map((c) => {
      const values = [`${c.fullName} (${c.customerNumber})`, c.region];
      if (visibleColumns.billingType) values.push(c.billingType);
      if (visibleColumns.phone) values.push(c.phone);
      if (visibleColumns.box) values.push(c.boxNumber);
      if (visibleColumns.building) values.push(c.building);
      if (visibleColumns.status) values.push(c.status);
      if (visibleColumns.paidThisMonth) {
        values.push(c.paidThisMonth ? "Yes" : "No");
      }
      if (visibleColumns.ongoingBalance) {
        values.push((c.ongoingBalance ?? 0).toFixed(2));
      }
      return values.map((v) => csvEscape(String(v))).join(",");
    });

    const csvContent = [headers.map(csvEscape).join(","), ...csvRows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const fileName = `customers_${monthKey}_${region}_${paymentStatus}_${balanceStatus}.csv`;
    link.href = url;
    link.setAttribute("download", fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return (
    <AppShell
      title="Customers"
      subtitle="Employee can view and update phone, box number, building, and status"
      navItems={employeeNavItems}
    >
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Filters</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          Quick search plus advanced filters.
        </p>
        <label htmlFor="customer-search" className="search-highlight">
          Search Customer
          <input
            id="customer-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, number, phone..."
          />
        </label>
        <div style={{ marginBottom: 8 }}>
          <button type="button" className="show-all-btn" onClick={resetAllFilters}>
            Show All Customers
          </button>
        </div>
        <button
          type="button"
          className="link-btn"
          onClick={() => setShowAdvancedFilters((v) => !v)}
        >
          {showAdvancedFilters ? "Hide more filters" : "More filters"}
        </button>
        {showAdvancedFilters && (
          <div className="filters-grid" style={{ marginTop: 10 }}>
            <label htmlFor="customer-month-filter">
              Month
              <select
                id="customer-month-filter"
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
            <label htmlFor="customer-region-filter">
              Region
              <select
                id="customer-region-filter"
                value={region}
                onChange={(e) => setRegion(e.target.value as "all" | "mrah" | "printania")}
              >
                <option value="all">All</option>
                <option value="mrah">Mrah</option>
                <option value="printania">Printania</option>
              </select>
            </label>
            <label htmlFor="customer-status-filter">
              Status
              <select
                id="customer-status-filter"
                value={status}
                onChange={(e) => setStatus(e.target.value as "all" | "active" | "paused")}
              >
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
              </select>
            </label>
            <label htmlFor="customer-billing-type-filter">
              Billing Type
              <select
                id="customer-billing-type-filter"
                value={billingType}
                onChange={(e) =>
                  setBillingType(e.target.value as "all" | EmployeeBillingType | "free")
                }
              >
                <option value="all">All</option>
                <option value="both">Both</option>
                <option value="fixed-monthly">Fixed Monthly</option>
                <option value="free">Free</option>
                <option value="metered">Metered</option>
                <option value="amp-only">Amp Only</option>
              </select>
            </label>
            <label htmlFor="customer-building-filter">
              Building
              <select
                id="customer-building-filter"
                value={building}
                onChange={(e) => setBuilding(e.target.value)}
              >
                <option value="all">All</option>
                {buildingOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </label>
            <label htmlFor="customer-box-filter">
              Box
              <select
                id="customer-box-filter"
                value={boxNumber}
                onChange={(e) => setBoxNumber(e.target.value)}
              >
                <option value="all">All</option>
                {boxOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </label>
            <label htmlFor="customer-payment-status-filter">
              Paid This Month
              <select
                id="customer-payment-status-filter"
                value={paymentStatus}
                onChange={(e) => setPaymentStatus(e.target.value as "all" | "paid" | "unpaid")}
              >
                <option value="all">All</option>
                <option value="paid">Paid</option>
                <option value="unpaid">Unpaid</option>
              </select>
            </label>
            <label htmlFor="customer-balance-status-filter">
              Ongoing Balance
              <select
                id="customer-balance-status-filter"
                value={balanceStatus}
                onChange={(e) =>
                  setBalanceStatus(e.target.value as "all" | "has-balance" | "no-balance")
                }
              >
                <option value="all">All</option>
                <option value="has-balance">Has balance</option>
                <option value="no-balance">No balance</option>
              </select>
            </label>
          </div>
        )}
        <div className="filters-actions">
          <div>
            <button type="button" onClick={() => setShowColumns((v) => !v)}>
              {showColumns ? "Hide Columns" : "Columns"}
            </button>{" "}
            {showAdvancedFilters && (
              <button
                type="button"
                onClick={resetAllFilters}
              >
                Reset Filters
              </button>
            )}
          </div>
          <button type="button" onClick={handleExportCsv} className="export-btn">
            Export CSV
          </button>
        </div>
        {showColumns && (
          <div className="columns-panel">
            {(
              Object.keys(visibleColumns) as Array<keyof typeof visibleColumns>
            ).map((key) => (
              <label key={key}>
                <input
                  type="checkbox"
                  checked={visibleColumns[key]}
                  onChange={(e) =>
                    setVisibleColumns((prev) => ({ ...prev, [key]: e.target.checked }))
                  }
                />{" "}
                {key}
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Customer</th>
              <th>Region</th>
              {visibleColumns.billingType && <th>Billing Type</th>}
              {visibleColumns.phone && <th>Phone</th>}
              {visibleColumns.box && <th>Box</th>}
              {visibleColumns.building && <th>Building</th>}
              {visibleColumns.status && <th>Status</th>}
              {visibleColumns.paidThisMonth && <th>Paid This Month ({monthKey})</th>}
              {visibleColumns.ongoingBalance && <th>Total Due (through {monthKey})</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr
                key={c.id}
                className="clickable-row"
                role="link"
                tabIndex={0}
                onClick={() => router.push(`/employee/customers/${c.id}`)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    router.push(`/employee/customers/${c.id}`);
                  }
                }}
              >
                <td>
                  {c.fullName}
                  <br />
                  <span className="muted">{c.customerNumber}</span>
                </td>
                <td>{c.region}</td>
                {visibleColumns.billingType && <td>{c.billingType}</td>}
                {visibleColumns.phone && <td>{c.phone}</td>}
                {visibleColumns.box && <td>{c.boxNumber}</td>}
                {visibleColumns.building && <td>{c.building}</td>}
                {visibleColumns.status && <td>{c.status}</td>}
                {visibleColumns.paidThisMonth && (
                  <td>{c.paidThisMonth ? "Yes" : "No"}</td>
                )}
                {visibleColumns.ongoingBalance && (
                  <td>${(c.ongoingBalance ?? 0).toFixed(2)}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
