"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import jsQR from "jsqr";
import { AppShell } from "../../_components/app-shell";
import { collectorNavItems } from "../../_components/role-nav";
import { type EmployeeRegion } from "../../../lib/types/employee";
import { CURRENT_MONTH_KEY } from "../../../lib/constants/months";
import { formatLbp, formatNumber } from "../../../lib/format";
import { useAvailableMonths } from "../../../lib/hooks/use-available-months";

type CollectorCustomer = {
  id: string;
  customerNumber: string;
  name: string;
  building: string;
  region: "mrah" | "printania";
  priceToPay: number;
  billThisMonth: number;
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
  validated: "Validated"
};
const STATUS_COLOR: Record<CollectionStatus, string> = {
  to_collect: "var(--danger)",
  pending: "var(--warning)",
  validated: "var(--success)"
};
const STATUS_ORDER: Record<CollectionStatus, number> = { to_collect: 0, pending: 1, validated: 2 };

function CollectModal({
  customer,
  monthKey,
  onClose,
  onDone
}: {
  customer: CollectorCustomer;
  monthKey: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const bill = customer.billThisMonth > 0 ? customer.billThisMonth : customer.priceToPay;
  const [changeAmount, setChangeAmount] = useState(false);
  const [amount, setAmount] = useState(bill > 0 ? String(Math.round(bill)) : "");
  const [currency, setCurrency] = useState<"LBP" | "USD">("LBP");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const amountRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!changeAmount && bill > 0) setAmount(String(Math.round(bill)));
  }, [changeAmount, bill]);

  function enableChange() {
    setChangeAmount(true);
    setTimeout(() => {
      amountRef.current?.focus();
      amountRef.current?.select();
    }, 0);
  }

  async function save() {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setError("أدخل مبلغًا أكبر من صفر.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/qr-collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: customer.id,
          customerNumber: customer.customerNumber,
          customerName: customer.name,
          regionCode: customer.region,
          monthKey,
          collectedAmount: value,
          expectedAmount: bill > 0 ? bill : undefined,
          currency,
          billScanImageName: `bill-scan-${customer.customerNumber}-${monthKey}.png`,
          employeeReceiptImageName: `receipt-${customer.customerNumber}-${monthKey}.jpg`
        })
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Failed to record the collection.");
        return;
      }
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record the collection.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Collect">
      <div className="modal-card" style={{ direction: "rtl" }}>
        <div className="row-between">
          <h3 style={{ margin: 0 }}>تحصيل — {customer.name}</h3>
          <button type="button" onClick={onClose} disabled={saving}>
            X
          </button>
        </div>
        <p className="muted" style={{ marginTop: 8, marginBottom: 4 }}>
          {customer.customerNumber} · {customer.building || "—"} · {monthKey}
        </p>
        <p style={{ marginTop: 0, marginBottom: 8 }}>
          <span className="muted">المبلغ المطلوب: </span>
          <strong style={{ fontSize: 18 }}>
            <span className="num" style={{ direction: "ltr", unicodeBidi: "isolate" }}>
              {bill > 0 ? formatNumber(bill) : "0"}
            </span>{" "}
            LBP
          </strong>
        </p>

        <label>
          المبلغ المحصّل
          <input
            ref={amountRef}
            type="number"
            value={amount}
            disabled={!changeAmount && bill > 0}
            onChange={(e) => setAmount(e.target.value)}
            style={
              changeAmount
                ? { borderColor: "var(--warning)", background: "#fff7ed", boxShadow: "0 0 0 2px #fdba74" }
                : undefined
            }
          />
        </label>
        <label>
          العملة
          <select value={currency} onChange={(e) => setCurrency(e.target.value as "LBP" | "USD")}>
            <option value="LBP">LBP</option>
            <option value="USD">USD</option>
          </select>
        </label>

        {changeAmount ? (
          <p className="muted" style={{ marginTop: 8, marginBottom: 0 }}>
            أدخل المبلغ الذي حصّلته فعليًا إذا لم يدفع المشترك كامل الفاتورة.
          </p>
        ) : null}

        {error ? <p style={{ color: "var(--danger)" }}>{error}</p> : null}

        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button type="button" className="success-btn" style={{ flex: 1 }} onClick={save} disabled={saving}>
            {saving ? "…" : "تسجيل التحصيل"}
          </button>
          {bill > 0 && !changeAmount ? (
            <button type="button" style={{ flex: 1 }} onClick={enableChange} disabled={saving}>
              تغيير المبلغ المحصّل
            </button>
          ) : (
            <button type="button" style={{ flex: 1 }} onClick={onClose} disabled={saving}>
              إلغاء
            </button>
          )}
        </div>
        <p className="muted" style={{ marginTop: 10, marginBottom: 0 }}>
          يظهر على لوحتك فورًا؛ يبقى بانتظار توثيق الموظّف في صفحة Review QR.
        </p>
      </div>
    </div>
  );
}

export default function CollectorDashboardPage() {
  const [regionFilter, setRegionFilter] = useState<"all" | EmployeeRegion>("all");
  const [monthKey, setMonthKey] = useState(CURRENT_MONTH_KEY);
  const months = useAvailableMonths();
  const [customers, setCustomers] = useState<CollectorCustomer[]>([]);
  const [qrLogs, setQrLogs] = useState<QrLog[]>([]);
  const [collectTarget, setCollectTarget] = useState<CollectorCustomer | null>(null);
  const [cameraMsg, setCameraMsg] = useState("");
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const loadCustomers = useCallback(() => {
    fetch(`/api/customers?month=${monthKey}&region=${regionFilter}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Failed to load collector customers.");
        const payload = (await response.json()) as {
          customers: Array<{
            id: string;
            customerNumber: string;
            fullName: string;
            building: string;
            region: "mrah" | "printania";
            ongoingBalance: number;
            ongoingBalanceThisMonth?: number;
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
            region: customer.region,
            priceToPay: customer.ongoingBalance ?? 0,
            billThisMonth: customer.ongoingBalanceThisMonth ?? 0,
            paidThisMonth: customer.paidThisMonth,
            isMonitor: Boolean(customer.isMonitor)
          }))
        );
      })
      .catch(() => setCustomers([]));
  }, [monthKey, regionFilter]);

  const loadQrLogs = useCallback(() => {
    fetch(`/api/qr-collections?status=all&month=${monthKey}&region=${regionFilter}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Failed to load QR collections.");
        const payload = (await response.json()) as { logs: QrLog[] };
        setQrLogs(payload.logs ?? []);
      })
      .catch(() => setQrLogs([]));
  }, [monthKey, regionFilter]);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);
  useEffect(() => {
    loadQrLogs();
  }, [loadQrLogs]);

  const rows = useMemo(() => {
    const qrByCustomer = new Map<string, QrLog["status"]>();
    for (const log of qrLogs) {
      const key = log.customerId || log.customerNumber;
      const existing = qrByCustomer.get(key);
      if (existing === "validated_by_employee") continue;
      qrByCustomer.set(key, log.status);
    }
    return customers
      .filter((customer) => !customer.isMonitor)
      .filter(
        (customer) =>
          customer.priceToPay > 0 ||
          customer.paidThisMonth ||
          qrByCustomer.has(customer.id) ||
          qrByCustomer.has(customer.customerNumber)
      )
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

  async function onCameraFile(file: File | undefined) {
    if (!file) return;
    setCameraMsg("Reading QR…");
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
      const w = Math.max(1, Math.round(bitmap.width * scale));
      const h = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        setCameraMsg("Couldn't process the photo.");
        return;
      }
      ctx.drawImage(bitmap, 0, 0, w, h);
      const imageData = ctx.getImageData(0, 0, w, h);
      const result = jsQR(imageData.data, w, h);
      if (!result?.data) {
        setCameraMsg("No QR code found in that photo — try again, closer and steady.");
        return;
      }
      let customerNumber = "";
      try {
        customerNumber = new URL(result.data).searchParams.get("customerNumber") ?? "";
      } catch {
        customerNumber = result.data.trim();
      }
      if (!customerNumber) {
        setCameraMsg("That QR doesn't contain a customer number.");
        return;
      }
      const match = customers.find((c) => c.customerNumber.toLowerCase() === customerNumber.toLowerCase());
      if (!match) {
        setCameraMsg(`Customer ${customerNumber} isn't in the list for ${monthKey} / ${regionFilter}.`);
        return;
      }
      setCameraMsg("");
      setCollectTarget(match);
    } catch {
      setCameraMsg("Couldn't read the photo. Make sure the QR is well lit and in focus.");
    }
  }

  return (
    <AppShell
      title="Collector Dashboard"
      subtitle="Scan bills, collect payments, and track what's still owed"
      navItems={collectorNavItems}
      appName="Station V2 - Collector"
    >
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          onCameraFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

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
            <p className="muted" style={{ marginBottom: 4 }}>
              To collect
            </p>
            <p className="kpi-value" style={{ marginTop: 0, color: "var(--danger)" }}>
              {toCollectCount}
            </p>
          </div>
          <div>
            <p className="muted" style={{ marginBottom: 4 }}>
              Awaiting validation
            </p>
            <p className="kpi-value" style={{ marginTop: 0, color: "var(--warning)" }}>
              {pendingCount}
            </p>
          </div>
          <div>
            <p className="muted" style={{ marginBottom: 4 }}>
              Validated
            </p>
            <p className="kpi-value" style={{ marginTop: 0, color: "var(--success)" }}>
              {validatedCount}
            </p>
          </div>
        </div>
        <div className="card-actions-right">
          <button type="button" className="show-all-btn" onClick={() => cameraInputRef.current?.click()}>
            Open Camera
          </button>
        </div>
        {cameraMsg ? (
          <p className="muted" style={{ marginBottom: 0 }}>
            {cameraMsg}
          </p>
        ) : null}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Customers — {monthKey}</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          &ldquo;Open&rdquo; or scanning a bill&apos;s QR records a collection here for your own tracking. The
          payment is only final once an employee confirms it under Review QR.
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
                    <button type="button" className="action-link-btn" onClick={() => setCollectTarget(row)}>
                      Open
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

      {collectTarget ? (
        <CollectModal
          customer={collectTarget}
          monthKey={monthKey}
          onClose={() => setCollectTarget(null)}
          onDone={() => {
            setCollectTarget(null);
            loadCustomers();
            loadQrLogs();
          }}
        />
      ) : null}
    </AppShell>
  );
}
