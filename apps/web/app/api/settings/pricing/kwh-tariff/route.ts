import { NextResponse } from "next/server";
import { serverError } from "../../../../../lib/api/server-error";
import { createSupabaseAdminClient } from "../../../../../lib/supabase/server-admin";
import { requireRole } from "../../../../../lib/auth/require-role";

type PutBody = { monthKey: string; kwhPrice: number; usdRate?: number | null };

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
    // usdRate is optional (LBP per 1 USD, for the printed bill). Only touched when
    // the key is present: a positive number sets it, an explicit null clears it,
    // omitting it entirely leaves whatever is already stored for the month.
    const usdRateProvided = Object.prototype.hasOwnProperty.call(body, "usdRate");
    if (
      usdRateProvided &&
      body.usdRate !== null &&
      (!Number.isFinite(body.usdRate as number) || (body.usdRate as number) <= 0)
    ) {
      return NextResponse.json({ error: "usdRate must be a positive number." }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const payload: Record<string, unknown> = {
      month_key: body.monthKey,
      kwh_price: body.kwhPrice,
      entered_by_user_id: auth.actor.appUserId,
      entered_at: new Date().toISOString()
    };
    if (usdRateProvided) payload.usd_rate = body.usdRate ?? null;

    const { error } = await supabase
      .from("monthly_kwh_tariffs")
      .upsert(payload, { onConflict: "month_key" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverError(error);
  }
}
