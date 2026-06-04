"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "../../_components/app-shell";
import { employeeNavItems } from "../../_components/role-nav";

type QrCollectionLog = {
  id: string;
  customerId: string;
  customerNumber: string;
  customerName: string;
  region: "mrah" | "printania";
  monthKey: string;
  collectedAmount: number;
  currency?: "LBP" | "USD";
  status?: "pending_employee_validation" | "validated_by_employee";
  billScanImageName?: string;
  employeeReceiptImageName?: string;
  validatedByEmployeeAt?: string;
  modificationReason?: string;
  modifiedByEmployee?: boolean;
  originalCustomerNumber?: string;
  originalCollectedAmount?: number;
  originalMonthKey?: string;
  scannedAt: string;
};

export default function EmployeeReviewQrPage() {
  const [logs, setLogs] = useState<QrCollectionLog[]>([]);
  const [regionFilter, setRegionFilter] = useState<"all" | "mrah" | "printania">("all");
  const [monthFilter, setMonthFilter] = useState<"all" | "2026-05" | "2026-04">("all");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [selectedLog, setSelectedLog] = useState<QrCollectionLog | null>(null);
  const [modifyMode, setModifyMode] = useState(false);
  const [editCustomerNumber, setEditCustomerNumber] = useState("");
  const [editMonthKey, setEditMonthKey] = useState("2026-05");
  const [editCollectedAmount, setEditCollectedAmount] = useState("");
  const [editCurrency, setEditCurrency] = useState<"LBP" | "USD">("LBP");
  const [modificationReason, setModificationReason] = useState("");

  useEffect(() => {
    fetch("/api/qr-collections?status=pending_employee_validation")
      .then(async (response) => {
        if (!response.ok) throw new Error("Failed to load QR logs.");
        const payload = (await response.json()) as { logs: QrCollectionLog[] };
        setLogs(payload.logs ?? []);
      })
      .catch(() => setLogs([]));
  }, []);

  const filteredLogs = useMemo(
    () =>
      logs.filter((log) => {
        if (log.status === "validated_by_employee") return false;
        if (regionFilter !== "all" && log.region !== regionFilter) return false;
        if (monthFilter !== "all" && log.monthKey !== monthFilter) return false;
        if (
          search &&
          !`${log.customerName} ${log.customerNumber}`.toLowerCase().includes(search.toLowerCase())
        ) {
          return false;
        }
        return true;
      }),
    [logs, monthFilter, regionFilter, search]
  );

  async function validateCashHandover(log: QrCollectionLog) {
    const receiptName = log.employeeReceiptImageName;
    if (!receiptName) {
      setMessage("Receipt image is missing from collector scan.");
      return;
    }
    try {
      const response = await fetch(`/api/qr-collections/${log.id}/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
    });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setMessage(payload.error ?? "Failed to validate cash handover.");
        return;
      }
      setLogs((prev) => prev.filter((item) => item.id !== log.id));
      setMessage(`Cash validated for ${log.customerName}. Payment recorded.`);
      closeDetailsModal();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unknown validation error.");
    }
  }

  async function validateWithModifications(log: QrCollectionLog) {
    const receiptName = log.employeeReceiptImageName;
    if (!receiptName) {
      setMessage("Receipt image is missing from collector scan.");
      return;
    }
    const parsedAmount = Number(editCollectedAmount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setMessage("Collected amount must be greater than 0.");
      return;
    }
    if (!modificationReason.trim()) {
      setMessage("Reason of modification is required.");
      return;
    }
    try {
      const response = await fetch(`/api/qr-collections/${log.id}/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerNumber: editCustomerNumber.trim() || log.customerNumber,
          monthKey: editMonthKey,
          collectedAmount: parsedAmount,
          currency: editCurrency,
          modificationReason: modificationReason.trim(),
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setMessage(payload.error ?? "Failed to validate modifications.");
        return;
      }
      setLogs((prev) => prev.filter((item) => item.id !== log.id));
      setModifyMode(false);
      setMessage(`Modifications validated for ${log.customerName}. Payment recorded.`);
      closeDetailsModal();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unknown validation error.");
    }
  }

  function closeDetailsModal() {
    setSelectedLog(null);
    setModifyMode(false);
    setModificationReason("");
  }

  useEffect(() => {
    if (!selectedLog) return;
    setEditCustomerNumber(selectedLog.customerNumber);
    setEditMonthKey(selectedLog.monthKey);
    setEditCollectedAmount(String(selectedLog.collectedAmount));
    setEditCurrency(selectedLog.currency ?? "LBP");
    setModificationReason(selectedLog.modificationReason ?? "");
  }, [selectedLog]);

  return (
    <AppShell
      title="Review QR"
      subtitle="Verify house-collection scans before cash handover reconciliation"
      navItems={employeeNavItems}
    >
      <div className="card">
        <div className="filters-grid filters-grid-pro">
          <label htmlFor="review-qr-search">
            Search
            <input
              id="review-qr-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name or customer number..."
            />
          </label>
          <label htmlFor="review-qr-region">
            Region
            <select
              id="review-qr-region"
              value={regionFilter}
              onChange={(e) => setRegionFilter(e.target.value as "all" | "mrah" | "printania")}
            >
              <option value="all">All</option>
              <option value="mrah">Mrah</option>
              <option value="printania">Printania</option>
            </select>
          </label>
          <label htmlFor="review-qr-month">
            Month
            <select
              id="review-qr-month"
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value as "all" | "2026-05" | "2026-04")}
            >
              <option value="all">All</option>
              <option value="2026-05">2026-05</option>
              <option value="2026-04">2026-04</option>
            </select>
          </label>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Collected QR Logs</h3>
        {message ? <p className="muted">{message}</p> : null}
        <table>
          <thead>
            <tr>
              <th>Scanned At</th>
              <th>Customer</th>
              <th>Bill Month</th>
              <th>Collected</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredLogs.map((log) => (
              <tr key={log.id} className="clickable-row" onClick={() => setSelectedLog(log)}>
                <td>{new Date(log.scannedAt).toLocaleString()}</td>
                <td>{log.customerName}</td>
                <td>{log.monthKey}</td>
                <td>
                  {log.collectedAmount.toFixed(2)} {log.currency ?? "LBP"}
                </td>
                <td>
                  {log.status === "validated_by_employee" ? "Validated by employee" : "Pending employee validation"}
                </td>
              </tr>
            ))}
            {filteredLogs.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">
                  No QR collection logs yet. Record a payment first to seed scan logs.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {selectedLog && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="QR log details">
          <div className="modal-card">
            <div className="row-between">
              <h3 style={{ margin: 0 }}>QR Collection Details</h3>
              <button type="button" className="danger-btn" onClick={closeDetailsModal}>
                Close
              </button>
            </div>
            <div className="info-grid" style={{ marginTop: 12 }}>
              <div>
                <p className="muted">Scanned At</p>
                <p>{new Date(selectedLog.scannedAt).toLocaleString()}</p>
              </div>
              <div>
                <p className="muted">Customer</p>
                <p>{selectedLog.customerName}</p>
              </div>
              <div>
                <p className="muted">Number</p>
                <p>{selectedLog.customerNumber}</p>
              </div>
              <div>
                <p className="muted">Region</p>
                <p>{selectedLog.region}</p>
              </div>
              <div>
                <p className="muted">Bill Month</p>
                <p>{selectedLog.monthKey}</p>
              </div>
              <div>
                <p className="muted">Collected</p>
                <p>
                  {selectedLog.collectedAmount.toFixed(2)} {selectedLog.currency ?? "LBP"}
                </p>
              </div>
              <div>
                <p className="muted">Bill Scan</p>
                <p>{selectedLog.billScanImageName ?? "-"}</p>
              </div>
              <div>
                <p className="muted">Status</p>
                <p>
                  {selectedLog.status === "validated_by_employee"
                    ? "Validated by employee"
                    : "Pending employee validation"}
                </p>
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <p className="muted" style={{ marginBottom: 4 }}>Receipt image (read-only)</p>
              <p style={{ marginTop: 0 }}>{selectedLog.employeeReceiptImageName ?? "-"}</p>
            </div>
            {selectedLog.status !== "validated_by_employee" && (
              <>
                <div className="card-actions-right" style={{ marginTop: 12 }}>
                  <button type="button" className="show-all-btn" onClick={() => setModifyMode((v) => !v)}>
                    {modifyMode ? "Cancel Modify" : "Modify"}
                  </button>
                </div>
                {modifyMode && (
                  <div className="card" style={{ marginTop: 12 }}>
                    <h4 style={{ marginTop: 0 }}>Modify before validation</h4>
                    <div className="filters-grid">
                      <label>
                        Customer number
                        <input
                          value={editCustomerNumber}
                          onChange={(e) => setEditCustomerNumber(e.target.value)}
                        />
                      </label>
                      <label>
                        Bill month
                        <select value={editMonthKey} onChange={(e) => setEditMonthKey(e.target.value)}>
                          <option value="2026-05">2026-05</option>
                          <option value="2026-04">2026-04</option>
                        </select>
                      </label>
                      <label>
                        Collected amount
                        <input
                          type="number"
                          value={editCollectedAmount}
                          onChange={(e) => setEditCollectedAmount(e.target.value)}
                        />
                      </label>
                      <label>
                        Currency
                        <select
                          value={editCurrency}
                          onChange={(e) => setEditCurrency(e.target.value as "LBP" | "USD")}
                        >
                          <option value="LBP">LBP</option>
                          <option value="USD">USD</option>
                        </select>
                      </label>
                    </div>
                    <label>
                      Reason of modification
                      <input
                        value={modificationReason}
                        onChange={(e) => setModificationReason(e.target.value)}
                        placeholder="Required reason for manager audit"
                      />
                    </label>
                  </div>
                )}
              </>
            )}
            <div className="card-actions-right" style={{ marginTop: 12 }}>
              <Link
                href={`/employee/customers/${selectedLog.customerId}`}
                className="action-link-btn"
                style={{ marginRight: 10 }}
              >
                Open Customer
              </Link>{" "}
              {selectedLog.status === "validated_by_employee" ? (
                <button type="button" disabled>
                  Done
                </button>
              ) : modifyMode ? (
                <button type="button" className="success-btn" onClick={() => validateWithModifications(selectedLog)}>
                  Validate Modifications
                </button>
              ) : (
                <button type="button" className="success-btn" onClick={() => validateCashHandover(selectedLog)}>
                  Validate (No Modifications)
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
