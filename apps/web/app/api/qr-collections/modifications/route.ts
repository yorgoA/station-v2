import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "../../../../lib/supabase/server-admin";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get("month");
    const region = searchParams.get("region");

    const supabase = createSupabaseAdminClient();
    let query = supabase
      .from("qr_collection_logs")
      .select(
        "id, customer_name, customer_number, month_key, collected_amount, currency, modification_reason, scanned_at, validated_by_employee_at, regions!inner(code)"
      )
      .eq("modified_by_employee", true)
      .order("validated_by_employee_at", { ascending: false });

    if (month && month !== "all") query = query.eq("month_key", month);
    if (region && region !== "all") query = query.eq("regions.code", region);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const readRegion = (value: { code: string } | Array<{ code: string }> | null) => {
      if (Array.isArray(value)) return value[0] ?? null;
      return value;
    };

    const tickets = (data ?? []).map((row) => ({
      id: row.id,
      customerName: row.customer_name,
      customerNumber: row.customer_number,
      monthKey: row.month_key,
      collectedAmount: Number(row.collected_amount),
      currency: row.currency ?? "LBP",
      reason: row.modification_reason ?? "",
      region: readRegion(row.regions as { code: string } | Array<{ code: string }> | null)?.code ?? "mrah",
      modifiedAt: row.validated_by_employee_at ?? row.scanned_at,
    }));

    return NextResponse.json({ tickets });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown server error." },
      { status: 500 }
    );
  }
}
