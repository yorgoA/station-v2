"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "../../_components/app-shell";
import { collectorNavItems } from "../../_components/role-nav";
import { CURRENT_MONTH_KEY } from "../../../lib/constants/months";
import { formatNumber } from "../../../lib/format";

type QrCollectionLog = {
  id: string;
  customerNumber: string;
  customerName: string;
  monthKey: string;
  collectedAmount: number;
  expectedAmount?: number | null;
  currency?: "LBP" | "USD";
  status?: "pending_employee_validation" | "validated_by_employee";
  scannedAt: string;
};
type ScanCustomer = {
  id: string;
  customerNumber: string;
  fullName: string;
  building?: string;
  region: "mrah" | "printania";
  ongoingBalance?: number;
  ongoingBalanceThisMonth?: number;
};

function CollectorScanContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [customerNumber, setCustomerNumber] = useState("");
  const [monthKey, setMonthKey] = useState(CURRENT_MONTH_KEY);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<"LBP" | "USD">("LBP");
  const [changeAmount, setChangeAmount] = useState(false);
  const [customers, setCustomers] = useState<ScanCustomer[]>([]);
  const [message, setMessage] = useState("");
  const [saved, setSaved] = useState(false);
  const [logs, setLogs] = useState<QrCollectionLog[]>([]);
  const amountRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const qCustomerNumber = searchParams.get("customerNumber");
    const qMonth = searchParams.get("month");
    if (!qCustomerNumber) {
      router.replace("/collector/dashboard");
      return;
    }
    setCustomerNumber(qCustomerNumber);
    if (qMonth && /^\d{4}-\d{2}$/.test(qMonth)) setMonthKey(qMonth);
  }, [router, searchParams]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/customers?region=all&month=${monthKey}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("failed");
        const payload = (await response.json()) as { customers: ScanCustomer[] };
        if (!cancelled) setCustomers(payload.customers ?? []);
      })
      .catch(() => {
        if (!cancelled) setCustomers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [monthKey]);

  useEffect(() => {
    fetch("/api/qr-collections?status=all")
      .then(async (response) => {
        if (!response.ok) throw new Error("failed");
        const payload = (await response.json()) as { logs: QrCollectionLog[] };
        setLogs(payload.logs ?? []);
      })
      .catch(() => setLogs([]));
  }, []);

  const customer = useMemo(() => {
    const n = customerNumber.trim().toLowerCase();
    if (!n) return undefined;
    return customers.find((c) => c.customerNumber.toLowerCase() === n);
  }, [customers, customerNumber]);

  const billAmount = useMemo(() => {
    if (!customer) return 0;
    const monthDue = customer.ongoingBalanceThisMonth ?? 0;
    return monthDue > 0 ? monthDue : (customer.ongoingBalance ?? 0);
  }, [customer]);

  // Prefill the collected amount with the bill; the collector confirms it or
  // taps "تغيير المبلغ المحصّل" to enter a different (partial) figure.
  useEffect(() => {
    if (customer && !changeAmount && billAmount > 0) {
      setAmount(String(Math.round(billAmount)));
    }
  }, [customer, billAmount, changeAmount]);

  function enableChange() {
    setChangeAmount(true);
    setTimeout(() => {
      amountRef.current?.focus();
      amountRef.current?.select();
    }, 0);
  }

  async function record() {
    if (!customer) {
      setMessage("لم يتم العثور على المشترك.");
      return;
    }
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setMessage("أدخل مبلغًا أكبر من صفر.");
      return;
    }
    setMessage("");
    try {
      const response = await fetch("/api/qr-collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: customer.id,
          customerNumber: customer.customerNumber,
          customerName: customer.fullName,
          regionCode: customer.region,
          monthKey,
          collectedAmount: value,
          expectedAmount: billAmount > 0 ? billAmount : undefined,
          currency,
          billScanImageName: `bill-scan-${customer.customerNumber}-${monthKey}.png`,
          employeeReceiptImageName: `receipt-${customer.customerNumber}-${monthKey}.jpg`
        })
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setMessage(payload.error ?? "تعذّر تسجيل التحصيل.");
        return;
      }
      setSaved(true);
      setMessage("✓ تم تسجيل التحصيل. بانتظار توثيق الموظّف في صفحة Review QR.");
      const refresh = await fetch("/api/qr-collections?status=all");
      const refreshPayload = (await refresh.json()) as { logs: QrCollectionLog[] };
      setLogs(refreshPayload.logs ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذّر تسجيل التحصيل.");
    }
  }

  return (
    <AppShell
      title="تحصيل"
      subtitle="تسجيل المبلغ المحصّل من المشترك"
      navItems={collectorNavItems}
      appName="Station V2 - Collector"
    >
      <div className="collector-mobile-shell">
        <div className="card" style={{ direction: "rtl" }}>
          <p className="muted" style={{ marginTop: 0, marginBottom: 4 }}>
            المشترك
          </p>
          <p style={{ marginTop: 0, marginBottom: 8, fontSize: 18, fontWeight: 700 }}>
            {customer ? customer.fullName : customerNumber || "…"}
          </p>
          <p className="muted" style={{ marginTop: 0, marginBottom: 12 }}>
            {customer ? `${customer.customerNumber} · ${customer.building || "—"}` : ""} · {monthKey}
          </p>

          <p style={{ marginTop: 0, marginBottom: 12 }}>
            <span className="muted">المبلغ المطلوب: </span>
            <strong style={{ fontSize: 18 }}>
              <span className="num" style={{ direction: "ltr", unicodeBidi: "isolate" }}>
                {billAmount > 0 ? formatNumber(billAmount) : "0"}
              </span>{" "}
              LBP
            </strong>
          </p>

          <label htmlFor="collector-amount">
            المبلغ المحصّل
            <input
              id="collector-amount"
              ref={amountRef}
              type="number"
              value={amount}
              disabled={Boolean(customer) && !changeAmount && billAmount > 0}
              onChange={(e) => setAmount(e.target.value)}
              style={
                changeAmount
                  ? { borderColor: "var(--warning)", background: "#fff7ed", boxShadow: "0 0 0 2px #fdba74" }
                  : undefined
              }
            />
          </label>
          <label htmlFor="collector-currency">
            العملة
            <select
              id="collector-currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value as "LBP" | "USD")}
            >
              <option value="LBP">LBP</option>
              <option value="USD">USD</option>
            </select>
          </label>

          {changeAmount ? (
            <p className="muted" style={{ marginTop: 8, marginBottom: 0 }}>
              أدخل المبلغ الذي حصّلته فعليًا إذا لم يدفع المشترك كامل الفاتورة.
            </p>
          ) : null}

          {message ? (
            <p style={{ color: saved ? "var(--success)" : "var(--danger)", marginBottom: 0 }}>{message}</p>
          ) : null}

          {saved ? (
            <div className="card-actions-right" style={{ marginTop: 12 }}>
              <button
                type="button"
                className="success-btn"
                onClick={() => router.push("/collector/dashboard")}
              >
                العودة إلى اللوحة
              </button>
            </div>
          ) : null}
        </div>

        <div className="card" style={{ direction: "rtl" }}>
          <h3 style={{ marginTop: 0 }}>آخر عمليات التحصيل</h3>
          <table className="collector-scans-table">
            <thead>
              <tr>
                <th>الوقت</th>
                <th>المشترك</th>
                <th>الشهر</th>
                <th>المحصّل</th>
                <th>الحالة</th>
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
                    <td>
                      <span className="num" style={{ direction: "ltr", unicodeBidi: "isolate" }}>
                        {formatNumber(log.collectedAmount)}
                      </span>{" "}
                      {log.currency ?? "LBP"}
                    </td>
                    <td style={{ color: validated ? "var(--success)" : "var(--warning)" }}>
                      {validated ? "موثّقة" : "بانتظار الموظّف"}
                    </td>
                  </tr>
                );
              })}
              {logs.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted">
                    لا توجد عمليات بعد.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {!saved ? (
        <div className="collector-sticky-action" style={{ display: "flex", gap: 8, direction: "rtl" }}>
          <button type="button" className="success-btn" style={{ flex: 1 }} onClick={record}>
            تسجيل التحصيل
          </button>
          {billAmount > 0 && !changeAmount ? (
            <button type="button" style={{ flex: 1 }} onClick={enableChange}>
              تغيير المبلغ المحصّل
            </button>
          ) : null}
        </div>
      ) : null}
    </AppShell>
  );
}

export default function CollectorScanPage() {
  return (
    <Suspense fallback={<div className="card">…</div>}>
      <CollectorScanContent />
    </Suspense>
  );
}
