import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "../../../../lib/supabase/server-admin";
import { requireRole } from "../../../../lib/auth/require-role";

export async function GET() {
  try {
    const auth = await requireRole(["manager"]);
    if ("response" in auth) return auth.response;

    const supabase = createSupabaseAdminClient();

    const [{ data: tiers, error: tiersError }, { data: tariffs, error: tariffsError }] = await Promise.all([
      supabase.from("ampere_price_tiers").select("amp, price").order("amp", { ascending: true }),
      supabase
        .from("monthly_kwh_tariffs")
        .select("month_key, kwh_price, entered_at")
        .order("month_key", { ascending: false })
    ]);

    if (tiersError) return NextResponse.json({ error: tiersError.message }, { status: 500 });
    if (tariffsError) return NextResponse.json({ error: tariffsError.message }, { status: 500 });

    return NextResponse.json({
      ampereTiers: (tiers ?? []).map((row) => ({ amp: row.amp, price: Number(row.price) })),
      monthlyTariffs: (tariffs ?? []).map((row) => ({
        monthKey: row.month_key,
        kwhPrice: Number(row.kwh_price),
        enteredAt: row.entered_at
      }))
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
