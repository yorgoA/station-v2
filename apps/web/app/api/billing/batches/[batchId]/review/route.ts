import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "../../../../../../lib/supabase/server-admin";

type ReviewDecision = {
  rowId: string;
  state: "approved" | "changes_needed";
  note?: string;
};

type ReviewBody = {
  decisions: ReviewDecision[];
};

type Context = {
  params: { batchId: string };
};

async function getOrCreateSystemUserId() {
  const supabase = createSupabaseAdminClient();
  const { data: existing, error: existingError } = await supabase
    .from("app_users")
    .select("id")
    .eq("email", "system.manager@station-v2.local")
    .maybeSingle();

  if (existingError) throw new Error(existingError.message);
  if (existing?.id) return existing.id as string;

  const { data: created, error: createError } = await supabase
    .from("app_users")
    .insert({
      role: "manager",
      display_name: "System Manager",
      email: "system.manager@station-v2.local",
      is_active: true,
    })
    .select("id")
    .single();
  if (createError) throw new Error(createError.message);
  return created.id as string;
}

export async function POST(request: Request, context: Context) {
  try {
    const batchId = context.params.batchId;
    const body = (await request.json()) as ReviewBody;
    if (!Array.isArray(body.decisions) || body.decisions.length === 0) {
      return NextResponse.json({ error: "No review decisions provided." }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const actorUserId = await getOrCreateSystemUserId();
    const { data: existingBatch, error: existingBatchError } = await supabase
      .from("billing_batches")
      .select("id, status")
      .eq("id", batchId)
      .maybeSingle();
    if (existingBatchError) return NextResponse.json({ error: existingBatchError.message }, { status: 500 });
    if (!existingBatch) return NextResponse.json({ error: "Batch not found." }, { status: 404 });
    if (existingBatch.status !== "pending_review") {
      return NextResponse.json(
        { error: `Batch is already ${existingBatch.status} and cannot be modified again.` },
        { status: 409 }
      );
    }

    const hasChanges = body.decisions.some((decision) => decision.state === "changes_needed");
    const note = hasChanges
      ? body.decisions
          .filter((decision) => decision.state === "changes_needed")
          .map((decision) => decision.note?.trim() || "Change requested.")
          .join("\n")
      : "Reviewed and sent back to employee from V2 manager review API.";
    if (hasChanges && note.trim() === "") {
      return NextResponse.json({ error: "Manager note is required for requested changes." }, { status: 400 });
    }

    // This endpoint backs the "Send to Employee" action only.
    const targetStatus = "changes_requested";

    const { data: batchItems, error: batchItemsError } = await supabase
      .from("billing_batch_items")
      .select("id")
      .eq("batch_id", batchId);
    if (batchItemsError) return NextResponse.json({ error: batchItemsError.message }, { status: 500 });
    const itemIdSet = new Set((batchItems ?? []).map((row) => row.id as string));

    const reviewRows = body.decisions
      .filter((decision) => itemIdSet.has(decision.rowId))
      .map((decision) => ({
        batch_id: batchId,
        batch_item_id: decision.rowId,
        decision: decision.state,
        note: decision.note?.trim() || null,
        actor_user_id: actorUserId,
      }));
    if (reviewRows.length > 0) {
      const { error: reviewsError } = await supabase
        .from("billing_batch_item_reviews")
        .upsert(reviewRows, { onConflict: "batch_item_id" });
      if (reviewsError) return NextResponse.json({ error: reviewsError.message }, { status: 500 });
    }

    const { error: updateError } = await supabase
      .from("billing_batches")
      .update({
        status: targetStatus,
        manager_note: note,
        reviewed_by_user_id: actorUserId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", batchId);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

    const { error: eventError } = await supabase.from("billing_batch_events").insert({
      batch_id: batchId,
      to_status: targetStatus,
      actor_user_id: actorUserId,
      note,
    });
    if (eventError) return NextResponse.json({ error: eventError.message }, { status: 500 });

    return NextResponse.json({ ok: true, status: targetStatus });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown server error." },
      { status: 500 }
    );
  }
}
