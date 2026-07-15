"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "../../_components/app-shell";
import { employeeNavItems } from "../../_components/role-nav";
import { type EmployeePayment, type EmployeeRegion } from "../../../lib/types/employee";

export default function EmployeePaymentsPage() {
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [monthKey, setMonthKey] = useState("2026-05");
  const [amount, setAmount] = useState("");
  const [receiptFile, setReceiptFile] = useState("");
  const [payments, setPayments] = useState<EmployeePayment[]>([]);
  const [customers, setCustomers] = useState<
    Array<{
      id: string;
      customerNumber: string;
      fullName: string;
      region: EmployeeRegion;
      ongoingBalance: number;
      ongoingBalanceCarryOver?: number;
      ongoingBalanceThisMonth?: number;
    }>
  >([]);
  const [search, setSearch] = useState("");
  const [regionFilter, setRegionFilter] = useState<"all" | EmployeeRegion>("all");
  const [monthFilter, setMonthFilter] = useState<"all" | "2026-05" | "2026-04" | "2026-03">("all");
  const [message, setMessage] = useState("");
  useEffect(() => {
    fetch(`/api/customers?region=all&month=${encodeURIComponent(monthKey)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Failed to load customers.");
        const payload = (await response.json()) as { customers: typeof customers };
        setCustomers(payload.customers ?? []);
        if (!selectedCustomerId && payload.customers?.[0]?.id) {
          setSelectedCustomerId(payload.customers[0].id);
        }
      })
      .catch(() => setCustomers([]));
  }, [selectedCustomerId, monthKey]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (regionFilter !== "all") params.set("region", regionFilter);
    if (monthFilter !== "all") params.set("month", monthFilter);
    fetch(`/api/payments?${params.toString()}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Failed to load payments.");
        const payload = (await response.json()) as { payments: EmployeePayment[] };
        setPayments(payload.payments ?? []);
      })
      .catch(() => setPayments([]));
  }, [monthFilter, regionFilter]);
  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.id === selectedCustomerId),
    [customers, selectedCustomerId]
  );

  const filteredPayments = useMemo(
    () =>
      payments.filter((payment) => {
        if (regionFilter !== "all" && payment.region !== regionFilter) return false;
        if (monthFilter !== "all" && !payment.date.startsWith(monthFilter)) return false;
        if (
          search &&
          !`${payment.customerName} ${payment.receipt}`.toLowerCase().includes(search.toLowerCase())
        ) {
          return false;
        }
        return true;
      }),
    [payments, regionFilter, monthFilter, search]
  );

  const totalCollected = filteredPayments.reduce((sum, payment) => sum + payment.amount, 0);
  const selectedCustomerBalance = selectedCustomer?.ongoingBalance ?? 0;
  const selectedCustomerPreviousBalance = selectedCustomer?.ongoingBalanceCarryOver ?? 0;
  const selectedCustomerThisMonthBalance = selectedCustomer?.ongoingBalanceThisMonth ?? 0;

  async function handleRecordPayment() {
    if (!selectedCustomer) {
      setMessage("Please choose a customer.");
      return;
    }
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setMessage("Payment amount must be greater than 0.");
      return;
    }
    if (!receiptFile) {
      setMessage("Please upload a receipt image.");
      return;
    }
    try {
      const response = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: selectedCustomerId,
          customerNumber: selectedCustomer.customerNumber,
          customerName: selectedCustomer.fullName,
          regionCode: selectedCustomer.region,
          monthKey,
          amount: parsedAmount,
          receiptFileName: receiptFile,
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setMessage(payload.error ?? "Failed to record payment.");
        return;
      }
      const refresh = await fetch(`/api/payments?month=${monthKey}&region=${selectedCustomer.region}`);
      const refreshPayload = (await refresh.json()) as { payments: EmployeePayment[] };
      setPayments(refreshPayload.payments ?? []);
      setAmount("");
      setReceiptFile("");
      setMessage("Payment recorded successfully.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unknown payment error.");
    }
  }

  function handlePrintPaymentPdf(paymentId: string) {
    setMessage(`Bill PDF generation is not wired yet for payment ${paymentId}.`);
  }

  function openCustomerFromPayment(customerName: string) {
    setMessage(`Open customer flow is not wired yet for ${customerName}.`);
  }

  return (
    <AppShell
      title="Payments"
      subtitle="Record customer payment with receipt upload"
      navItems={employeeNavItems}
    >
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Record Payment</h3>
        <div className="filters-grid">
          <label htmlFor="payment-customer">
            Customer
            <select id="payment-customer" value={selectedCustomerId} onChange={(e) => setSelectedCustomerId(e.target.value)}>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.fullName} ({customer.customerNumber})
                </option>
              ))}
            </select>
          </label>
          <label htmlFor="payment-month">
            Month
            <select id="payment-month" value={monthKey} onChange={(e) => setMonthKey(e.target.value)}>
              <option value="2026-05">2026-05</option>
              <option value="2026-04">2026-04</option>
              <option value="2026-03">2026-03</option>
            </select>
          </label>
          <label htmlFor="payment-amount">
            Collected amount (LBP)
            <input
              id="payment-amount"
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Enter collected amount in LBP"
            />
          </label>
        </div>
        <div className="info-grid" style={{ marginTop: 10 }}>
          <div>
            <p className="muted">Previous balance carry-over</p>
            <p className="kpi-value">{selectedCustomerPreviousBalance.toFixed(2)} LBP</p>
          </div>
          <div>
            <p className="muted">This month ({monthKey})</p>
            <p className="kpi-value">{selectedCustomerThisMonthBalance.toFixed(2)} LBP</p>
          </div>
          <div>
            <p className="muted">Total due (through {monthKey})</p>
            <p className="kpi-value">{selectedCustomerBalance.toFixed(2)} LBP</p>
          </div>
        </div>
        <p className="muted" style={{ marginTop: 8, marginBottom: 8 }}>
          Total due includes unpaid bills from earlier months until they are paid. Partial payment is
          allowed; any unpaid remainder stays on the bill.
        </p>
        <label htmlFor="payment-receipt">
          Receipt image
          <input
            id="payment-receipt"
            type="file"
            accept="image/*"
            onChange={(e) => setReceiptFile(e.target.files?.[0]?.name ?? "")}
          />
        </label>
        {receiptFile ? <p>Selected: {receiptFile}</p> : null}
        <div className="card-actions-right">
          <button type="button" onClick={handleRecordPayment}>
            Record Payment
          </button>
        </div>
        {message ? <p className="muted">{message}</p> : null}
      </div>

      <div className="card">
        <div className="filters-grid">
          <label htmlFor="payments-search">
            Search
            <input
              id="payments-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Customer or receipt..."
            />
          </label>
          <label htmlFor="payments-region-filter">
            Region
            <select
              id="payments-region-filter"
              value={regionFilter}
              onChange={(e) => setRegionFilter(e.target.value as "all" | "mrah" | "printania")}
            >
              <option value="all">All</option>
              <option value="mrah">Mrah</option>
              <option value="printania">Printania</option>
            </select>
          </label>
          <label htmlFor="payments-month-filter">
            Month
            <select
              id="payments-month-filter"
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value as "all" | "2026-05" | "2026-04" | "2026-03")}
            >
              <option value="all">All</option>
              <option value="2026-05">2026-05</option>
              <option value="2026-04">2026-04</option>
              <option value="2026-03">2026-03</option>
            </select>
          </label>
        </div>
      </div>

      <div className="card">
        <h3>Recent Payments</h3>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Customer</th>
              <th>Region</th>
              <th>Amount</th>
              <th>Receipt</th>
              <th>Print Bill</th>
            </tr>
          </thead>
          <tbody>
            {filteredPayments.map((p) => (
              <tr
                key={p.id}
                className="clickable-row"
                onClick={() => openCustomerFromPayment(p.customerName)}
              >
                <td>{p.date}</td>
                <td>{p.customerName}</td>
                <td>{p.region}</td>
                <td>{p.amount.toFixed(2)} LBP</td>
                <td>{p.receipt}</td>
                <td>
                  <button
                    type="button"
                    className="export-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePrintPaymentPdf(p.id);
                    }}
                  >
                    Print Bill
                  </button>
                </td>
              </tr>
            ))}
            {filteredPayments.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  No payments match current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
