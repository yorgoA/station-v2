import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "../../../../lib/supabase/server-admin";
import { requireRole } from "../../../../lib/auth/require-role";
import { monthKeyFromDate } from "../../../../lib/constants/months";

/**
 * Months that should actually show up in month filters/pickers across the app:
 * the real current month (so entry/creation flows always have somewhere to
 * point), plus every month that has real billing_batches or bills data. No
 * arbitrary rolling window, and never future months beyond the current one --
 * a month only becomes selectable once there's a reason to select it.
 */
export async function GET() {
  try {
    const auth = await requireRole(["manager", "employee", "collector"]);
    if ("response" in auth) return auth.response;

    const supabase = createSupabaseAdminClient();
    const [batchesRes, billsRes] = await Promise.all([
      supabase.from("billing_batches").select("month_key"),
      supabase.from("bills").select("month_key")
    ]);
    if (batchesRes.error) return NextResponse.json({ error: batchesRes.error.message }, { status: 500 });
    if (billsRes.error) return NextResponse.json({ error: billsRes.error.message }, { status: 500 });

    const months = new Set<string>([monthKeyFromDate(new Date())]);
    for (const row of batchesRes.data ?? []) months.add(row.month_key as string);
    for (const row of billsRes.data ?? []) months.add(row.month_key as string);

    const sorted = Array.from(months).sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
    return NextResponse.json({ months: sorted });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
