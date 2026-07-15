import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "../../../../../lib/supabase/server-admin";
import { requireRole } from "../../../../../lib/auth/require-role";

type Context = {
  params: { batchId: string };
};

export async function GET(_request: Request, context: Context) {
  try {
    const auth = await requireRole(["manager", "employee"]);
    if ("response" in auth) return auth.response;

    const { searchParams } = new URL(_request.url);
    const includeImages = searchParams.get("includeImages") !== "0";
    const batchId = context.params.batchId;
    const supabase = createSupabaseAdminClient();

    const { data: batch, error: batchError } = await supabase
      .from("billing_batches")
      .select("id, month_key, status, manager_note, submitted_at, regions!inner(code)")
      .eq("id", batchId)
      .maybeSingle();
    if (batchError) return NextResponse.json({ error: batchError.message }, { status: 500 });
    if (!batch) return NextResponse.json({ error: "Batch not found." }, { status: 404 });

    // Always select counter_image_url (it's just a URL string, not the image itself) —
    // `includeImages` only controls whether it's included in the response below. Using
    // one literal select string (rather than a variable) keeps Supabase's generated
    // types accurate; a non-literal select falls back to an untyped parser error.
    const { data: items, error: itemsError } = await supabase
      .from("billing_batch_items")
      .select("id, previous_counter, new_counter, counter_image_url, customers!inner(customer_number, full_name)")
      .eq("batch_id", batchId);
    if (itemsError) return NextResponse.json({ error: itemsError.message }, { status: 500 });

    const { data: reviews, error: reviewsError } = await supabase
      .from("billing_batch_item_reviews")
      .select("batch_item_id, decision, note")
      .eq("batch_id", batchId);
    if (reviewsError) return NextResponse.json({ error: reviewsError.message }, { status: 500 });
    const reviewByItemId = new Map(
      (reviews ?? []).map((row) => [
        row.batch_item_id as string,
        { decision: row.decision as "approved" | "changes_needed", note: row.note as string | null },
      ])
    );

    const readCustomer = (
      value: { customer_number: string; full_name: string } | Array<{ customer_number: string; full_name: string }> | null
    ) => {
      if (Array.isArray(value)) return value[0] ?? null;
      return value;
    };
    const readRegion = (value: { code: string } | Array<{ code: string }> | null) => {
      if (Array.isArray(value)) return value[0] ?? null;
      return value;
    };
    const parseEmployeeChanges = (note?: string | null) => {
      const raw = String(note ?? "");
      const marker = "EMPLOYEE_CHANGES:";
      const idx = raw.indexOf(marker);
      if (idx < 0) return [] as Array<{ customerNumber: string; summary: string }>;
      const jsonPart = raw.slice(idx + marker.length).trim();
      try {
        const parsed = JSON.parse(jsonPart) as Array<{ customerNumber: string; summary: string }>;
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((row) => row && row.customerNumber && row.summary);
      } catch {
        return [];
      }
    };
    const { data: events } = await supabase
      .from("billing_batch_events")
      .select("note, to_status")
      .eq("batch_id", batchId)
      .eq("to_status", "pending_review");
    const employeeChangeByCustomerNumber = new Map<string, string>();
    for (const event of events ?? []) {
      for (const change of parseEmployeeChanges(event.note as string | null | undefined)) {
        employeeChangeByCustomerNumber.set(
          String(change.customerNumber).trim().toLowerCase(),
          String(change.summary)
        );
      }
    }

    const mappedItems = (items ?? []).map((row) => {
      const customer = readCustomer(
        row.customers as
          | { customer_number: string; full_name: string }
          | Array<{ customer_number: string; full_name: string }>
          | null
      );
      return {
        id: row.id,
        customerNumber: customer?.customer_number ?? "",
        customerName: customer?.full_name ?? "",
        previousCounter: row.previous_counter,
        newCounter: row.new_counter,
        counterImageName: includeImages ? row.counter_image_url : undefined,
        reviewState: reviewByItemId.get(row.id)?.decision,
        reviewNote: reviewByItemId.get(row.id)?.note ?? undefined,
        employeeChangeSummary: employeeChangeByCustomerNumber.get(
          String(customer?.customer_number ?? "").trim().toLowerCase()
        ),
      };
    });

    return NextResponse.json({
      batch: {
        id: batch.id,
        monthKey: batch.month_key,
        regionCode: readRegion(batch.regions as { code: string } | Array<{ code: string }> | null)?.code ?? "unknown",
        status: batch.status,
        managerNote: batch.manager_note,
        submittedAt: batch.submitted_at,
      },
      items: mappedItems,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown server error." },
      { status: 500 }
    );
  }
}
