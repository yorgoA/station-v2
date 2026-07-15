import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "../../../../lib/supabase/server-admin";
import { requireRole } from "../../../../lib/auth/require-role";

type SubmissionRowInput = {
  customerNumber: string;
  customerName: string;
  billingType: "metered" | "amp-only" | "both" | "fixed-monthly";
  previousCounter: number;
  newCounter?: number;
  isFreeCustomer?: boolean;
  counterImageName?: string;
  counterImageDataUrl?: string;
  previousSubmittedNewCounter?: number;
  previousSubmittedCounterImageName?: string;
};

type SubmissionBody = {
  monthKey: string;
  regionCode: string;
  rows: SubmissionRowInput[];
};

export async function POST(request: Request) {
  try {
    const auth = await requireRole(["manager", "employee"]);
    if ("response" in auth) return auth.response;

    const body = (await request.json()) as SubmissionBody;
    if (!body.monthKey || !body.regionCode || !Array.isArray(body.rows) || body.rows.length === 0) {
      return NextResponse.json({ error: "Invalid submission payload." }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const actorUserId = auth.actor.appUserId;

    const { data: region, error: regionError } = await supabase
      .from("regions")
      .select("id, code")
      .eq("code", body.regionCode)
      .maybeSingle();
    if (regionError) return NextResponse.json({ error: regionError.message }, { status: 500 });
    if (!region) return NextResponse.json({ error: `Region '${body.regionCode}' not found.` }, { status: 400 });

    const { data: existingBatch, error: existingBatchError } = await supabase
      .from("billing_batches")
      .select("id, status")
      .eq("month_key", body.monthKey)
      .eq("region_id", region.id)
      .maybeSingle();
    if (existingBatchError) return NextResponse.json({ error: existingBatchError.message }, { status: 500 });
    if (existingBatch?.status === "approved_posted") {
      return NextResponse.json({ error: "This batch is already approved and immutable." }, { status: 409 });
    }

    const batchPayload = {
      month_key: body.monthKey,
      region_id: region.id,
      status: "pending_review" as const,
      submitted_by_user_id: actorUserId,
      submitted_at: new Date().toISOString(),
    };

    const { data: batch, error: batchError } = await supabase
      .from("billing_batches")
      .upsert(batchPayload, { onConflict: "month_key,region_id" })
      .select("id")
      .single();
    if (batchError) return NextResponse.json({ error: batchError.message }, { status: 500 });

    const { data: billingTypes, error: billingTypesError } = await supabase
      .from("billing_types")
      .select("id, key");
    if (billingTypesError) return NextResponse.json({ error: billingTypesError.message }, { status: 500 });
    const billingTypeByKey = new Map((billingTypes ?? []).map((row) => [row.key as string, row.id as string]));

    const employeeChangeSummaries: Array<{ customerNumber: string; summary: string }> = [];
    for (const row of body.rows) {
      if (row.newCounter === undefined || row.newCounter < row.previousCounter || !row.counterImageName) {
        return NextResponse.json(
          { error: `Row '${row.customerNumber || row.customerName}' has invalid counters/image.` },
          { status: 400 }
        );
      }

      const { data: existingCustomer, error: existingCustomerError } = await supabase
        .from("customers")
        .select("id")
        .eq("customer_number", row.customerNumber)
        .maybeSingle();
      if (existingCustomerError) return NextResponse.json({ error: existingCustomerError.message }, { status: 500 });

      let customerId = existingCustomer?.id as string | undefined;
      if (!customerId) {
        const { data: createdCustomer, error: createdCustomerError } = await supabase
          .from("customers")
          .insert({
            customer_number: row.customerNumber,
            full_name: row.customerName || row.customerNumber,
            region_id: region.id,
            billing_type_id: billingTypeByKey.get(row.billingType) ?? null,
            is_free_customer: Boolean(row.isFreeCustomer),
            status: "active",
          })
          .select("id")
          .single();
        if (createdCustomerError) {
          return NextResponse.json({ error: createdCustomerError.message }, { status: 500 });
        }
        customerId = createdCustomer.id as string;
      }

      const calculatedAmount = Math.max(row.newCounter - row.previousCounter, 0);
      const inlineImageFromName =
        typeof row.counterImageName === "string" && row.counterImageName.startsWith("data:image/")
          ? row.counterImageName
          : undefined;
      const storedCounterImageUrl =
        typeof row.counterImageDataUrl === "string" && row.counterImageDataUrl.startsWith("data:image/")
          ? row.counterImageDataUrl
          : inlineImageFromName
            ? inlineImageFromName
            : `uploads/${row.counterImageName}`;
      const counterChanged =
        typeof row.previousSubmittedNewCounter === "number" && row.previousSubmittedNewCounter !== row.newCounter;
      const imageChanged =
        typeof row.previousSubmittedCounterImageName === "string" &&
        row.previousSubmittedCounterImageName.trim() !== "" &&
        row.previousSubmittedCounterImageName !== row.counterImageName;
      if (counterChanged || imageChanged) {
        const parts: string[] = [];
        if (counterChanged) {
          parts.push(`counter ${row.previousSubmittedNewCounter} -> ${row.newCounter}`);
        }
        if (imageChanged) {
          parts.push("image replaced");
        }
        employeeChangeSummaries.push({
          customerNumber: row.customerNumber,
          summary: parts.join("; "),
        });
      }
      const { error: itemError } = await supabase.from("billing_batch_items").upsert(
        {
          batch_id: batch.id,
          customer_id: customerId,
          previous_counter: row.previousCounter,
          new_counter: row.newCounter,
          consumption_kwh: Math.max(row.newCounter - row.previousCounter, 0),
          calculated_amount: calculatedAmount,
          billing_type_id_snapshot: billingTypeByKey.get(row.billingType) ?? null,
          is_free_customer_snapshot: Boolean(row.isFreeCustomer),
          counter_image_url: storedCounterImageUrl,
        },
        { onConflict: "batch_id,customer_id" }
      );
      if (itemError) return NextResponse.json({ error: itemError.message }, { status: 500 });
    }

    const changesNote =
      employeeChangeSummaries.length > 0
        ? `\nEMPLOYEE_CHANGES:${JSON.stringify(employeeChangeSummaries)}`
        : "";
    const { error: eventError } = await supabase.from("billing_batch_events").insert({
      batch_id: batch.id,
      from_status: existingBatch?.status ?? "draft",
      to_status: "pending_review",
      actor_user_id: actorUserId,
      note: `Submitted from V2 billing entry API${changesNote}`,
    });
    if (eventError) return NextResponse.json({ error: eventError.message }, { status: 500 });

    return NextResponse.json({ ok: true, batchId: batch.id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown server error." },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    const auth = await requireRole(["manager", "employee"]);
    if ("response" in auth) return auth.response;

    const { searchParams } = new URL(request.url);
    const monthKey = searchParams.get("month");
    const regionCode = searchParams.get("region");
    if (!monthKey || !regionCode) {
      return NextResponse.json({ error: "month and region query params are required." }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const { data: region, error: regionError } = await supabase
      .from("regions")
      .select("id")
      .eq("code", regionCode)
      .maybeSingle();
    if (regionError) return NextResponse.json({ error: regionError.message }, { status: 500 });
    if (!region) return NextResponse.json({ rows: [] });

    const { data: batch, error: batchError } = await supabase
      .from("billing_batches")
      .select("id, status")
      .eq("month_key", monthKey)
      .eq("region_id", region.id)
      .maybeSingle();
    if (batchError) return NextResponse.json({ error: batchError.message }, { status: 500 });
    if (!batch) return NextResponse.json({ rows: [], status: "draft" });

    const { data: items, error: itemsError } = await supabase
      .from("billing_batch_items")
      .select("id, previous_counter, new_counter, counter_image_url, customers!inner(customer_number, full_name)")
      .eq("batch_id", batch.id);
    if (itemsError) return NextResponse.json({ error: itemsError.message }, { status: 500 });

    const readCustomer = (
      value: { customer_number: string; full_name: string } | Array<{ customer_number: string; full_name: string }> | null
    ) => {
      if (Array.isArray(value)) return value[0] ?? null;
      return value;
    };

    const rows = (items ?? []).map((row) => {
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
        counterImageName: row.counter_image_url,
      };
    });

    return NextResponse.json({ rows, status: batch.status });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown server error." },
      { status: 500 }
    );
  }
}
