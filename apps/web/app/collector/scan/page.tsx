"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "../../_components/app-shell";
import { collectorNavItems } from "../../_components/role-nav";
import { CURRENT_MONTH_KEY } from "../../../lib/constants/months";
import { formatNumber } from "../../../lib/format";
import { useAvailableMonths } from "../../../lib/hooks/use-available-months";

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
  scannedAt: string;
};
type ScanCustomer = {
  id: string;
  customerNumber: string;
  fullName: string;
  region: "mrah" | "printania";
  ongoingBalanceThisMonth?: number;
};

function CollectorScanContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [qrInput, setQrInput] = useState("");
  const [monthKey, setMonthKey] = useState(CURRENT_MONTH_KEY);
  const months = useAvailableMonths();
  const [amount, setAmount] = useState("");
  const [amountCurrency, setAmountCurrency] = useState<"LBP" | "USD">("LBP");
  const [changeAmount, setChangeAmount] = useState(false);
  const [customers, setCustomers] = useState<ScanCustomer[]>([]);
  const [message, setMessage] = useState("");
  const [logs, setLogs] = useState<QrCollectionLog[]>([]);

  useEffect(() => {
    const qCustomerNumber = searchParams.get("customerNumber");
    const qMonth = searchParams.get("month");
    const shouldOpenCamera = searchParams.get("openCamera") === "1";
    if (!qCustomerNumber && !shouldOpenCamera) {
      router.replace("/collector/dashboard");
      return;
    }
    if (qCustomerNumber) {
      setQrInput(qCustomerNumber);
    }
    if (qMonth && /^\d{4}-\d{2}$/.test(qMonth)) setMonthKey(qMonth);
    if (shouldOpenCamera) {
      const cameraInput = document.getElementById("collector-camera-input") as HTMLInputElement | null;
      cameraInput?.click();
    }
  }, [router, searchParams]);

  useEffect(() => {
    fetch(`/api/customers?region=all&month=${monthKey}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Failed to load customers.");
        const payload = (await response.json()) as { customers: ScanCustomer[] };
        setCustomers(payload.customers ?? []);
      })
      .catch(() => setCustomers([]));
  }, [monthKey]);

  useEffect(() => {
    fetch("/api/qr-collections?status=all")
      .then(async (response) => {
        if (!response.ok) throw new Error("Failed to load QR logs.");
        const payload = (await response.json()) as { logs: QrCollectionLog[] };
        setLogs(payload.logs ?? []);
      })
      .catch(() => setLogs([]));
  }, []);

  const matchedCustomer = useMemo(() => {
    const normalized = qrInput.trim().toLowerCase();
    if (!normalized) return undefined;
    return customers.find(
      (customer) =>
        customer.customerNumber.toLowerCase() === normalized ||
        customer.fullName.toLowerCase().includes(normalized)
    );
  }, [customers, qrInput]);

  const billAmount = matchedCustomer?.ongoingBalanceThisMonth ?? 0;

  // When a customer is resolved, prefill the collected amount with what they owe
  // for this bill. The collector confirms it as-is or taps "change amount".
  useEffect(() => {
    if (matchedCustomer && !changeAmount) {
      setAmount(billAmount > 0 ? String(Math.round(billAmount)) : "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchedCustomer?.id, billAmount, changeAmount]);

  const isReadyToSave = useMemo(
    () =>
      qrInput.trim() !== "" &&
      matchedCustomer !== undefined &&
      monthKey.trim() !== "" &&
      Number(amount) > 0,
    [amount, matchedCustomer, monthKey, qrInput]
  );

  async function handleSaveScan() {
    if (!isReadyToSave) {
      setMessage("Enter customer number and amount (must match an existing customer).");
      return;
    }
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setMessage("Collected amount must be greater than 0.");
      return;
    }
    try {
      const response = await fetch("/api/qr-collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: matchedCustomer!.id,
          customerNumber: matchedCustomer!.customerNumber,
          customerName: matchedCustomer!.fullName,
          regionCode: matchedCustomer!.region,
          monthKey,
          collectedAmount: parsedAmount,
          expectedAmount: billAmount > 0 ? billAmount : undefined,
          currency: amountCurrency,
          billScanImageName: `bill-scan-${matchedCustomer!.customerNumber}-${monthKey}.png`,
          employeeReceiptImageName: `receipt-${matchedCustomer!.customerNumber}-${monthKey}.jpg`,
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setMessage(payload.error ?? "Failed to save QR collection.");
        return;
      }
      const refresh = await fetch("/api/qr-collections?status=all");
      const refreshPayload = (await refresh.json()) as { logs: QrCollectionLog[] };
      setLogs(refreshPayload.logs ?? []);
      setAmount("");
      setQrInput("");
      setChangeAmount(false);
      setMessage(
        `تم تسجيل التحصيل (${amountCurrency}). يظهر الآن على لوحتك، ويبقى بانتظار توثيق الموظّف في صفحة Review QR.`
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unknown save error.");
    }
  }

  return (
    <AppShell
      title="Scan & Collect"
      subtitle="Scan customer QR, enter collected amount, and save"
      navItems={collectorNavItems}
      appName="Station V2 - Collector"
    >
      <div className="collector-mobile-shell">
      <div className="card">
        <div className="filters-grid filters-grid-pro">
          <label htmlFor="collector-qr-input">
            Scan / QR customer number
            <input
              id="collector-qr-input"
              value={qrInput}
              onChange={(e) => setQrInput(e.target.value)}
              placeholder="Example: C-XXXX"
            />
          </label>
          <label htmlFor="collector-month">
            Bill month
            <select id="collector-month" value={monthKey} onChange={(e) => setMonthKey(e.target.value)}>
              {months.map((month) => (
                <option key={month} value={month}>
                  {month}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor="collector-amount">
            المبلغ المحصّل — Amount collected
            <input
              id="collector-amount"
              type="number"
              value={amount}
              disabled={Boolean(matchedCustomer) && !changeAmount && billAmount > 0}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={`Enter amount in ${amountCurrency}`}
            />
          </label>
          <label htmlFor="collector-currency">
            Currency
            <select
              id="collector-currency"
              value={amountCurrency}
              onChange={(e) => setAmountCurrency(e.target.value as "LBP" | "USD")}
            >
              <option value="LBP">LBP</option>
              <option value="USD">USD</option>
            </select>
          </label>
        </div>
        <div className="card">
          <div>
            <p className="muted" style={{ marginBottom: 4 }}>
              Selected customer — العميل
            </p>
            <p style={{ marginTop: 0, marginBottom: 8 }}>
              {matchedCustomer ? `${matchedCustomer.fullName} (${matchedCustomer.customerNumber})` : "—"}
            </p>
            {matchedCustomer ? (
              <>
                <p style={{ marginTop: 0, marginBottom: 8 }}>
                  <span className="muted">المبلغ المطلوب — Bill for {monthKey}: </span>
                  <strong>
                    {billAmount > 0 ? `${formatNumber(billAmount)} LBP` : "مدفوعة — nothing due"}
                  </strong>
                </p>
                {billAmount > 0 ? (
                  <button
                    type="button"
                    onClick={() => setChangeAmount((v) => !v)}
                    style={{ direction: "rtl" }}
                  >
                    {changeAmount ? "المبلغ كامل ✓" : "تغيير المبلغ المحصّل"}
                  </button>
                ) : null}
                {changeAmount ? (
                  <p className="muted" style={{ marginTop: 8, marginBottom: 0, direction: "rtl" }}>
                    أدخل المبلغ الذي حصّلته فعليًا إذا لم يدفع العميل كامل الفاتورة.
                  </p>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
        {message ? <p className="muted">{message}</p> : null}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Latest Scans</h3>
        <table className="collector-scans-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Customer</th>
              <th>Month</th>
              <th>Collected</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {logs.slice(0, 8).map((log) => {
              const validated = log.status === "validated_by_employee";
              return (
                <tr key={log.id}>
                  <td>{new Date(log.scannedAt).toLocaleTimeString()}</td>
                  <td>{log.customerName}</td>
                  <td>{log.monthKey}</td>
                  <td>{formatNumber(log.collectedAmount)} {log.currency ?? "LBP"}</td>
                  <td style={{ color: validated ? "var(--success)" : "var(--warning)" }}>
                    {validated ? "Validated" : "Awaiting employee"}
                  </td>
                </tr>
              );
            })}
            {logs.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">
                  No scans recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      </div>
      <div className="collector-sticky-action">
        <button type="button" onClick={handleSaveScan}>
          تسجيل التحصيل — Record Collection
        </button>
      </div>
    </AppShell>
  );
}

export default function CollectorScanPage() {
  return (
    <Suspense fallback={<div className="card">Loading scanner...</div>}>
      <CollectorScanContent />
    </Suspense>
  );
}
