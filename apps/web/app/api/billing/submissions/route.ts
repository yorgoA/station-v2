import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "../../../../lib/supabase/server-admin";
import { requireRole } from "../../../../lib/auth/require-role";
import { getEntryLockState } from "../../../../lib/billing/entry-window";
import { billingTypeNeedsMeterReading } from "../../../../lib/billing/billing-types";
import { formatNumber } from "../../../../lib/format";

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
  /** Current standing fixed-monthly amount as shown to the employee. */
  fixedMonthlyAmount?: number;
  /** Employee-proposed corrected fixed-monthly amount; omitted = no proposal. */
  proposedFixedMonthlyAmount?: number;
  proposedFixedMonthlyNote?: string;
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

    // Managers can always submit/correct. Employees are gated by the entry-window
    // lock (only enforced client-side before this -- an employee could otherwise
    // bypass the UI's lock banner with a raw API call). The one carve-out: a
    // batch the manager has sent back for changes is always re-submittable by
    // the employee, even after its calendar window has closed -- otherwise a
    // late "changes requested" would strand the batch with no way to fix it.
    if (auth.actor.role === "employee" && existingBatch?.status !== "changes_requested") {
      const lockState = await getEntryLockState(supabase, body.monthKey);
      if (!lockState.isOpen) {
        return NextResponse.json(
          {
            error: `${body.monthKey} is closed for entry (window ${lockState.unlockDateLabel} to ${lockState.lockDateLabel}).`
          },
          { status: 403 }
        );
      }
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
      // Flat-charge customers (fixed-monthly / amp-only) bill the same amount
      // every month, so no counter reading or photo is entered for them. Only
      // consumption-based rows (metered / both) carry a reading to validate.
      const rowNeedsMeter = billingTypeNeedsMeterReading(row.billingType);
      if (
        rowNeedsMeter &&
        (row.newCounter === undefined || row.newCounter < row.previousCounter || !row.counterImageName)
      ) {
        return NextResponse.json(
          { error: `Row '${row.customerNumber || row.customerName}' has invalid counters/image.` },
          { status: 400 }
        );
      }

      const previousCounterValue = Number.isFinite(row.previousCounter) ? row.previousCounter : 0;
      // For a flat-charge row the meter doesn't move: store new = previous so the
      // DB's `new_counter >= previous_counter` check holds and consumption is 0.
      const newCounterValue = rowNeedsMeter ? (row.newCounter as number) : previousCounterValue;
      const consumptionKwh = Math.max(newCounterValue - previousCounterValue, 0);

      // Employee-proposed correction to a fixed-monthly customer's amount. Only
      // meaningful for fixed-monthly; a value equal to the current amount is
      // treated as "no proposal". Every (re)submit clears the manager decision.
      const proposedRaw = Number(row.proposedFixedMonthlyAmount);
      const currentFixedAmount = Number(row.fixedMonthlyAmount);
      const hasProposal =
        row.billingType === "fixed-monthly" &&
        Number.isFinite(proposedRaw) &&
        proposedRaw > 0 &&
        !(Number.isFinite(currentFixedAmount) && proposedRaw === currentFixedAmount);
      if (
        row.billingType === "fixed-monthly" &&
        row.proposedFixedMonthlyAmount !== undefined &&
        row.proposedFixedMonthlyAmount !== null &&
        (!Number.isFinite(proposedRaw) || proposedRaw <= 0)
      ) {
        return NextResponse.json(
          { error: `Proposed fixed-monthly amount for '${row.customerNumber || row.customerName}' must be a positive number.` },
          { status: 400 }
        );
      }
      const proposedFixedMonthlyAmount = hasProposal ? proposedRaw : null;
      const proposedFixedMonthlyNote =
        hasProposal && typeof row.proposedFixedMonthlyNote === "string" && row.proposedFixedMonthlyNote.trim()
          ? row.proposedFixedMonthlyNote.trim().slice(0, 500)
          : null;

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

      const calculatedAmount = consumptionKwh;
      const inlineImageFromName =
        typeof row.counterImageName === "string" && row.counterImageName.startsWith("data:image/")
          ? row.counterImageName
          : undefined;
      const storedCounterImageUrl = !rowNeedsMeter
        ? null
        : typeof row.counterImageDataUrl === "string" && row.counterImageDataUrl.startsWith("data:image/")
          ? row.counterImageDataUrl
          : inlineImageFromName
            ? inlineImageFromName
            : `uploads/${row.counterImageName}`;
      const counterChanged =
        rowNeedsMeter &&
        typeof row.previousSubmittedNewCounter === "number" &&
        row.previousSubmittedNewCounter !== row.newCounter;
      const imageChanged =
        rowNeedsMeter &&
        typeof row.previousSubmittedCounterImageName === "string" &&
        row.previousSubmittedCounterImageName.trim() !== "" &&
        row.previousSubmittedCounterImageName !== row.counterImageName;
      if (counterChanged || imageChanged || proposedFixedMonthlyAmount !== null) {
        const parts: string[] = [];
        if (counterChanged) {
          parts.push(`counter ${row.previousSubmittedNewCounter} -> ${row.newCounter}`);
        }
        if (imageChanged) {
          parts.push("image replaced");
        }
        if (proposedFixedMonthlyAmount !== null) {
          parts.push(
            `proposed fixed monthly ${Number.isFinite(currentFixedAmount) ? formatNumber(currentFixedAmount) : "?"} -> ${formatNumber(proposedFixedMonthlyAmount)} LBP`
          );
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
          previous_counter: previousCounterValue,
          new_counter: newCounterValue,
          consumption_kwh: consumptionKwh,
          calculated_amount: calculatedAmount,
          billing_type_id_snapshot: billingTypeByKey.get(row.billingType) ?? null,
          is_free_customer_snapshot: Boolean(row.isFreeCustomer),
          counter_image_url: storedCounterImageUrl,
          proposed_fixed_monthly_amount: proposedFixedMonthlyAmount,
          proposed_fixed_monthly_note: proposedFixedMonthlyNote,
          // Every (re)submit resets the manager's decision -- they re-decide
          // against whatever the customer's amount is at review time.
          proposed_fixed_monthly_decision: null,
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
      .select(
        "id, previous_counter, new_counter, counter_image_url, proposed_fixed_monthly_amount, proposed_fixed_monthly_note, customers!inner(customer_number, full_name)"
      )
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
        proposedFixedMonthlyAmount:
          row.proposed_fixed_monthly_amount != null ? Number(row.proposed_fixed_monthly_amount) : undefined,
        proposedFixedMonthlyNote: row.proposed_fixed_monthly_note ?? undefined,
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
