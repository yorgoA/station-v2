import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "../../../../../../lib/supabase/server-admin";
import { requireRole } from "../../../../../../lib/auth/require-role";

type Context = {
  params: { batchId: string };
};

export async function POST(_request: Request, context: Context) {
  try {
    const auth = await requireRole(["manager"]);
    if ("response" in auth) return auth.response;

    const batchId = context.params.batchId;
    const supabase = createSupabaseAdminClient();

    // An employee may have proposed a corrected fixed-monthly amount; the manager
    // must approve or reject each one before the batch is priced, so a bill is
    // never posted with an amount that's still under dispute.
    const { data: undecided, error: undecidedError } = await supabase
      .from("billing_batch_items")
      .select("id")
      .eq("batch_id", batchId)
      .not("proposed_fixed_monthly_amount", "is", null)
      .is("proposed_fixed_monthly_decision", null);
    if (undecidedError) return NextResponse.json({ error: undecidedError.message }, { status: 500 });
    if (undecided && undecided.length > 0) {
      return NextResponse.json(
        {
          error: `Decide the ${undecided.length} pending fixed-monthly change request(s) before approving this batch.`
        },
        { status: 400 }
      );
    }

    // approve_billing_batch() computes real priced bills, snapshots the prices used,
    // and transitions the batch to approved_posted, all in one Postgres transaction.
    // See db/schema.sql / db/migrations/002_billing_pricing.sql.
    const { error } = await supabase.rpc("approve_billing_batch", {
      p_batch_id: batchId,
      p_actor_user_id: auth.actor.appUserId
    });

    if (error) {
      // These are all raised as explicit business-rule exceptions inside the
      // function (missing kWh price, wrong batch status, unpriceable item, etc.)
      // so surface the message as-is rather than a generic 500.
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, status: "approved_posted" });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown server error." },
      { status: 500 }
    );
  }
}
