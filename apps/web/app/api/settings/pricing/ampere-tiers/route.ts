import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "../../../../../lib/supabase/server-admin";
import { requireRole } from "../../../../../lib/auth/require-role";

type AmpereTierInput = { amp: number; price: number };
type PutBody = { tiers: AmpereTierInput[] };

export async function PUT(request: Request) {
  try {
    const auth = await requireRole(["manager"]);
    if ("response" in auth) return auth.response;

    const body = (await request.json()) as PutBody;
    if (!Array.isArray(body.tiers) || body.tiers.length === 0) {
      return NextResponse.json({ error: "tiers must be a non-empty array." }, { status: 400 });
    }

    for (const tier of body.tiers) {
      if (!Number.isFinite(tier.amp) || tier.amp <= 0) {
        return NextResponse.json({ error: `Invalid amp value: ${tier.amp}` }, { status: 400 });
      }
      if (!Number.isFinite(tier.price) || tier.price < 0) {
        return NextResponse.json({ error: `Invalid price for ${tier.amp}A: ${tier.price}` }, { status: 400 });
      }
    }

    const supabase = createSupabaseAdminClient();
    const { error } = await supabase
      .from("ampere_price_tiers")
      .upsert(
        body.tiers.map((tier) => ({ amp: tier.amp, price: tier.price })),
        { onConflict: "amp" }
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
