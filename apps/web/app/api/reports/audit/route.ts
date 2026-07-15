import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "../../../../lib/supabase/server-admin";
import { requireRole } from "../../../../lib/auth/require-role";

type RegionCode = "mrah" | "printania";

function normalizeRegion(value: string | null): "all" | RegionCode {
  if (value === "mrah" || value === "printania") return value;
  return "all";
}

export async function GET(request: Request) {
  try {
    const auth = await requireRole(["manager"]);
    if ("response" in auth) return auth.response;

    const { searchParams } = new URL(request.url);
    const monthKey = searchParams.get("month");
    const region = normalizeRegion(searchParams.get("region"));

    const supabase = createSupabaseAdminClient();

    let eventsQuery = supabase
      .from("billing_batch_events")
      .select(
        "id, from_status, to_status, note, created_at, billing_batches!inner(month_key, regions!inner(code)), app_users(display_name, email)"
      )
      .order("created_at", { ascending: false });

    if (monthKey && monthKey !== "all") {
      eventsQuery = eventsQuery.eq("billing_batches.month_key", monthKey);
    }
    if (region !== "all") {
      eventsQuery = eventsQuery.eq("billing_batches.regions.code", region);
    }

    const { data: events, error: eventsError } = await eventsQuery;
    if (eventsError) return NextResponse.json({ error: eventsError.message }, { status: 500 });

    const readOne = <T,>(value: T | T[] | null): T | null => (Array.isArray(value) ? value[0] ?? null : value);

    const rows = (events ?? []).map((row) => {
      const batch = readOne(
        row.billing_batches as
          | { month_key: string; regions?: { code: string } | Array<{ code: string }> | null }
          | Array<{ month_key: string; regions?: { code: string } | Array<{ code: string }> | null }>
          | null
      );
      const regionInfo = readOne(batch?.regions ?? null);
      const actor = readOne(
        row.app_users as { display_name: string; email: string } | Array<{ display_name: string; email: string }> | null
      );

      return {
        id: row.id,
        monthKey: batch?.month_key ?? "",
        region: (regionInfo?.code as RegionCode | undefined) ?? "mrah",
        fromStatus: row.from_status,
        toStatus: row.to_status,
        actorName: actor?.display_name ?? actor?.email ?? "System",
        note: row.note ?? "",
        createdAt: row.created_at
      };
    });

    const approvals = rows.filter((row) => row.toStatus === "approved_posted").length;
    const rejections = rows.filter((row) => row.toStatus === "changes_requested").length;
    const uniqueBatches = new Set(rows.map((row) => `${row.monthKey}|${row.region}`)).size;

    return NextResponse.json({
      events: rows,
      summary: { totalEvents: rows.length, approvals, rejections, uniqueBatches }
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown server error." },
      { status: 500 }
    );
  }
}
