import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "../../../../../lib/supabase/server-admin";
import { requireRole } from "../../../../../lib/auth/require-role";

type Context = { params: { batchId: string } };

/** Printable bill rows for an approved batch (drives /employee/billing/print/[batchId]). */
export async function GET(_request: Request, context: Context) {
  try {
    const auth = await requireRole(["manager", "employee"]);
    if ("response" in auth) return auth.response;

    const supabase = createSupabaseAdminClient();

    const { data: batch, error: batchError } = await supabase
      .from("billing_batches")
      .select("id, month_key, status, regions!inner(code)")
      .eq("id", context.params.batchId)
      .maybeSingle();
    if (batchError) return NextResponse.json({ error: batchError.message }, { status: 500 });
    if (!batch) return NextResponse.json({ error: "Batch not found." }, { status: 404 });
    if (batch.status !== "approved_posted") {
      return NextResponse.json(
        { error: "This batch is not approved yet — there is nothing to print." },
        { status: 409 }
      );
    }

    const readOne = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);
    const regionCode =
      readOne(batch.regions as { code: string } | { code: string }[] | null)?.code ?? "unknown";

    const { data: bills, error: billsError } = await supabase
      .from("bills")
      .select(
        "previous_counter, new_counter, consumption_kwh, amount, remaining_amount, ampere_price_snapshot, kwh_price_snapshot, customers!inner(customer_number, full_name, building, box_number, phone, billing_types(key))"
      )
      .eq("billing_batch_id", batch.id);
    if (billsError) return NextResponse.json({ error: billsError.message }, { status: 500 });

    type BillCustomer = {
      customer_number: string;
      full_name: string;
      building: string | null;
      box_number: string | null;
      phone: string | null;
      billing_types: { key: string } | { key: string }[] | null;
    };

    const rows = (bills ?? [])
      .map((bill) => {
        const customer = readOne(bill.customers as BillCustomer | BillCustomer[] | null);
        const billingType = readOne(customer?.billing_types ?? null)?.key ?? "metered";
        return {
          customerNumber: customer?.customer_number ?? "",
          customerName: customer?.full_name ?? "",
          building: customer?.building ?? "",
          boxNumber: customer?.box_number ?? "",
          phone: customer?.phone ?? "",
          billingType,
          previousCounter: Number(bill.previous_counter),
          newCounter: Number(bill.new_counter),
          consumptionKwh: Number(bill.consumption_kwh),
          amount: Number(bill.amount),
          remainingAmount: Number(bill.remaining_amount),
          amperePriceSnapshot:
            bill.ampere_price_snapshot != null ? Number(bill.ampere_price_snapshot) : null,
          kwhPriceSnapshot: bill.kwh_price_snapshot != null ? Number(bill.kwh_price_snapshot) : null,
        };
      })
      .sort((a, b) => a.customerNumber.localeCompare(b.customerNumber, undefined, { numeric: true }));

    return NextResponse.json({
      batch: { monthKey: batch.month_key, regionCode },
      bills: rows,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
