"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import QRCode from "qrcode";
import { formatNumber } from "../../../../lib/format";
import { amountToArabicWords } from "../../../../lib/arabic-amount";

// Give me the real maintenance number and I'll drop it in here.
const MAINTENANCE_PHONE = "XX-XXXXXX";
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

const PRINT_CSS = `
  * { box-sizing: border-box; }
  body { margin: 0; background: #eef2f6; color: #0f172a; font-family: "Segoe UI", Tahoma, "Noto Naskh Arabic", system-ui, sans-serif; }
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
    width: 210mm; background: #fff; padding: 10mm; display: flex; flex-direction: column; gap: 4mm;
    box-shadow: 0 1px 6px rgba(15,23,42,.15);
  }
  .bill {
    direction: rtl; border: 1px solid #0f172a; border-radius: 4px; padding: 4mm 6mm;
    min-height: 84mm; font-size: 12px; line-height: 1.5;
    display: flex; flex-direction: column; gap: 2.5mm;
  }
  .bill .head { display: grid; grid-template-columns: 1.1fr 1.3fr 1fr; gap: 4mm; align-items: start; }
  .bill .head .col { display: flex; flex-direction: column; gap: 1mm; }
  .bill .head .name { font-size: 16px; font-weight: 800; }
  .bill .head .subno { font-size: 14px; font-weight: 700; }
  .bill .k { color: #475569; }
  .bill .qr { width: 26mm; height: 26mm; margin-top: 1mm; }
  table.reads { width: 100%; border-collapse: collapse; font-size: 11.5px; }
  table.reads th, table.reads td { border: 1px solid #94a3b8; padding: 1.4mm 2mm; text-align: center; }
  table.reads th { background: #f1f5f9; font-weight: 700; }
  .bill .words { font-style: italic; text-align: center; border-top: 1px solid #cbd5e1; padding-top: 1.5mm; }
  .bill .note { font-size: 10.5px; color: #334155; }
  @media print {
    body { background: #fff; }
    .print-toolbar { display: none; }
    .print-area { padding: 0; gap: 0; }
    .print-sheet { width: auto; box-shadow: none; padding: 0; page-break-after: always; }
    .print-sheet:last-child { page-break-after: auto; }
    .bill { break-inside: avoid; }
    @page { size: A4; margin: 10mm; }
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
              {sheetBills.map((bill) => {
                const consumptionCharge =
                  bill.kwhPriceSnapshot != null ? bill.consumptionKwh * bill.kwhPriceSnapshot : 0;
                const ampereFee = bill.amperePriceSnapshot ?? 0;
                const usd = usdRate != null && usdRate > 0 ? bill.amount / usdRate : null;
                const ampereLabel = bill.subscribedAmpere != null ? `${bill.subscribedAmpere}A` : "—";
                return (
                  <div className="bill" key={bill.customerNumber}>
                    <div className="head">
                      {/* right column */}
                      <div className="col">
                        <div>
                          اشتراك <span>{COMPANY_CODE}</span>
                        </div>
                        <div className="name">{bill.customerName}</div>
                        <div className="subno">{bill.customerNumber}</div>
                        <div>
                          <span className="k">فاتورة #:</span> {bill.customerNumber}
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

                      {/* middle column */}
                      <div className="col">
                        <div>
                          <span className="k">تاريخ الطباعة:</span>{" "}
                          {printedAt
                            ? `${printedAt.toISOString().slice(0, 10)} ${printedAt
                                .toTimeString()
                                .slice(0, 8)}`
                            : "—"}
                        </div>
                        <div>
                          <span className="k">الشهر:</span> {monthKey}
                        </div>
                        <div>
                          <span className="k">الامبير:</span> {ampereLabel}
                        </div>
                        <div>
                          <span className="k">سعر KW:</span> {formatNumber(bill.kwhPriceSnapshot ?? 0)} {LL}
                        </div>
                        <div>
                          <span className="k">العنوان:</span> {bill.building || "—"}
                          {bill.boxNumber ? ` · صندوق ${bill.boxNumber}` : ""}
                        </div>
                      </div>

                      {/* left column */}
                      <div className="col">
                        <div>
                          <span className="k">اشتراك:</span> {regionLabel}
                        </div>
                        <div>
                          <span className="k">اسم:</span> {bill.customerName}
                        </div>
                        <div>
                          <span className="k">المبنى:</span> {bill.building || "—"}
                        </div>
                        <div>
                          <span className="k">الهاتف:</span> {bill.phone || "—"}
                        </div>
                        <div>
                          <span className="k">كيلووات:</span> {formatNumber(bill.consumptionKwh, { maxDecimals: 1 })} Kwh
                        </div>
                        <div>
                          <span className="k">المجموع:</span> <strong>{formatNumber(bill.amount)} {LL}</strong>
                        </div>
                        {usd != null ? (
                          <div>
                            <span className="k">USD:</span> {formatNumber(usd, { maxDecimals: 2 })}
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
                          <td>{formatNumber(bill.previousCounter)}</td>
                          <td>{formatNumber(bill.newCounter)}</td>
                          <td>Kwh {formatNumber(bill.consumptionKwh, { maxDecimals: 1 })}</td>
                          <td>{formatNumber(consumptionCharge)} {LL}</td>
                          <td>{formatNumber(ampereFee)} {LL}</td>
                          <td>{formatNumber(bill.amount)} {LL}</td>
                        </tr>
                        <tr>
                          <td>{dateOnly(bill.previousReadingAt)}</td>
                          <td>{dateOnly(bill.currentReadingAt)}</td>
                          <td />
                          <td />
                          <td>المجموع</td>
                          <td>
                            <strong>{formatNumber(bill.amount)} {LL}</strong>
                          </td>
                        </tr>
                        <tr>
                          <td>{timeOnly(bill.previousReadingAt)}</td>
                          <td>{timeOnly(bill.currentReadingAt)}</td>
                          <td />
                          <td />
                          <td>سعر الصرف</td>
                          <td>{usd != null ? `USD ${formatNumber(usd, { maxDecimals: 2 })}` : "—"}</td>
                        </tr>
                      </tbody>
                    </table>

                    <div className="words">المجموع {amountToArabicWords(bill.amount)}</div>

                    <div className="note">
                      ملاحظة: الرجاء تسديد الفاتورة قبل 10 من الشهر والالتزام بالتاريخ تفاديًا من قطع
                      الاشتراك. للصيانة الاتصال على الرقم {MAINTENANCE_PHONE}
                    </div>
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
