import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "../../../../lib/supabase/server-admin";
import { requireRole } from "../../../../lib/auth/require-role";

type CreateAccountBody = {
  fullName: string;
  email: string;
  role: "manager" | "employee" | "collector";
  password: string;
};

export async function GET() {
  try {
    const auth = await requireRole(["manager"]);
    if ("response" in auth) return auth.response;

    const supabase = createSupabaseAdminClient();
    const [{ data: authUsers, error: authError }, { data: appUsers, error: appUsersError }] = await Promise.all([
      supabase.auth.admin.listUsers({ perPage: 200 }),
      supabase.from("app_users").select("email, display_name, role, is_active")
    ]);
    if (authError) return NextResponse.json({ error: authError.message }, { status: 500 });
    if (appUsersError) return NextResponse.json({ error: appUsersError.message }, { status: 500 });

    const appUserByEmail = new Map(
      (appUsers ?? []).map((row) => [String(row.email ?? "").toLowerCase(), row])
    );

    const accounts = (authUsers?.users ?? []).map((user) => {
      const appUser = appUserByEmail.get(String(user.email ?? "").toLowerCase());
      const role =
        (user.user_metadata?.role as string | undefined) ??
        (user.app_metadata?.role as string | undefined) ??
        appUser?.role ??
        "employee";
      return {
        id: user.id,
        email: user.email ?? "",
        displayName: appUser?.display_name ?? user.email ?? "",
        role,
        isActive: appUser?.is_active ?? true,
        createdAt: user.created_at
      };
    });

    return NextResponse.json({ accounts });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireRole(["manager"]);
    if ("response" in auth) return auth.response;

    const body = (await request.json()) as CreateAccountBody;
    if (!body.fullName?.trim() || !body.email?.trim()) {
      return NextResponse.json({ error: "fullName and email are required." }, { status: 400 });
    }
    if (!["manager", "employee", "collector"].includes(body.role)) {
      return NextResponse.json({ error: "Invalid role." }, { status: 400 });
    }
    if (!body.password || body.password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const email = body.email.trim().toLowerCase();

    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email,
      password: body.password,
      email_confirm: true,
      user_metadata: { role: body.role }
    });
    if (createError) return NextResponse.json({ error: createError.message }, { status: 400 });

    const { error: appUserError } = await supabase.from("app_users").insert({
      role: body.role,
      display_name: body.fullName.trim(),
      email,
      is_active: true
    });
    if (appUserError) {
      // Roll back the auth user so we don't end up with a login-capable account
      // that the app can never resolve an actor for.
      await supabase.auth.admin.deleteUser(created.user.id);
      return NextResponse.json({ error: appUserError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, id: created.user.id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
