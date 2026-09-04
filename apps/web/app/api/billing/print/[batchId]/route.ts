import { NextResponse } from "next/server";
import { serverError } from "../../../../../lib/api/server-error";
import { createSupabaseAdminClient } from "../../../../../lib/supabase/server-admin";
import { requireRole } from "../../../../../lib/auth/require-role";

type Context = { params: { batchId: string } };

function previousMonthKey(monthKey: string): string | null {
  const m = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const d = new Date(year, month - 2, 1); // month is 1-based; -2 -> previous month
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Printable bill rows for an approved batch (drives /employee/billing/print/[batchId]). */
export async function GET(_request: Request, context: Context) {
  try {
    const auth = await requireRole(["manager", "employee"]);
    if ("response" in auth) return auth.response;

    const supabase = createSupabaseAdminClient();

    const { data: batch, error: batchError } = await supabase
      .from("billing_batches")
      .select("id, month_key, region_id, status, submitted_at, reviewed_at, regions!inner(code, name)")
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

    const readOne = <T>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
    const region = readOne(
      batch.regions as { code: string; name: string | null } | { code: string; name: string | null }[] | null
    );

    const [{ data: tariff }, { data: bills, error: billsError }, prevBatchRes] = await Promise.all([
      supabase
        .from("monthly_kwh_tariffs")
        .select("kwh_price, usd_rate")
        .eq("month_key", batch.month_key)
        .maybeSingle(),
      supabase
        .from("bills")
        .select(
          "customer_id, previous_counter, new_counter, consumption_kwh, amount, remaining_amount, ampere_price_snapshot, kwh_price_snapshot, customers!inner(customer_number, full_name, building, box_number, phone, subscribed_ampere, billing_types(key))"
        )
        .eq("billing_batch_id", batch.id),
      (async () => {
        const prevKey = previousMonthKey(batch.month_key);
        if (!prevKey) return { data: null };
        return supabase
          .from("billing_batches")
          .select("id")
          .eq("month_key", prevKey)
          .eq("region_id", batch.region_id)
          .eq("status", "approved_posted")
          .maybeSingle();
      })()
    ]);
    if (billsError) return NextResponse.json({ error: billsError.message }, { status: 500 });

    // Per-customer reading timestamps: when the counter photo was captured in the
    // app for this batch (current) and the previous month's approved batch.
    const currentReadingByCustomer = new Map<string, string>();
    {
      const { data: items } = await supabase
        .from("billing_batch_items")
        .select("customer_id, counter_image_uploaded_at")
        .eq("batch_id", batch.id);
      for (const item of items ?? []) {
        currentReadingByCustomer.set(String(item.customer_id), String(item.counter_image_uploaded_at ?? ""));
      }
    }
    const previousReadingByCustomer = new Map<string, string>();
    const prevBatchId = (prevBatchRes.data as { id: string } | null)?.id;
    if (prevBatchId) {
      const { data: prevItems } = await supabase
        .from("billing_batch_items")
        .select("customer_id, counter_image_uploaded_at")
        .eq("batch_id", prevBatchId);
      for (const item of prevItems ?? []) {
        previousReadingByCustomer.set(String(item.customer_id), String(item.counter_image_uploaded_at ?? ""));
      }
    }

    type BillCustomer = {
      customer_number: string;
      full_name: string;
      building: string | null;
      box_number: string | null;
      phone: string | null;
      subscribed_ampere: number | null;
      billing_types: { key: string } | { key: string }[] | null;
    };

    const rows = (bills ?? [])
      .map((bill) => {
        const customer = readOne(bill.customers as BillCustomer | BillCustomer[] | null);
        const billingType = readOne(customer?.billing_types ?? null)?.key ?? "metered";
        const customerId = String(bill.customer_id);
        return {
          customerNumber: customer?.customer_number ?? "",
          customerName: customer?.full_name ?? "",
          building: customer?.building ?? "",
          boxNumber: customer?.box_number ?? "",
          phone: customer?.phone ?? "",
          subscribedAmpere: customer?.subscribed_ampere ?? null,
          billingType,
          previousCounter: Number(bill.previous_counter),
          newCounter: Number(bill.new_counter),
          consumptionKwh: Number(bill.consumption_kwh),
          amount: Number(bill.amount),
          remainingAmount: Number(bill.remaining_amount),
          amperePriceSnapshot: bill.ampere_price_snapshot != null ? Number(bill.ampere_price_snapshot) : null,
          kwhPriceSnapshot: bill.kwh_price_snapshot != null ? Number(bill.kwh_price_snapshot) : null,
          previousReadingAt: previousReadingByCustomer.get(customerId) || null,
          currentReadingAt: currentReadingByCustomer.get(customerId) || null
        };
      })
      .sort((a, b) => a.customerNumber.localeCompare(b.customerNumber, undefined, { numeric: true }));

    return NextResponse.json({
      batch: {
        monthKey: batch.month_key,
        regionCode: region?.code ?? "unknown",
        regionName: region?.name ?? null,
        printedAt: new Date().toISOString()
      },
      pricing: {
        kwhPrice: tariff?.kwh_price != null ? Number(tariff.kwh_price) : null,
        usdRate: tariff?.usd_rate != null ? Number(tariff.usd_rate) : null
      },
      bills: rows
    });
  } catch (error) {
    return serverError(error);
  }
}
