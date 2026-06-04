"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "../../../_components/app-shell";
import { employeeNavItems } from "../../../_components/role-nav";
type Props = { params: { customerId: string } };

export default function EmployeeCustomerDetailsPage({ params }: Props) {
  const [payload, setPayload] = useState<{
    customer: {
      id: string;
      customerNumber: string;
      fullName: string;
      phone: string;
      boxNumber: string;
      building: string;
      region: "mrah" | "printania";
      billingType: "metered" | "fixed-monthly" | "free";
      status: string;
      isMonitor?: boolean;
      linkedCustomerId?: string;
      linkedCustomerName?: string;
    };
    bills: Array<{
      id: string;
      monthKey: string;
      previousCounter: number;
      newCounter: number;
      consumptionKwh: number;
      amount: number;
      remainingAmount: number;
      status: string;
    }>;
    payments: Array<{
      id: string;
      amount: number;
      paymentDate: string;
      receiptRef: string;
    }>;
  } | null>(null);
  const [fullName, setFullName] = useState("");
  const [customerNumber, setCustomerNumber] = useState("");
  const [boxNumber, setBoxNumber] = useState("");
  const [building, setBuilding] = useState("");
  const [allCustomers, setAllCustomers] = useState<
    Array<{ id: string; fullName: string; customerNumber: string; boxNumber?: string; building?: string; isMonitor?: boolean }>
  >([]);
  const [boxMode, setBoxMode] = useState<"existing" | "new">("existing");
  const [buildingMode, setBuildingMode] = useState<"existing" | "new">("existing");
  const [isEditing, setIsEditing] = useState(false);
  const [message, setMessage] = useState("");
  const [linkedCustomerId, setLinkedCustomerId] = useState("");
  const [selectedBillId, setSelectedBillId] = useState<string | null>(null);
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/customers?region=all")
      .then(async (response) => {
        if (!response.ok) throw new Error("Failed to load box/building options.");
        const p = (await response.json()) as {
          customers: Array<{
            id: string;
            fullName: string;
            customerNumber: string;
            boxNumber?: string;
            building?: string;
            isMonitor?: boolean;
          }>;
        };
        setAllCustomers(p.customers ?? []);
      })
      .catch(() => setAllCustomers([]));
  }, []);

  useEffect(() => {
    fetch(`/api/customers/${params.customerId}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Failed to load customer details.");
        const p = (await response.json()) as typeof payload;
        setPayload(p);
        if (p?.customer) {
          setFullName(p.customer.fullName ?? "");
          setCustomerNumber(p.customer.customerNumber ?? "");
          setBoxNumber(p.customer.boxNumber ?? "");
          setBuilding(p.customer.building ?? "");
          setLinkedCustomerId(p.customer.linkedCustomerId ?? "");
        }
      })
      .catch(() => setPayload(null));
  }, [params.customerId]);

  const customer = useMemo(() => payload?.customer, [payload]);
  const bills = useMemo(() => payload?.bills ?? [], [payload]);
  const payments = useMemo(() => payload?.payments ?? [], [payload]);
  const selectedBill = useMemo(
    () => bills.find((bill) => bill.id === selectedBillId) ?? null,
    [bills, selectedBillId]
  );
  const selectedPayment = useMemo(
    () => payments.find((payment) => payment.id === selectedPaymentId) ?? null,
    [payments, selectedPaymentId]
  );
  const boxOptions = useMemo(
    () => Array.from(new Set(allCustomers.map((c) => String(c.boxNumber ?? "").trim()).filter(Boolean))),
    [allCustomers]
  );
  const buildingOptions = useMemo(
    () => Array.from(new Set(allCustomers.map((c) => String(c.building ?? "").trim()).filter(Boolean))),
    [allCustomers]
  );
  const linkableCustomerOptions = useMemo(
    () => allCustomers.filter((candidate) => !candidate.isMonitor && candidate.id !== customer.id),
    [allCustomers, customer?.id]
  );

  if (!customer) {
    return (
      <AppShell title="Customer Not Found" subtitle={`No customer data for ${params.customerId}`} navItems={employeeNavItems}>
        <Link href="/employee/customers" className="back-link">
          ← Back to Customers
        </Link>
      </AppShell>
    );
  }

  async function saveBasicInfo() {
    setMessage("");
    const response = await fetch(`/api/customers/${params.customerId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        section: "customer",
        fullName,
        customerNumber,
        boxNumber,
        building,
        linkedCustomerId: customer.isMonitor ? linkedCustomerId : undefined,
      }),
    });
    const res = (await response.json()) as { error?: string };
    if (!response.ok) {
      setMessage(res.error ?? "Failed to save changes.");
      return;
    }
    setPayload((prev) =>
      prev
        ? {
            ...prev,
            customer: {
              ...prev.customer,
              fullName,
              customerNumber,
              boxNumber,
              building,
              linkedCustomerId: customer.isMonitor ? linkedCustomerId : prev.customer.linkedCustomerId,
              linkedCustomerName: customer.isMonitor
                ? (linkableCustomerOptions.find((opt) => opt.id === linkedCustomerId)
                    ? `${linkableCustomerOptions.find((opt) => opt.id === linkedCustomerId)?.fullName ?? ""} (${linkableCustomerOptions.find((opt) => opt.id === linkedCustomerId)?.customerNumber ?? ""})`
                    : "Missing link")
                : prev.customer.linkedCustomerName,
            },
          }
        : prev
    );
    setIsEditing(false);
    setMessage("Saved.");
  }

  return (
    <AppShell
      title={customer.fullName}
      subtitle={`${customer.isMonitor ? "Monitor" : "Customer"} #${customer.customerNumber}`}
      navItems={employeeNavItems}
    >
      <Link href="/employee/customers" className="back-link">
        ← Back to Customers
      </Link>
      <div className="card">
        {isEditing ? (
          <div className="filters-grid filters-grid-pro">
            <label>
              Name
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </label>
            <label>
              Number
              <input value={customerNumber} readOnly disabled />
            </label>
            {customer.isMonitor ? (
              <label>
                Linked To
                <select value={linkedCustomerId} onChange={(e) => setLinkedCustomerId(e.target.value)}>
                  <option value="">No linked customer</option>
                  {linkableCustomerOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.fullName} ({opt.customerNumber})
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label>
              Box
              {boxMode === "existing" ? (
                <select value={boxNumber} onChange={(e) => setBoxNumber(e.target.value)}>
                  <option value="">Select existing box</option>
                  {boxOptions.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              ) : (
                <input value={boxNumber} onChange={(e) => setBoxNumber(e.target.value)} placeholder="New box" />
              )}
              <button
                type="button"
                className="link-btn"
                onClick={() => {
                  setBoxMode((m) => (m === "existing" ? "new" : "existing"));
                  setBoxNumber("");
                }}
              >
                {boxMode === "existing" ? "Add New Box" : "Use Existing Box"}
              </button>
            </label>
            <label>
              Building
              {buildingMode === "existing" ? (
                <select value={building} onChange={(e) => setBuilding(e.target.value)}>
                  <option value="">Select existing building</option>
                  {buildingOptions.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              ) : (
                <input value={building} onChange={(e) => setBuilding(e.target.value)} placeholder="New building" />
              )}
              <button
                type="button"
                className="link-btn"
                onClick={() => {
                  setBuildingMode((m) => (m === "existing" ? "new" : "existing"));
                  setBuilding("");
                }}
              >
                {buildingMode === "existing" ? "Add New Building" : "Use Existing Building"}
              </button>
            </label>
          </div>
        ) : (
          <div className="info-grid">
            <div><p className="muted">Name</p><p>{customer.fullName}</p></div>
            <div><p className="muted">Number</p><p>{customer.customerNumber}</p></div>
            {customer.isMonitor ? (
              <div><p className="muted">Linked To</p><p>{customer.linkedCustomerName || "Missing link"}</p></div>
            ) : null}
            <div><p className="muted">Phone</p><p>{customer.phone || "-"}</p></div>
            <div><p className="muted">Region</p><p>{customer.region}</p></div>
            <div><p className="muted">Billing Type</p><p>{customer.billingType}</p></div>
            <div><p className="muted">Status</p><p>{customer.status}</p></div>
            <div><p className="muted">Box</p><p>{customer.boxNumber || "-"}</p></div>
            <div><p className="muted">Building</p><p>{customer.building || "-"}</p></div>
          </div>
        )}
        {message ? <p className="muted">{message}</p> : null}
        <div className="card-actions-right">
          {isEditing ? (
            <>
              <button type="button" className="danger-btn" onClick={() => setIsEditing(false)}>
                Cancel
              </button>{" "}
              <button type="button" className="success-btn" onClick={saveBasicInfo}>
                Save
              </button>
            </>
          ) : (
            <button type="button" onClick={() => setIsEditing(true)}>
              Edit Basic Info
            </button>
          )}
        </div>
      </div>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Previous Bills</h3>
        {bills.length === 0 ? (
          <p className="muted">No bills found for this customer.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Prev Counter</th>
                  <th>New Counter</th>
                  <th>kWh</th>
                  <th>Amount</th>
                  <th>Remaining</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {bills.map((bill) => (
                  <tr
                    key={bill.id}
                    onClick={() => setSelectedBillId(bill.id)}
                    style={{ cursor: "pointer" }}
                    title="Click to view details"
                  >
                    <td>{bill.monthKey}</td>
                    <td>{bill.previousCounter}</td>
                    <td>{bill.newCounter}</td>
                    <td>{bill.consumptionKwh}</td>
                    <td>{bill.amount.toLocaleString()}</td>
                    <td>{bill.remainingAmount.toLocaleString()}</td>
                    <td>{bill.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Previous Receipts / Payments</h3>
        {payments.length === 0 ? (
          <p className="muted">No payments found for this customer.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Receipt Ref</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr
                    key={payment.id}
                    onClick={() => setSelectedPaymentId(payment.id)}
                    style={{ cursor: "pointer" }}
                    title="Click to view details"
                  >
                    <td>{payment.paymentDate || "-"}</td>
                    <td>{payment.amount.toLocaleString()}</td>
                    <td>{payment.receiptRef || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {(selectedBill || selectedPayment) && (
        <div className="modal-backdrop" role="presentation" onClick={() => {
          setSelectedBillId(null);
          setSelectedPaymentId(null);
        }}>
          <div className="modal-content" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ margin: 0 }}>{selectedBill ? "Bill Details" : "Receipt / Payment Details"}</h3>
              <button type="button" className="icon-btn" onClick={() => {
                setSelectedBillId(null);
                setSelectedPaymentId(null);
              }}>
                ✕
              </button>
            </div>
            {selectedBill ? (
              <div className="info-grid">
                <div><p className="muted">Month</p><p>{selectedBill.monthKey}</p></div>
                <div><p className="muted">Previous Counter</p><p>{selectedBill.previousCounter}</p></div>
                <div><p className="muted">New Counter</p><p>{selectedBill.newCounter}</p></div>
                <div><p className="muted">Consumption (kWh)</p><p>{selectedBill.consumptionKwh}</p></div>
                <div><p className="muted">Amount</p><p>{selectedBill.amount.toLocaleString()}</p></div>
                <div><p className="muted">Remaining</p><p>{selectedBill.remainingAmount.toLocaleString()}</p></div>
                <div><p className="muted">Status</p><p>{selectedBill.status}</p></div>
                <div><p className="muted">Bill ID</p><p>{selectedBill.id}</p></div>
              </div>
            ) : selectedPayment ? (
              <div className="info-grid">
                <div><p className="muted">Date</p><p>{selectedPayment.paymentDate || "-"}</p></div>
                <div><p className="muted">Amount</p><p>{selectedPayment.amount.toLocaleString()}</p></div>
                <div><p className="muted">Receipt Ref</p><p>{selectedPayment.receiptRef || "-"}</p></div>
                <div><p className="muted">Payment ID</p><p>{selectedPayment.id}</p></div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </AppShell>
  );
}
