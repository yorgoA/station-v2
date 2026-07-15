import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "../../../../../lib/supabase/server-admin";
import { requireRole } from "../../../../../lib/auth/require-role";

type PutBody = { monthKey: string; kwhPrice: number };

const MONTH_KEY_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export async function PUT(request: Request) {
  try {
    const auth = await requireRole(["manager"]);
    if ("response" in auth) return auth.response;

    const body = (await request.json()) as PutBody;
    if (!body.monthKey || !MONTH_KEY_RE.test(body.monthKey)) {
      return NextResponse.json({ error: "monthKey must be in YYYY-MM format." }, { status: 400 });
    }
    if (!Number.isFinite(body.kwhPrice) || body.kwhPrice <= 0) {
      return NextResponse.json({ error: "kwhPrice must be a positive number." }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const { error } = await supabase
      .from("monthly_kwh_tariffs")
      .upsert(
        {
          month_key: body.monthKey,
          kwh_price: body.kwhPrice,
          entered_by_user_id: auth.actor.appUserId,
          entered_at: new Date().toISOString()
        },
        { onConflict: "month_key" }
      );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
