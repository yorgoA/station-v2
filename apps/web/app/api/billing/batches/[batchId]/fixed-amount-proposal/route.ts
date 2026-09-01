import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "../../../../../../lib/supabase/server-admin";
import { requireRole } from "../../../../../../lib/auth/require-role";

type Context = {
  params: { batchId: string };
};

type Body = {
  itemId?: string;
  decision?: "approved" | "rejected";
};

/**
 * Manager decides an employee-proposed correction to a fixed-monthly customer's
 * amount, during batch review. Approving updates customers.fixed_monthly_amount
 * (the standing value, used from this batch's approval onward) -- it never
 * rewrites already-approved bills. Rejecting just records the decision.
 */
export async function POST(request: Request, context: Context) {
  try {
    const auth = await requireRole(["manager"]);
    if ("response" in auth) return auth.response;

    const batchId = context.params.batchId;
    const body = (await request.json()) as Body;
    if (!body.itemId) {
      return NextResponse.json({ error: "itemId is required." }, { status: 400 });
    }
    if (body.decision !== "approved" && body.decision !== "rejected") {
      return NextResponse.json({ error: "decision must be 'approved' or 'rejected'." }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();

    const { data: batch, error: batchError } = await supabase
      .from("billing_batches")
      .select("id, status")
      .eq("id", batchId)
      .maybeSingle();
    if (batchError) return NextResponse.json({ error: batchError.message }, { status: 500 });
    if (!batch) return NextResponse.json({ error: "Batch not found." }, { status: 404 });
    if (batch.status !== "pending_review" && batch.status !== "changes_requested") {
      return NextResponse.json(
        { error: `Batch is ${batch.status}; proposals can only be decided while it is in review.` },
        { status: 409 }
      );
    }

    const { data: item, error: itemError } = await supabase
      .from("billing_batch_items")
      .select("id, customer_id, proposed_fixed_monthly_amount, proposed_fixed_monthly_decision")
      .eq("id", body.itemId)
      .eq("batch_id", batchId)
      .maybeSingle();
    if (itemError) return NextResponse.json({ error: itemError.message }, { status: 500 });
    if (!item) return NextResponse.json({ error: "Batch item not found in this batch." }, { status: 404 });
    if (item.proposed_fixed_monthly_amount == null) {
      return NextResponse.json({ error: "This item has no proposed amount to decide." }, { status: 400 });
    }

    const proposedAmount = Number(item.proposed_fixed_monthly_amount);

    if (body.decision === "approved") {
      const { error: customerError } = await supabase
        .from("customers")
        .update({ fixed_monthly_amount: proposedAmount })
        .eq("id", item.customer_id);
      if (customerError) return NextResponse.json({ error: customerError.message }, { status: 500 });
    }

    const { error: decisionError } = await supabase
      .from("billing_batch_items")
      .update({ proposed_fixed_monthly_decision: body.decision })
      .eq("id", item.id);
    if (decisionError) return NextResponse.json({ error: decisionError.message }, { status: 500 });

    return NextResponse.json({
      ok: true,
      decision: body.decision,
      appliedAmount: body.decision === "approved" ? proposedAmount : undefined,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown server error." },
      { status: 500 }
    );
  }
}
