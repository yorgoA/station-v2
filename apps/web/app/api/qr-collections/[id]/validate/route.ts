import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "../../../../../lib/supabase/server-admin";
import { requireRole } from "../../../../../lib/auth/require-role";

type ValidateBody = {
  customerNumber?: string;
  monthKey?: string;
  collectedAmount?: number;
  currency?: "LBP" | "USD";
  modificationReason?: string;
};

type Context = { params: { id: string } };

export async function POST(request: Request, context: Context) {
  try {
    const auth = await requireRole(["manager", "employee"]);
    if ("response" in auth) return auth.response;

    const logId = context.params.id;
    const body = (await request.json()) as ValidateBody;
    const supabase = createSupabaseAdminClient();

    const { data: log, error: logError } = await supabase
      .from("qr_collection_logs")
      .select("id, customer_id, customer_number, customer_name, region_id, month_key, collected_amount, currency, employee_receipt_image_name")
      .eq("id", logId)
      .maybeSingle();
    if (logError) return NextResponse.json({ error: logError.message }, { status: 500 });
    if (!log) return NextResponse.json({ error: "QR log not found." }, { status: 404 });

    const nextCollectedAmount = body.collectedAmount ?? Number(log.collected_amount);
    if (!Number.isFinite(nextCollectedAmount) || nextCollectedAmount <= 0) {
      return NextResponse.json({ error: "Collected amount must be greater than 0." }, { status: 400 });
    }

    const wasModified =
      (body.customerNumber && body.customerNumber !== log.customer_number) ||
      (body.monthKey && body.monthKey !== log.month_key) ||
      (body.collectedAmount !== undefined && body.collectedAmount !== Number(log.collected_amount)) ||
      (body.currency && body.currency !== log.currency);

    if (wasModified && !body.modificationReason?.trim()) {
      return NextResponse.json({ error: "Modification reason is required." }, { status: 400 });
    }

    const { error: updateError } = await supabase
      .from("qr_collection_logs")
      .update({
        customer_number: body.customerNumber ?? log.customer_number,
        month_key: body.monthKey ?? log.month_key,
        collected_amount: nextCollectedAmount,
        currency: body.currency ?? log.currency,
        status: "validated_by_employee",
        modified_by_employee: wasModified,
        modification_reason: wasModified ? body.modificationReason?.trim() : null,
        validated_by_employee_at: new Date().toISOString(),
      })
      .eq("id", logId);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

    // record_payment() applies the amount to the bill for (customer, month) and rejects
    // atomically if it exceeds that bill's remaining balance -- same RPC the manual
    // employee payment flow uses (see POST /api/payments). A plain insert here would
    // record money collected without ever reducing what the customer owes.
    const { error: paymentError } = await supabase.rpc("record_payment", {
      p_customer_id: log.customer_id,
      p_month_key: body.monthKey ?? log.month_key,
      p_amount: nextCollectedAmount,
      p_method: "collector_qr",
      p_receipt_image_url: log.employee_receipt_image_name ?? null,
      p_notes: `Validated from qr_collection_logs:${log.id}`,
      p_actor_user_id: auth.actor.appUserId
    });
    if (paymentError) return NextResponse.json({ error: paymentError.message }, { status: 400 });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
