import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "../../../../lib/supabase/server-admin";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get("month");
    if (!month) {
      return NextResponse.json({ error: "month query param is required." }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("billing_batch_item_reviews")
      .select("decision, billing_batches!inner(month_key, regions!inner(code))")
      .eq("decision", "changes_needed")
      .eq("billing_batches.month_key", month);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const readRegion = (value: { code: string } | Array<{ code: string }> | null | undefined) => {
      if (Array.isArray(value)) return value[0] ?? null;
      return value ?? null;
    };
    const readBatch = (
      value:
        | { month_key: string; regions?: { code: string } | Array<{ code: string }> | null }
        | Array<{ month_key: string; regions?: { code: string } | Array<{ code: string }> | null }>
        | null
        | undefined
    ) => {
      if (Array.isArray(value)) return value[0] ?? null;
      return value ?? null;
    };

    const counter = new Map<string, number>();
    for (const row of data ?? []) {
      const batch = readBatch(
        row.billing_batches as
          | { month_key: string; regions?: { code: string } | Array<{ code: string }> | null }
          | Array<{ month_key: string; regions?: { code: string } | Array<{ code: string }> | null }>
          | null
      );
      const regionCode = readRegion(batch?.regions)?.code;
      const monthKey = batch?.month_key;
      if (!regionCode || !monthKey) continue;
      const periodKey = `${monthKey}|${regionCode}`;
      counter.set(periodKey, (counter.get(periodKey) ?? 0) + 1);
    }

    return NextResponse.json({
      rowsToCorrectByPeriod: Object.fromEntries(counter),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown server error." },
      { status: 500 }
    );
  }
}
