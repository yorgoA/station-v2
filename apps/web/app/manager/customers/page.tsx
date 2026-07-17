"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "../../_components/app-shell";
import { managerNavItems } from "../../_components/role-nav";
import { type EmployeeBillingType, type EmployeeRegion, type EmployeeStatus } from "../../../lib/types/employee";
import { CURRENT_MONTH_KEY, MONTH_OPTIONS } from "../../../lib/constants/months";

type ManagerCustomerRow = {
  id: string;
  fullName: string;
  customerNumber: string;
  region: EmployeeRegion;
  billingType: EmployeeBillingType | "free";
  phone: string;
  building: string;
  boxNumber: string;
  status: EmployeeStatus;
  paidThisMonth: boolean;
  ongoingBalance: number;
};

export default function ManagerCustomersPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [monthKey, setMonthKey] = useState(CURRENT_MONTH_KEY);
  const [region, setRegion] = useState<"all" | EmployeeRegion>("all");
  const [status, setStatus] = useState<"all" | EmployeeStatus>("all");
  const [billingType, setBillingType] = useState<"all" | EmployeeBillingType | "free">("all");
  const [paymentStatus, setPaymentStatus] = useState<"all" | "paid" | "unpaid">("all");
  const [balanceStatus, setBalanceStatus] = useState<"all" | "has-balance" | "no-balance">("all");
  const [building, setBuilding] = useState("all");
  const [boxNumber, setBoxNumber] = useState("all");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [managerCustomers, setManagerCustomers] = useState<ManagerCustomerRow[]>([]);

  useEffect(() => {
    fetch(`/api/customers?month=${monthKey}&region=${region}&status=${status}&view=customers`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Failed to load customers.");
        const payload = (await response.json()) as { customers: ManagerCustomerRow[] };
        setManagerCustomers(payload.customers ?? []);
      })
      .catch(() => setManagerCustomers([]));
  }, [monthKey, region, status]);

  const buildingOptions = useMemo(
    () => Array.from(new Set(managerCustomers.map((c) => c.building).filter(Boolean))),
    [managerCustomers]
  );
  const boxOptions = useMemo(
    () => Array.from(new Set(managerCustomers.map((c) => c.boxNumber).filter(Boolean))),
    [managerCustomers]
  );

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return managerCustomers.filter((customer) => {
      const byRegion = region === "all" || customer.region === region;
      const byStatus = status === "all" || customer.status === status;
      const byBillingType = billingType === "all" || customer.billingType === billingType;
      const thisMonthPayment = customer.paidThisMonth ? "paid" : "unpaid";
      const thisMonthBalance = customer.ongoingBalance ?? 0;
      const byPaymentStatus = paymentStatus === "all" || thisMonthPayment === paymentStatus;
      const byBalanceStatus =
        balanceStatus === "all" ||
        (balanceStatus === "has-balance" ? thisMonthBalance > 0 : thisMonthBalance <= 0);
      const byBuilding = building === "all" || customer.building === building;
      const byBox = boxNumber === "all" || customer.boxNumber === boxNumber;
      const bySearch =
        q === "" ||
        customer.fullName.toLowerCase().includes(q) ||
        customer.customerNumber.toLowerCase().includes(q) ||
        customer.phone.toLowerCase().includes(q);
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
    });
  }, [balanceStatus, billingType, boxNumber, building, managerCustomers, paymentStatus, region, search, status]);

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

  return (
    <AppShell
      title="Customers"
      subtitle="Manager view with advanced customer filters"
      navItems={managerNavItems}
    >
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Filters</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          Quick search plus advanced filters.
        </p>
        <label htmlFor="manager-customers-search" className="search-highlight">
          Search Customer
          <input
            id="manager-customers-search"
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
            <label htmlFor="manager-customers-month-filter">
              Month
              <select
                id="manager-customers-month-filter"
                value={monthKey}
                onChange={(e) => setMonthKey(e.target.value)}
              >
                {MONTH_OPTIONS.map((month) => (
                  <option key={month} value={month}>
                    {month}
                  </option>
                ))}
              </select>
            </label>
            <label htmlFor="manager-customers-region-filter">
              Region
              <select
                id="manager-customers-region-filter"
                value={region}
                onChange={(e) => setRegion(e.target.value as "all" | "mrah" | "printania")}
              >
                <option value="all">All</option>
                <option value="mrah">Mrah</option>
                <option value="printania">Printania</option>
              </select>
            </label>
            <label htmlFor="manager-customers-status-filter">
              Status
              <select
                id="manager-customers-status-filter"
                value={status}
                onChange={(e) => setStatus(e.target.value as "all" | "active" | "paused")}
              >
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
              </select>
            </label>
            <label htmlFor="manager-customers-billing-type-filter">
              Billing Type
              <select
                id="manager-customers-billing-type-filter"
                value={billingType}
                onChange={(e) => setBillingType(e.target.value as "all" | EmployeeBillingType | "free")}
              >
                <option value="all">All</option>
                <option value="both">Both</option>
                <option value="fixed-monthly">Fixed Monthly</option>
                <option value="free">Free</option>
                <option value="metered">Metered</option>
                <option value="amp-only">Amp Only</option>
              </select>
            </label>
            <label htmlFor="manager-customers-building-filter">
              Building
              <select
                id="manager-customers-building-filter"
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
            <label htmlFor="manager-customers-box-filter">
              Box
              <select
                id="manager-customers-box-filter"
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
            <label htmlFor="manager-customers-payment-status-filter">
              Paid This Month
              <select
                id="manager-customers-payment-status-filter"
                value={paymentStatus}
                onChange={(e) => setPaymentStatus(e.target.value as "all" | "paid" | "unpaid")}
              >
                <option value="all">All</option>
                <option value="paid">Paid</option>
                <option value="unpaid">Unpaid</option>
              </select>
            </label>
            <label htmlFor="manager-customers-balance-status-filter">
              Ongoing Balance
              <select
                id="manager-customers-balance-status-filter"
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
      </div>

      <div className="card">
        <p className="muted" style={{ marginTop: 0 }}>
          Total customers in current filter: <strong>{rows.length}</strong>
        </p>
        <table>
          <thead>
            <tr>
              <th>Customer</th>
              <th>Number</th>
              <th>Region</th>
              <th>Billing Type</th>
              <th>Phone</th>
              <th>Building</th>
              <th>Box</th>
              <th>Status</th>
              <th>Paid This Month ({monthKey})</th>
              <th>Ongoing Balance ({monthKey})</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((customer) => (
              <tr
                key={customer.id}
                className="clickable-row"
                role="link"
                tabIndex={0}
                onClick={() => router.push(`/manager/customers/${customer.id}`)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    router.push(`/manager/customers/${customer.id}`);
                  }
                }}
              >
                <td>{customer.fullName}</td>
                <td>{customer.customerNumber}</td>
                <td>{customer.region}</td>
                <td>{customer.billingType}</td>
                <td>{customer.phone}</td>
                <td>{customer.building}</td>
                <td>{customer.boxNumber}</td>
                <td>{customer.status}</td>
                <td>{customer.paidThisMonth ? "Yes" : "No"}</td>
                <td>${(customer.ongoingBalance ?? 0).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
