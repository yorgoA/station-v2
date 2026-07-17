import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "../../../lib/supabase/server-admin";
import { requireRole } from "../../../lib/auth/require-role";

type CreatePaymentBody = {
  customerId: string;
  customerNumber: string;
  customerName: string;
  regionCode: "mrah" | "printania";
  monthKey: string;
  amount: number;
  receiptImageUrl?: string;
};

export async function GET(request: Request) {
  try {
    const auth = await requireRole(["manager", "employee"]);
    if ("response" in auth) return auth.response;

    const { searchParams } = new URL(request.url);
    const region = searchParams.get("region");
    const month = searchParams.get("month");
    const supabase = createSupabaseAdminClient();

    let query = supabase
      .from("payments")
      .select("id, amount, payment_date, receipt_image_url, customers!inner(id, full_name, regions!inner(code))")
      .order("payment_date", { ascending: false });

    if (month && month !== "all") query = query.gte("payment_date", `${month}-01`).lte("payment_date", `${month}-31`);
    if (region && region !== "all") query = query.eq("customers.regions.code", region);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const readRegion = (value: { code: string } | Array<{ code: string }> | null | undefined) => {
      if (Array.isArray(value)) return value[0] ?? null;
      return value ?? null;
    };
    const readCustomer = (
      value:
        | { id: string; full_name: string; regions?: { code: string } | Array<{ code: string }> | null }
        | Array<{ id: string; full_name: string; regions?: { code: string } | Array<{ code: string }> | null }>
        | null
    ) => {
      if (Array.isArray(value)) return value[0] ?? null;
      return value;
    };

    const payments = (data ?? []).map((row) => {
      const customer = readCustomer(
        row.customers as
          | { id: string; full_name: string; regions?: { code: string } | Array<{ code: string }> | null }
          | Array<{ id: string; full_name: string; regions?: { code: string } | Array<{ code: string }> | null }>
          | null
      );
      return {
        id: row.id,
        customerId: customer?.id ?? "",
        customerName: customer?.full_name ?? "-",
        region: (readRegion(customer?.regions)?.code as "mrah" | "printania" | undefined) ?? "mrah",
        amount: Number(row.amount),
        date: row.payment_date,
        receipt: row.receipt_image_url ?? "-",
      };
    });

    return NextResponse.json({ payments });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireRole(["manager", "employee"]);
    if ("response" in auth) return auth.response;

    const body = (await request.json()) as CreatePaymentBody;
    if (!body.customerId || !body.regionCode || !body.monthKey || !body.amount) {
      return NextResponse.json({ error: "Invalid payment payload." }, { status: 400 });
    }
    if (!Number.isFinite(body.amount) || body.amount <= 0) {
      return NextResponse.json({ error: "Payment amount must be greater than 0." }, { status: 400 });
    }
    if (!body.receiptImageUrl) {
      return NextResponse.json({ error: "A receipt image is required." }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    // record_payment() applies the amount to the bill for (customer, month) and
    // rejects atomically if it exceeds that bill's remaining balance — see
    // db/schema.sql / db/migrations/004_record_payment.sql.
    const { error } = await supabase.rpc("record_payment", {
      p_customer_id: body.customerId,
      p_month_key: body.monthKey,
      p_amount: body.amount,
      p_method: "employee_manual",
      p_receipt_image_url: body.receiptImageUrl,
      p_notes: `Manual employee payment for ${body.customerNumber}`,
      p_actor_user_id: auth.actor.appUserId
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
