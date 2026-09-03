"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { formatLbp, formatNumber } from "../../../../lib/format";

type PrintBill = {
  customerNumber: string;
  customerName: string;
  building: string;
  boxNumber: string;
  phone: string;
  billingType: string;
  previousCounter: number;
  newCounter: number;
  consumptionKwh: number;
  amount: number;
  remainingAmount: number;
  amperePriceSnapshot: number | null;
  kwhPriceSnapshot: number | null;
};

const PRINT_CSS = `
  * { box-sizing: border-box; }
  body { margin: 0; background: #eef2f6; color: #0f172a; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
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
  .print-bill {
    border: 1px solid #0f172a; border-radius: 4px; padding: 5mm 7mm; min-height: 80mm;
    display: flex; flex-direction: column; gap: 3mm;
  }
  .print-bill .bill-head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid #94a3b8; padding-bottom: 2mm; }
  .print-bill .brand { font-weight: 800; letter-spacing: .04em; }
  .print-bill .sub { font-size: 12px; color: #475569; }
  .print-bill .cust-no { font-size: 20px; font-weight: 800; }
  .print-bill .rows { display: grid; grid-template-columns: 1fr 1fr; gap: 2mm 6mm; font-size: 13px; }
  .print-bill .rows div span { color: #475569; }
  .print-bill .total { margin-top: auto; display: flex; justify-content: space-between; align-items: baseline; border-top: 2px solid #0f172a; padding-top: 2mm; }
  .print-bill .total .amt { font-size: 22px; font-weight: 800; }
  @media print {
    body { background: #fff; }
    .print-toolbar { display: none; }
    .print-area { padding: 0; gap: 0; }
    .print-sheet { width: auto; box-shadow: none; padding: 0; page-break-after: always; }
    .print-sheet:last-child { page-break-after: auto; }
    .print-bill { break-inside: avoid; }
    @page { size: A4; margin: 10mm; }
  }
`;

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

export default function BillingPrintBatchPage() {
  const params = useParams<{ batchId: string }>();
  const batchId = params?.batchId ?? "";
  const [batch, setBatch] = useState<{ monthKey: string; regionCode: string } | null>(null);
  const [bills, setBills] = useState<PrintBill[] | null>(null);
  const [error, setError] = useState("");
  const autoPrinted = useRef(false);

  useEffect(() => {
    if (!batchId) return;
    fetch(`/api/billing/print/${batchId}`)
      .then(async (response) => {
        const data = (await response.json()) as {
          error?: string;
          batch?: { monthKey: string; regionCode: string };
          bills?: PrintBill[];
        };
        if (!response.ok) throw new Error(data.error ?? "Failed to load bills for print.");
        setBatch(data.batch ?? null);
        setBills(data.bills ?? []);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load bills."));
  }, [batchId]);

  useEffect(() => {
    if (!autoPrinted.current && bills && bills.length > 0) {
      autoPrinted.current = true;
      const t = setTimeout(() => window.print(), 400);
      return () => clearTimeout(t);
    }
  }, [bills]);

  const sheets = chunk(bills ?? [], 3);

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
          {batch ? `${batch.monthKey} · ${batch.regionCode} · ${bills?.length ?? 0} bills` : "Loading…"}
        </span>
      </div>

      {error ? (
        <div className="print-area">
          <p style={{ color: "#b91c1c" }}>{error}</p>
        </div>
      ) : bills && bills.length === 0 ? (
        <div className="print-area">
          <p>No bills found for this batch.</p>
        </div>
      ) : (
        <div className="print-area">
          {sheets.map((sheetBills, sheetIndex) => (
            <div className="print-sheet" key={sheetIndex}>
              {sheetBills.map((bill) => {
                const consumptionCharge =
                  bill.kwhPriceSnapshot != null
                    ? bill.consumptionKwh * bill.kwhPriceSnapshot
                    : null;
                return (
                  <div className="print-bill" key={bill.customerNumber}>
                    <div className="bill-head">
                      <div>
                        <div className="brand">STATION V2</div>
                        <div className="sub">
                          {batch?.regionCode} · {batch?.monthKey}
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div className="cust-no">{bill.customerNumber}</div>
                        <div className="sub">{bill.billingType}</div>
                      </div>
                    </div>

                    <div>
                      <strong>{bill.customerName}</strong>
                      <div className="sub">
                        {[bill.building, bill.boxNumber && `Box ${bill.boxNumber}`, bill.phone]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    </div>

                    <div className="rows">
                      <div>
                        <span>Previous counter</span>
                        <div>{formatNumber(bill.previousCounter)}</div>
                      </div>
                      <div>
                        <span>New counter</span>
                        <div>{formatNumber(bill.newCounter)}</div>
                      </div>
                      <div>
                        <span>Consumption</span>
                        <div>{formatNumber(bill.consumptionKwh, { maxDecimals: 1 })} kWh</div>
                      </div>
                      {bill.amperePriceSnapshot != null ? (
                        <div>
                          <span>Ampere fee</span>
                          <div>{formatLbp(bill.amperePriceSnapshot)}</div>
                        </div>
                      ) : null}
                      {consumptionCharge != null ? (
                        <div>
                          <span>
                            Consumption charge ({formatNumber(bill.kwhPriceSnapshot ?? 0)} / kWh)
                          </span>
                          <div>{formatLbp(consumptionCharge)}</div>
                        </div>
                      ) : null}
                    </div>

                    <div className="total">
                      <span>Total due</span>
                      <span className="amt">{formatLbp(bill.amount)}</span>
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
