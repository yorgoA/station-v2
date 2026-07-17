import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "../../../../lib/supabase/server-admin";
import { requireRole } from "../../../../lib/auth/require-role";

type PutBody = {
  monthKey?: string;
  regionCode?: "mrah" | "printania";
  generatorKwh?: number;
};

export async function GET(request: Request) {
  try {
    const auth = await requireRole(["manager"]);
    if ("response" in auth) return auth.response;

    const { searchParams } = new URL(request.url);
    const monthKey = searchParams.get("month");
    const regionCode = searchParams.get("region");
    if (!monthKey || (regionCode !== "mrah" && regionCode !== "printania")) {
      return NextResponse.json({ error: "month and region (mrah|printania) are required." }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const { data: region, error: regionError } = await supabase
      .from("regions")
      .select("id")
      .eq("code", regionCode)
      .maybeSingle();
    if (regionError) return NextResponse.json({ error: regionError.message }, { status: 500 });
    if (!region) return NextResponse.json({ reading: null });

    const { data, error } = await supabase
      .from("generator_monthly_readings")
      .select("generator_kwh, entered_at")
      .eq("month_key", monthKey)
      .eq("region_id", region.id)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      reading: data ? { generatorKwh: Number(data.generator_kwh), enteredAt: data.entered_at } : null
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const auth = await requireRole(["manager"]);
    if ("response" in auth) return auth.response;

    const body = (await request.json()) as PutBody;
    if (!body.monthKey || (body.regionCode !== "mrah" && body.regionCode !== "printania")) {
      return NextResponse.json({ error: "monthKey and regionCode (mrah|printania) are required." }, { status: 400 });
    }
    if (!Number.isFinite(body.generatorKwh) || Number(body.generatorKwh) <= 0) {
      return NextResponse.json({ error: "generatorKwh must be greater than 0." }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const { data: region, error: regionError } = await supabase
      .from("regions")
      .select("id")
      .eq("code", body.regionCode)
      .maybeSingle();
    if (regionError) return NextResponse.json({ error: regionError.message }, { status: 500 });
    if (!region) return NextResponse.json({ error: "Region not found." }, { status: 400 });

    const { error } = await supabase
      .from("generator_monthly_readings")
      .upsert(
        {
          month_key: body.monthKey,
          region_id: region.id,
          generator_kwh: body.generatorKwh,
          entered_by_user_id: auth.actor.appUserId,
          entered_at: new Date().toISOString()
        },
        { onConflict: "month_key,region_id" }
      );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
