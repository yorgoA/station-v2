"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "../../../_components/app-shell";
import { managerNavItems } from "../../../_components/role-nav";

type Props = { params: { customerId: string } };

type CustomerDetails = {
  id: string;
  customerNumber: string;
  fullName: string;
  phone: string;
  boxNumber: string;
  building: string;
  region: "mrah" | "printania";
  billingType: "metered" | "fixed-monthly" | "free";
  status: string;
};
type BillRow = {
  id: string;
  monthKey: string;
  previousCounter: number;
  newCounter: number;
  consumptionKwh: number;
  amount: number;
  remainingAmount: number;
  status: string;
};
type PaymentRow = {
  id: string;
  amount: number;
  paymentDate: string;
  receiptRef: string;
};
type AuditChange = { field: string; before: string; after: string };
type AuditEntry = {
  id: string;
  modifiedAt: string;
  section: "customer_info" | "bill_row" | "payment_row";
  rowKey?: string;
  changes: AuditChange[];
};

export default function ManagerCustomerDetailsPage({ params }: Props) {
  const [customer, setCustomer] = useState<CustomerDetails | null>(null);
  const [bills, setBills] = useState<BillRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [message, setMessage] = useState("");

  const [isEditingInfo, setIsEditingInfo] = useState(false);
  const [fullName, setFullName] = useState("");
  const [customerNumber, setCustomerNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [boxNumber, setBoxNumber] = useState("");
  const [building, setBuilding] = useState("");
  const [allCustomers, setAllCustomers] = useState<Array<{ boxNumber?: string; building?: string }>>([]);
  const [boxMode, setBoxMode] = useState<"existing" | "new">("existing");
  const [buildingMode, setBuildingMode] = useState<"existing" | "new">("existing");
  const [status, setStatus] = useState("active");
  const [billingPlan, setBillingPlan] = useState<CustomerDetails["billingType"]>("metered");

  const [editingBillId, setEditingBillId] = useState<string | null>(null);
  const [billDraft, setBillDraft] = useState<BillRow | null>(null);
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [paymentDraft, setPaymentDraft] = useState<PaymentRow | null>(null);

  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [selectedAudit, setSelectedAudit] = useState<AuditEntry | null>(null);

  const auditStorageKey = `station_v2_manager_customer_audit:${params.customerId}`;

  useEffect(() => {
    fetch("/api/customers?region=all")
      .then(async (response) => {
        if (!response.ok) throw new Error("Failed to load box/building options.");
        const payload = (await response.json()) as { customers: Array<{ boxNumber?: string; building?: string }> };
        setAllCustomers(payload.customers ?? []);
      })
      .catch(() => setAllCustomers([]));
  }, []);

  useEffect(() => {
    fetch(`/api/customers/${params.customerId}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Failed to load customer details.");
        const payload = (await response.json()) as {
          customer: CustomerDetails;
          bills: BillRow[];
          payments: PaymentRow[];
        };
        setCustomer(payload.customer ?? null);
        setBills(payload.bills ?? []);
        setPayments(payload.payments ?? []);
        if (payload.customer) {
          setFullName(payload.customer.fullName);
          setCustomerNumber(payload.customer.customerNumber);
          setPhone(payload.customer.phone ?? "");
          setBoxNumber(payload.customer.boxNumber ?? "");
          setBuilding(payload.customer.building ?? "");
          setStatus(payload.customer.status ?? "active");
          setBillingPlan(payload.customer.billingType ?? "metered");
        }
      })
      .catch(() => {
        setCustomer(null);
        setBills([]);
        setPayments([]);
      });
  }, [params.customerId]);
  const boxOptions = useMemo(
    () => Array.from(new Set(allCustomers.map((c) => String(c.boxNumber ?? "").trim()).filter(Boolean))),
    [allCustomers]
  );
  const buildingOptions = useMemo(
    () => Array.from(new Set(allCustomers.map((c) => String(c.building ?? "").trim()).filter(Boolean))),
    [allCustomers]
  );

  useEffect(() => {
    const raw = window.localStorage.getItem(auditStorageKey);
    if (!raw) return;
    try {
      setAuditEntries(JSON.parse(raw) as AuditEntry[]);
    } catch {
      setAuditEntries([]);
    }
  }, [auditStorageKey]);

  useEffect(() => {
    window.localStorage.setItem(auditStorageKey, JSON.stringify(auditEntries));
  }, [auditEntries, auditStorageKey]);

  function addAudit(section: AuditEntry["section"], rowKey: string | undefined, changes: AuditChange[]) {
    if (changes.length === 0) return;
    setAuditEntries((prev) => [
      {
        id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        modifiedAt: new Date().toLocaleString(),
        section,
        rowKey,
        changes,
      },
      ...prev,
    ]);
  }

  if (!customer) {
    return (
      <AppShell title="Customer Not Found" subtitle="No customer matches this id" navItems={managerNavItems}>
        <Link href="/manager/customers" className="back-link">
          ← Back to Customers
        </Link>
      </AppShell>
    );
  }

  async function saveCustomerInfo() {
    if (!customer) return;
    const before = customer;
    const changes: AuditChange[] = [];
    if (fullName !== before.fullName) changes.push({ field: "fullName", before: before.fullName, after: fullName });
    if (customerNumber !== before.customerNumber) changes.push({ field: "customerNumber", before: before.customerNumber, after: customerNumber });
    if (phone !== (before.phone ?? "")) changes.push({ field: "phone", before: before.phone ?? "", after: phone });
    if (boxNumber !== (before.boxNumber ?? "")) changes.push({ field: "boxNumber", before: before.boxNumber ?? "", after: boxNumber });
    if (building !== (before.building ?? "")) changes.push({ field: "building", before: before.building ?? "", after: building });
    if (status !== before.status) changes.push({ field: "status", before: before.status, after: status });
    if (billingPlan !== before.billingType) {
      changes.push({ field: "billingType", before: before.billingType, after: billingPlan });
    }

    const response = await fetch(`/api/customers/${params.customerId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        section: "customer",
        fullName,
        customerNumber,
        phone,
        boxNumber,
        building,
        status,
        billingPlan,
      }),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setMessage(payload.error ?? "Failed to save customer info.");
      return;
    }
    setCustomer((prev) =>
      prev
        ? { ...prev, fullName, customerNumber, phone, boxNumber, building, status, billingType: billingPlan }
        : prev
    );
    addAudit("customer_info", undefined, changes);
    setIsEditingInfo(false);
    setMessage("Customer info saved.");
  }

  function openBillEdit(row: BillRow) {
    setEditingBillId(row.id);
    setBillDraft({ ...row });
  }

  async function saveBillEdit() {
    if (!billDraft || !editingBillId) return;
    const before = bills.find((b) => b.id === editingBillId);
    if (!before) return;
    const changes: AuditChange[] = [];
    if (billDraft.previousCounter !== before.previousCounter) changes.push({ field: "previousCounter", before: String(before.previousCounter), after: String(billDraft.previousCounter) });
    if (billDraft.newCounter !== before.newCounter) changes.push({ field: "newCounter", before: String(before.newCounter), after: String(billDraft.newCounter) });
    if (billDraft.amount !== before.amount) changes.push({ field: "amount", before: String(before.amount), after: String(billDraft.amount) });
    if (billDraft.remainingAmount !== before.remainingAmount) changes.push({ field: "remainingAmount", before: String(before.remainingAmount), after: String(billDraft.remainingAmount) });
    if (billDraft.status !== before.status) changes.push({ field: "status", before: before.status, after: billDraft.status });

    const response = await fetch(`/api/customers/${params.customerId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        section: "bill",
        billId: billDraft.id,
        previousCounter: billDraft.previousCounter,
        newCounter: billDraft.newCounter,
        amount: billDraft.amount,
        remainingAmount: billDraft.remainingAmount,
        status: billDraft.status,
      }),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setMessage(payload.error ?? "Failed to save bill.");
      return;
    }
    setBills((prev) => prev.map((b) => (b.id === editingBillId ? { ...billDraft, consumptionKwh: Math.max(0, billDraft.newCounter - billDraft.previousCounter) } : b)));
    addAudit("bill_row", before.monthKey, changes);
    setEditingBillId(null);
    setBillDraft(null);
    setMessage("Bill saved.");
  }

  function openPaymentEdit(row: PaymentRow) {
    setEditingPaymentId(row.id);
    setPaymentDraft({ ...row });
  }

  async function savePaymentEdit() {
    if (!paymentDraft || !editingPaymentId) return;
    const before = payments.find((p) => p.id === editingPaymentId);
    if (!before) return;
    const changes: AuditChange[] = [];
    if (paymentDraft.amount !== before.amount) changes.push({ field: "amount", before: String(before.amount), after: String(paymentDraft.amount) });
    if (paymentDraft.paymentDate !== before.paymentDate) changes.push({ field: "paymentDate", before: before.paymentDate, after: paymentDraft.paymentDate });
    if (paymentDraft.receiptRef !== before.receiptRef) changes.push({ field: "receiptRef", before: before.receiptRef, after: paymentDraft.receiptRef });

    const response = await fetch(`/api/customers/${params.customerId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        section: "payment",
        paymentId: paymentDraft.id,
        amount: paymentDraft.amount,
        paymentDate: paymentDraft.paymentDate,
        receiptRef: paymentDraft.receiptRef,
      }),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setMessage(payload.error ?? "Failed to save payment.");
      return;
    }
    setPayments((prev) => prev.map((p) => (p.id === editingPaymentId ? paymentDraft : p)));
    addAudit("payment_row", before.paymentDate, changes);
    setEditingPaymentId(null);
    setPaymentDraft(null);
    setMessage("Payment saved.");
  }

  return (
    <AppShell
      title={customer.fullName}
      subtitle={`Manager customer details • #${customer.customerNumber}`}
      navItems={managerNavItems}
    >
      <Link href="/manager/customers" className="back-link">
        ← Back to Customers
      </Link>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Customer Information</h3>
        {isEditingInfo ? (
          <div className="filters-grid filters-grid-pro">
            <label>Name<input value={fullName} onChange={(e) => setFullName(e.target.value)} /></label>
            <label>Number<input value={customerNumber} onChange={(e) => setCustomerNumber(e.target.value)} /></label>
            <label>Phone<input value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
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
            <label>
              Status
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="active">active</option>
                <option value="paused">paused</option>
              </select>
            </label>
            <label>
              Billing plan
              <select
                value={billingPlan}
                onChange={(e) => setBillingPlan(e.target.value as CustomerDetails["billingType"])}
              >
                <option value="metered">metered</option>
                <option value="fixed-monthly">fixed-monthly</option>
                <option value="free">free customer</option>
              </select>
            </label>
          </div>
        ) : (
          <div className="info-grid">
            <div><p className="muted">Name</p><p>{customer.fullName}</p></div>
            <div><p className="muted">Number</p><p>{customer.customerNumber}</p></div>
            <div><p className="muted">Phone</p><p>{customer.phone || "-"}</p></div>
            <div><p className="muted">Region</p><p>{customer.region}</p></div>
            <div><p className="muted">Box</p><p>{customer.boxNumber || "-"}</p></div>
            <div><p className="muted">Building</p><p>{customer.building || "-"}</p></div>
            <div><p className="muted">Billing Type</p><p>{customer.billingType}</p></div>
            <div><p className="muted">Status</p><p>{customer.status}</p></div>
          </div>
        )}
        {message ? <p className="muted">{message}</p> : null}
        <div className="card-actions-right">
          {isEditingInfo ? (
            <>
              <button
                type="button"
                className="danger-btn"
                onClick={() => {
                  setBillingPlan(customer.billingType);
                  setIsEditingInfo(false);
                }}
              >
                Cancel
              </button>{" "}
              <button type="button" className="success-btn" onClick={saveCustomerInfo}>Save Info</button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => {
                setBillingPlan(customer.billingType);
                setIsEditingInfo(true);
              }}
            >
              Edit Customer Info
            </button>
          )}
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Bills (Editable)</h3>
        <table>
          <thead>
            <tr>
              <th>Month</th>
              <th>Previous</th>
              <th>Current</th>
              <th>kWh</th>
              <th>Amount</th>
              <th>Remaining</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {bills.map((row) => (
              <tr key={row.id}>
                <td>{row.monthKey}</td>
                <td>{row.previousCounter}</td>
                <td>{row.newCounter}</td>
                <td>{row.consumptionKwh}</td>
                <td>{row.amount}</td>
                <td>{row.remainingAmount}</td>
                <td>{row.status}</td>
                <td><button type="button" onClick={() => openBillEdit(row)}>Modify</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Payments & Receipts (Editable)</h3>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Amount</th>
              <th>Receipt</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((row) => (
              <tr key={row.id}>
                <td>{row.paymentDate}</td>
                <td>{row.amount}</td>
                <td>{row.receiptRef || "-"}</td>
                <td><button type="button" onClick={() => openPaymentEdit(row)}>Modify</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Modification Log</h3>
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Section</th>
              <th>Row</th>
              <th>Fields</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {auditEntries.length === 0 ? (
              <tr><td colSpan={5} className="muted">No modifications logged yet.</td></tr>
            ) : (
              auditEntries.map((entry) => (
                <tr key={entry.id}>
                  <td>{entry.modifiedAt}</td>
                  <td>{entry.section}</td>
                  <td>{entry.rowKey ?? "-"}</td>
                  <td>{entry.changes.length}</td>
                  <td><button type="button" onClick={() => setSelectedAudit(entry)}>View</button></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {editingBillId && billDraft ? (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Edit bill">
          <div className="modal-card">
            <h3 style={{ marginTop: 0 }}>Modify Bill ({billDraft.monthKey})</h3>
            <div className="filters-grid filters-grid-pro">
              <label>Previous Counter<input type="number" value={billDraft.previousCounter} onChange={(e) => setBillDraft((p) => (p ? { ...p, previousCounter: Number(e.target.value) } : p))} /></label>
              <label>Current Counter<input type="number" value={billDraft.newCounter} onChange={(e) => setBillDraft((p) => (p ? { ...p, newCounter: Number(e.target.value) } : p))} /></label>
              <label>Amount<input type="number" value={billDraft.amount} onChange={(e) => setBillDraft((p) => (p ? { ...p, amount: Number(e.target.value) } : p))} /></label>
              <label>Remaining<input type="number" value={billDraft.remainingAmount} onChange={(e) => setBillDraft((p) => (p ? { ...p, remainingAmount: Number(e.target.value) } : p))} /></label>
              <label>
                Status
                <select value={billDraft.status} onChange={(e) => setBillDraft((p) => (p ? { ...p, status: e.target.value } : p))}>
                  <option value="paid">paid</option>
                  <option value="unpaid">unpaid</option>
                </select>
              </label>
            </div>
            <div className="card-actions-right">
              <button type="button" className="danger-btn" onClick={() => { setEditingBillId(null); setBillDraft(null); }}>Cancel</button>{" "}
              <button type="button" className="success-btn" onClick={saveBillEdit}>Save Bill</button>
            </div>
          </div>
        </div>
      ) : null}

      {editingPaymentId && paymentDraft ? (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Edit payment">
          <div className="modal-card">
            <h3 style={{ marginTop: 0 }}>Modify Payment</h3>
            <div className="filters-grid filters-grid-pro">
              <label>Amount<input type="number" value={paymentDraft.amount} onChange={(e) => setPaymentDraft((p) => (p ? { ...p, amount: Number(e.target.value) } : p))} /></label>
              <label>Date<input type="date" value={paymentDraft.paymentDate} onChange={(e) => setPaymentDraft((p) => (p ? { ...p, paymentDate: e.target.value } : p))} /></label>
              <label>Receipt Ref<input value={paymentDraft.receiptRef} onChange={(e) => setPaymentDraft((p) => (p ? { ...p, receiptRef: e.target.value } : p))} /></label>
            </div>
            <div className="card-actions-right">
              <button type="button" className="danger-btn" onClick={() => { setEditingPaymentId(null); setPaymentDraft(null); }}>Cancel</button>{" "}
              <button type="button" className="success-btn" onClick={savePaymentEdit}>Save Payment</button>
            </div>
          </div>
        </div>
      ) : null}

      {selectedAudit ? (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Modification details">
          <div className="modal-card">
            <h3 style={{ marginTop: 0 }}>Modification Details</h3>
            <p className="muted">
              {selectedAudit.modifiedAt} • {selectedAudit.section} {selectedAudit.rowKey ? `• ${selectedAudit.rowKey}` : ""}
            </p>
            <table>
              <thead>
                <tr>
                  <th>Field</th>
                  <th>Before</th>
                  <th>After</th>
                </tr>
              </thead>
              <tbody>
                {selectedAudit.changes.map((change, index) => (
                  <tr key={`${selectedAudit.id}-${index}`}>
                    <td>{change.field}</td>
                    <td>{change.before}</td>
                    <td>{change.after}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="card-actions-right">
              <button type="button" className="danger-btn" onClick={() => setSelectedAudit(null)}>Close</button>
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
