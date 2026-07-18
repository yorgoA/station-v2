import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "../../../../lib/supabase/server-admin";
import { requireRole } from "../../../../lib/auth/require-role";
import { getEntryLockState } from "../../../../lib/billing/entry-window";

type PutBody = {
  monthKey?: string;
  action?: "force_open" | "force_close" | "clear";
};

export async function GET(request: Request) {
  try {
    const auth = await requireRole(["manager", "employee"]);
    if ("response" in auth) return auth.response;

    const { searchParams } = new URL(request.url);
    const monthKey = searchParams.get("month");
    if (!monthKey || !/^\d{4}-\d{2}$/.test(monthKey)) {
      return NextResponse.json({ error: "A valid month (YYYY-MM) is required." }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const state = await getEntryLockState(supabase, monthKey);
    return NextResponse.json(state);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const auth = await requireRole(["manager"]);
    if ("response" in auth) return auth.response;

    const body = (await request.json()) as PutBody;
    if (!body.monthKey || !/^\d{4}-\d{2}$/.test(body.monthKey)) {
      return NextResponse.json({ error: "A valid monthKey (YYYY-MM) is required." }, { status: 400 });
    }
    if (!body.action || !["force_open", "force_close", "clear"].includes(body.action)) {
      return NextResponse.json({ error: "action must be force_open, force_close, or clear." }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();

    if (body.action === "clear") {
      const { error } = await supabase.from("billing_month_locks").delete().eq("month_key", body.monthKey);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    } else {
      const { error } = await supabase.from("billing_month_locks").upsert({
        month_key: body.monthKey,
        override: body.action === "force_open" ? "unlocked" : "locked",
        updated_by_user_id: auth.actor.appUserId,
        updated_at: new Date().toISOString()
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const state = await getEntryLockState(supabase, body.monthKey);
    return NextResponse.json(state);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
