import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "../../../../lib/supabase/server-admin";
import { requireRole } from "../../../../lib/auth/require-role";

export async function GET(request: Request) {
  try {
    const auth = await requireRole(["manager", "employee"]);
    if ("response" in auth) return auth.response;

    const { searchParams } = new URL(request.url);
    const month = searchParams.get("month");
    const region = searchParams.get("region");
    const status = searchParams.get("status");

    const supabase = createSupabaseAdminClient();
    let query = supabase
      .from("billing_batches")
      .select("id, month_key, status, manager_note, submitted_at, regions!inner(code)")
      .order("submitted_at", { ascending: false });

    if (month && month !== "all") query = query.eq("month_key", month);
    if (status && status !== "all") query = query.eq("status", status);
    if (region && region !== "all") query = query.eq("regions.code", region);

    const { data: batches, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const readRegion = (value: { code: string } | Array<{ code: string }> | null) => {
      if (Array.isArray(value)) return value[0] ?? null;
      return value;
    };

    const mapped = (batches ?? []).map((row) => ({
      id: row.id,
      monthKey: row.month_key,
      regionCode: readRegion(row.regions as { code: string } | Array<{ code: string }> | null)?.code ?? "unknown",
      status: row.status,
      submittedAt: row.submitted_at,
      managerNote: row.manager_note,
    }));

    return NextResponse.json({ batches: mapped });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown server error." },
      { status: 500 }
    );
  }
}
