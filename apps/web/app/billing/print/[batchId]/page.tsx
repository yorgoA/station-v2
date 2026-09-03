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
    direction: rtl; border: 1px solid #0f172a; border-radius: 3px; padding: 3mm 5mm;
    font-size: 10.5px; line-height: 1.45; display: flex; flex-direction: column; gap: 1.6mm;
  }
  .bill .head { display: grid; grid-template-columns: 1.4fr 1fr 24mm; gap: 4mm; align-items: start; }
  .bill .head .col { display: flex; flex-direction: column; gap: 0.6mm; }
  .bill .head .name { font-size: 13px; font-weight: 800; }
  .bill .head .subno { font-size: 12px; font-weight: 700; }
  .bill .k { color: #475569; }
  .bill .qr { width: 24mm; height: 24mm; }

  table.reads { width: 100%; border-collapse: collapse; font-size: 10px; }
  table.reads th, table.reads td { border: 1px solid #94a3b8; padding: 1mm 1.5mm; text-align: center; }
  table.reads th { background: #f1f5f9; font-weight: 700; }

  .bill .words { text-align: center; border-top: 1px solid #cbd5e1; padding-top: 1mm; font-size: 10px; }
  .bill .note { font-size: 9px; color: #334155; }

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
                const usd = usdRate != null && usdRate > 0 ? bill.amount / usdRate : null;
                const ampereLabel = bill.subscribedAmpere != null ? `${bill.subscribedAmpere}A` : "—";
                return (
                  <div key={bill.customerNumber} style={{ display: "contents" }}>
                    <div className="bill">
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
                            <span className="k">فاتورة #:</span> <N>{bill.customerNumber}</N>
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
                          </div>
                          <div>
                            <span className="k">المجموع:</span>{" "}
                            <strong>
                              <N>{num(bill.amount)}</N> {LL}
                            </strong>
                          </div>
                          {usd != null ? (
                            <div>
                              <span className="k">USD:</span> <N>{num(usd, 2)}</N>
                            </div>
                          ) : null}
                        </div>

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
                            </td>
                            <td>
                              <N>{num(ampereFee)}</N> {LL}
                            </td>
                            <td>
                              <N>{num(bill.amount)}</N> {LL}
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
                            <td>سعر الصرف</td>
                            <td>{usd != null ? <N>USD {num(usd, 2)}</N> : "—"}</td>
                          </tr>
                        </tbody>
                      </table>

                      <div className="words">المجموع {amountToArabicWords(bill.amount)}</div>

                      <div className="note">
                        ملاحظة: الرجاء تسديد الفاتورة قبل <N>10</N> من الشهر والالتزام بالتاريخ تفاديًا من
                        قطع الاشتراك. للصيانة الاتصال على الرقم <N>{MAINTENANCE_PHONE}</N>
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
