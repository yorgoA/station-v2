"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useParams } from "next/navigation";
import QRCode from "qrcode";
import { amountToArabicWords } from "../../../../lib/arabic-amount";

const MAINTENANCE_PHONE = "81 455 211";
const COMPANY_CODE = "CGA";

type PrintBill = {
  customerNumber: string;
  customerName: string;
  building: string;
  boxNumber: string;
  phone: string;
  subscribedAmpere: number | null;
  billingType: string;
  previousCounter: number;
  newCounter: number;
  consumptionKwh: number;
  amount: number;
  remainingAmount: number;
  amperePriceSnapshot: number | null;
  kwhPriceSnapshot: number | null;
  previousReadingAt: string | null;
  currentReadingAt: string | null;
};
type PrintPayload = {
  batch: { monthKey: string; regionCode: string; regionName: string | null; printedAt: string };
  pricing: { kwhPrice: number | null; usdRate: number | null };
  bills: PrintBill[];
};

const LL = "ل.ل";

/** Comma-grouped, LTR-safe number string for use inside the RTL bill. */
function num(value: number | null | undefined, decimals = 0): string {
  const n = Number.isFinite(Number(value)) ? Number(value) : 0;
  return n.toLocaleString("en-US", { maximumFractionDigits: decimals });
}

const PRINT_CSS = `
  * { box-sizing: border-box; }
  body { margin: 0; background: #eef2f6; color: #0f172a;
    font-family: "Segoe UI", Tahoma, "Noto Naskh Arabic", system-ui, sans-serif; }
  /* keep Latin digits/latin runs left-to-right even inside the RTL bill */
  .num { direction: ltr; unicode-bidi: isolate; display: inline-block; }
  .usd { color: #334155; font-size: 9px; direction: ltr; unicode-bidi: isolate; display: block; }
  .total-line {
    display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap;
    border-top: 1px solid #0f172a; padding-top: 1.5mm; font-size: 12px;
  }
  .total-line strong { font-size: 13px; }

  .print-toolbar {
    position: sticky; top: 0; z-index: 10; display: flex; gap: 12px; align-items: center;
    padding: 12px 20px; background: #fff; border-bottom: 1px solid #cbd5e1;
  }
  .print-toolbar button {
    padding: 8px 16px; border-radius: 8px; border: 1px solid #1d4ed8; background: #1d4ed8;
    color: #fff; font-weight: 600; cursor: pointer;
  }
  .print-toolbar .secondary { background: #fff; color: #1d4ed8; }
  .print-toolbar .muted { color: #64748b; font-weight: 400; margin-left: auto; }

  .print-area { padding: 20px; display: flex; flex-direction: column; align-items: center; gap: 16px; }
  .print-sheet {
    width: 210mm; background: #fff; padding: 8mm; display: flex; flex-direction: column; gap: 0;
    box-shadow: 0 1px 6px rgba(15,23,42,.15);
  }

  .bill {
    direction: rtl; border: 1px solid #0f172a; border-radius: 3px;
    font-size: 10.5px; line-height: 1.45; display: flex; flex-direction: row;
  }
  .bill-main { flex: 1 1 auto; min-width: 0; padding: 3mm 4mm; display: flex; flex-direction: column; gap: 1.6mm; }
  .bill-stub {
    width: 44mm; flex: 0 0 44mm; padding: 3mm; display: flex; flex-direction: column;
    gap: 1mm; align-items: center; text-align: center;
  }
  .bill-stub .qr { width: 30mm; height: 30mm; }
  .bill-stub .r { width: 100%; }
  .bill-stub .r .k { color: #475569; }
  .bill-stub .due {
    width: 100%; border-top: 1px solid #0f172a; padding-top: 1mm; margin-top: 1mm;
    display: flex; flex-direction: column; gap: 0.5mm; font-weight: 800; font-size: 12px;
  }
  .bill-stub .due .k { font-weight: 600; font-size: 10px; }

  /* vertical tear line between the main bill and the detachable stub */
  .cut-v {
    width: 5mm; flex: 0 0 5mm; position: relative;
    background-image: repeating-linear-gradient(to bottom, #94a3b8 0 6px, transparent 6px 12px);
    background-position: center; background-size: 1px 100%; background-repeat: no-repeat;
  }
  .cut-v span {
    position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%) rotate(90deg);
    background: #fff; padding: 2px 4px; color: #64748b; font-size: 8px; white-space: nowrap;
  }

  .bill-main .head { display: grid; grid-template-columns: 1.3fr 1fr; gap: 4mm; align-items: start; }
  .bill-main .head .col { display: flex; flex-direction: column; gap: 0.6mm; }
  .bill-main .head .name { font-size: 13px; font-weight: 800; }
  .bill-main .head .subno { font-size: 12px; font-weight: 700; }
  .bill-main .k { color: #475569; }

  table.reads { width: 100%; border-collapse: collapse; font-size: 10px; }
  table.reads th, table.reads td { border: 1px solid #94a3b8; padding: 1mm 1.5mm; text-align: center; }
  table.reads th { background: #f1f5f9; font-weight: 700; }

  .bill-main .words { text-align: center; border-top: 1px solid #cbd5e1; padding-top: 1mm; font-size: 10px; }
  .bill-main .note { font-size: 9px; color: #334155; }

  .cut {
    height: 6mm; display: flex; align-items: center; justify-content: center; gap: 6px;
    color: #64748b; font-size: 9px;
    background-image: repeating-linear-gradient(to left, #94a3b8 0 6px, transparent 6px 12px);
    background-position: center; background-size: 100% 1px; background-repeat: no-repeat;
  }
  .cut span { background: #fff; padding: 0 6px; }

  @media print {
    body { background: #fff; }
    .print-toolbar { display: none; }
    .print-area { padding: 0; gap: 0; }
    .print-sheet {
      width: auto; box-shadow: none; padding: 0;
      height: 281mm; page-break-after: always;
    }
    .print-sheet:last-child { page-break-after: auto; }
    .bill { flex: 1 1 0; min-height: 0; overflow: hidden; break-inside: avoid; }
    @page { size: A4; margin: 8mm; }
  }
`;

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}
function dateOnly(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toISOString().slice(0, 10);
}
function timeOnly(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toTimeString().slice(0, 8);
}
const N = ({ children }: { children: ReactNode }) => <span className="num">{children}</span>;

export default function BillingPrintBatchPage() {
  const params = useParams<{ batchId: string }>();
  const batchId = params?.batchId ?? "";
  const [data, setData] = useState<PrintPayload | null>(null);
  const [error, setError] = useState("");
  const [qrByCustomer, setQrByCustomer] = useState<Record<string, string>>({});
  const autoPrinted = useRef(false);

  useEffect(() => {
    if (!batchId) return;
    fetch(`/api/billing/print/${batchId}`)
      .then(async (response) => {
        const payload = (await response.json()) as PrintPayload & { error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Failed to load bills for print.");
        setData(payload);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load bills."));
  }, [batchId]);

  useEffect(() => {
    if (!data || data.bills.length === 0) return;
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    let cancelled = false;
    Promise.all(
      data.bills.map(async (bill) => {
        const target = `${origin}/collector/scan?customerNumber=${encodeURIComponent(
          bill.customerNumber
        )}&month=${data.batch.monthKey}`;
        const url = await QRCode.toDataURL(target, { margin: 0, width: 220 });
        return [bill.customerNumber, url] as const;
      })
    ).then((pairs) => {
      if (!cancelled) setQrByCustomer(Object.fromEntries(pairs));
    });
    return () => {
      cancelled = true;
    };
  }, [data]);

  useEffect(() => {
    if (!autoPrinted.current && data && data.bills.length > 0 && Object.keys(qrByCustomer).length > 0) {
      autoPrinted.current = true;
      const t = setTimeout(() => window.print(), 500);
      return () => clearTimeout(t);
    }
  }, [data, qrByCustomer]);

  const bills = data?.bills ?? [];
  const sheets = chunk(bills, 3);
  const monthKey = data?.batch.monthKey ?? "";
  const regionLabel = data?.batch.regionName ?? data?.batch.regionCode ?? "";
  const usdRate = data?.pricing.usdRate ?? null;
  const printedAt = data ? new Date(data.batch.printedAt) : null;
  const printedStr = printedAt
    ? `${printedAt.toISOString().slice(0, 10)} ${printedAt.toTimeString().slice(0, 8)}`
    : "—";

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <div className="print-toolbar">
        <button type="button" onClick={() => window.print()}>
          Print
        </button>
        <button type="button" className="secondary" onClick={() => window.close()}>
          Close
        </button>
        <span className="muted">
          {data ? `${monthKey} · ${regionLabel} · ${bills.length} bills` : "Loading…"}
        </span>
      </div>

      {error ? (
        <div className="print-area">
          <p style={{ color: "#b91c1c" }}>{error}</p>
        </div>
      ) : bills.length === 0 && data ? (
        <div className="print-area">
          <p>No bills found for this batch.</p>
        </div>
      ) : (
        <div className="print-area">
          {sheets.map((sheetBills, sheetIndex) => (
            <div className="print-sheet" key={sheetIndex}>
              {sheetBills.map((bill, i) => {
                const consumptionCharge =
                  bill.kwhPriceSnapshot != null ? bill.consumptionKwh * bill.kwhPriceSnapshot : 0;
                const ampereFee = bill.amperePriceSnapshot ?? 0;
                const hasUsd = usdRate != null && usdRate > 0;
                const toUsd = (lbp: number) => (hasUsd ? lbp / (usdRate as number) : null);
                const usd = toUsd(bill.amount);
                const usdCell = (lbp: number) =>
                  hasUsd ? <span className="usd">${num(toUsd(lbp) ?? 0, 2)}</span> : null;
                const ampereLabel = bill.subscribedAmpere != null ? `${bill.subscribedAmpere}A` : "—";
                return (
                  <div key={bill.customerNumber} style={{ display: "contents" }}>
                    <div className="bill">
                      <div className="bill-main">
                        <div className="head">
                          <div className="col">
                            <div>
                              اشتراك {COMPANY_CODE} — <N>{regionLabel}</N>
                            </div>
                            <div className="name">{bill.customerName}</div>
                            <div className="subno">
                              <N>{bill.customerNumber}</N>
                            </div>
                            <div>
                              <span className="k">المبنى:</span> {bill.building || "—"}
                              {bill.boxNumber ? (
                                <>
                                  {" · صندوق "}
                                  <N>{bill.boxNumber}</N>
                                </>
                              ) : null}
                            </div>
                            <div>
                              <span className="k">الهاتف:</span> <N>{bill.phone || "—"}</N>
                            </div>
                          </div>

                          <div className="col">
                            <div>
                              <span className="k">الشهر:</span> <N>{monthKey}</N>
                            </div>
                            <div>
                              <span className="k">تاريخ الطباعة:</span> <N>{printedStr}</N>
                            </div>
                            <div>
                              <span className="k">الامبير:</span> <N>{ampereLabel}</N>
                            </div>
                            <div>
                              <span className="k">سعر KW:</span> <N>{num(bill.kwhPriceSnapshot ?? 0)}</N> {LL}
                              {hasUsd ? <span className="usd">${num(toUsd(bill.kwhPriceSnapshot ?? 0) ?? 0, 4)}</span> : null}
                            </div>
                            {hasUsd ? (
                              <div>
                                <span className="k">سعر صرف الدولار:</span> <N>{num(usdRate ?? 0)}</N> {LL}
                              </div>
                            ) : null}
                          </div>
                        </div>

                        <table className="reads">
                        <thead>
                          <tr>
                            <th>السابق</th>
                            <th>الحالي</th>
                            <th>كيلووات</th>
                            <th>السعر</th>
                            <th>الاشتراك</th>
                            <th>المجموع</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td>
                              <N>{num(bill.previousCounter)}</N>
                            </td>
                            <td>
                              <N>{num(bill.newCounter)}</N>
                            </td>
                            <td>
                              <N>{num(bill.consumptionKwh, 1)}</N>
                            </td>
                            <td>
                              <N>{num(consumptionCharge)}</N> {LL}
                              {usdCell(consumptionCharge)}
                            </td>
                            <td>
                              <N>{num(ampereFee)}</N> {LL}
                              {usdCell(ampereFee)}
                            </td>
                            <td>
                              <N>{num(bill.amount)}</N> {LL}
                              {usdCell(bill.amount)}
                            </td>
                          </tr>
                          <tr>
                            <td>
                              <N>{dateOnly(bill.previousReadingAt)}</N>
                            </td>
                            <td>
                              <N>{dateOnly(bill.currentReadingAt)}</N>
                            </td>
                            <td />
                            <td />
                            <td>المجموع</td>
                            <td>
                              <strong>
                                <N>{num(bill.amount)}</N> {LL}
                              </strong>
                              {usdCell(bill.amount)}
                            </td>
                          </tr>
                          <tr>
                            <td>
                              <N>{timeOnly(bill.previousReadingAt)}</N>
                            </td>
                            <td>
                              <N>{timeOnly(bill.currentReadingAt)}</N>
                            </td>
                            <td />
                            <td />
                            <td>السعر بالدولار</td>
                            <td>{hasUsd ? <N>{num(usd ?? 0, 2)} USD</N> : "—"}</td>
                          </tr>
                        </tbody>
                      </table>

                      <div className="total-line">
                        <span className="k">المجموع المستحق:</span>
                        <strong>
                          <N>{num(bill.amount)}</N> {LL}
                        </strong>
                        {hasUsd ? (
                          <>
                            <span className="k">=</span>
                            <strong>
                              <N>{num(usd ?? 0, 2)} USD</N>
                            </strong>
                          </>
                        ) : null}
                      </div>

                      <div className="words">المجموع {amountToArabicWords(bill.amount)}</div>

                      <div className="note">
                        ملاحظة: الرجاء تسديد الفاتورة قبل <N>10</N> من الشهر والالتزام بالتاريخ تفاديًا من
                        قطع الاشتراك. للصيانة الاتصال على الرقم <N>{MAINTENANCE_PHONE}</N>
                      </div>
                      </div>

                      <div className="cut-v">
                        <span>✂ قص</span>
                      </div>

                      <div className="bill-stub">
                        {qrByCustomer[bill.customerNumber] ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            className="qr"
                            src={qrByCustomer[bill.customerNumber]}
                            alt={`QR ${bill.customerNumber}`}
                          />
                        ) : (
                          <div className="qr" />
                        )}
                        <div className="r name" style={{ fontWeight: 700 }}>
                          {bill.customerName}
                        </div>
                        <div className="r">
                          <span className="k">رقم:</span> <N>{bill.customerNumber}</N>
                        </div>
                        <div className="r">
                          <span className="k">الشهر:</span> <N>{monthKey}</N>
                        </div>
                        <div className="due">
                          <div className="k">المطلوب</div>
                          <div>
                            <N>{num(bill.amount)}</N> {LL}
                          </div>
                          {usd != null ? (
                            <div>
                              <N>{num(usd, 2)} USD</N>
                            </div>
                          ) : null}
                        </div>
                        {hasUsd ? (
                          <div className="r">
                            <span className="k">سعر الصرف:</span> <N>{num(usdRate ?? 0)}</N> {LL}
                          </div>
                        ) : null}
                      </div>
                    </div>
                    {i < sheetBills.length - 1 ? (
                      <div className="cut">
                        <span>✂ قص من هنا</span>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
