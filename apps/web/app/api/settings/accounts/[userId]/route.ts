import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "../../../../../lib/supabase/server-admin";
import { requireRole } from "../../../../../lib/auth/require-role";

type PatchBody = {
  fullName?: string;
  role?: "manager" | "employee" | "collector";
  isActive?: boolean;
  newPassword?: string;
};

type Context = { params: { userId: string } };

export async function PATCH(request: Request, context: Context) {
  try {
    const auth = await requireRole(["manager"]);
    if ("response" in auth) return auth.response;

    const targetUserId = context.params.userId;
    const body = (await request.json()) as PatchBody;
    const supabase = createSupabaseAdminClient();

    const { data: targetUser, error: getUserError } = await supabase.auth.admin.getUserById(targetUserId);
    if (getUserError || !targetUser?.user) {
      return NextResponse.json({ error: "Account not found." }, { status: 404 });
    }
    const targetEmail = (targetUser.user.email ?? "").toLowerCase();

    if (targetEmail === auth.actor.email.toLowerCase() && body.isActive === false) {
      return NextResponse.json({ error: "You can't disable your own account." }, { status: 400 });
    }

    if (body.role !== undefined && !["manager", "employee", "collector"].includes(body.role)) {
      return NextResponse.json({ error: "Invalid role." }, { status: 400 });
    }
    if (body.newPassword !== undefined && body.newPassword.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    }

    if (body.role !== undefined || body.newPassword) {
      const { error: updateAuthError } = await supabase.auth.admin.updateUserById(targetUserId, {
        ...(body.role !== undefined ? { user_metadata: { ...targetUser.user.user_metadata, role: body.role } } : {}),
        ...(body.newPassword ? { password: body.newPassword } : {})
      });
      if (updateAuthError) return NextResponse.json({ error: updateAuthError.message }, { status: 400 });
    }

    const appUserPayload: Record<string, unknown> = {};
    if (body.fullName !== undefined) appUserPayload.display_name = body.fullName.trim();
    if (body.role !== undefined) appUserPayload.role = body.role;
    if (body.isActive !== undefined) appUserPayload.is_active = body.isActive;

    if (Object.keys(appUserPayload).length > 0) {
      const { error: appUserError } = await supabase
        .from("app_users")
        .update(appUserPayload)
        .eq("email", targetEmail);
      if (appUserError) return NextResponse.json({ error: appUserError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const auth = await requireRole(["manager"]);
    if ("response" in auth) return auth.response;

    const targetUserId = context.params.userId;
    const supabase = createSupabaseAdminClient();

    const { data: targetUser, error: getUserError } = await supabase.auth.admin.getUserById(targetUserId);
    if (getUserError || !targetUser?.user) {
      return NextResponse.json({ error: "Account not found." }, { status: 404 });
    }
    const targetEmail = (targetUser.user.email ?? "").toLowerCase();

    if (targetEmail === auth.actor.email.toLowerCase()) {
      return NextResponse.json({ error: "You can't delete your own account." }, { status: 400 });
    }

    // Deactivate in app_users first (never hard-delete the row -- it's referenced by
    // FK from billing_batches/payments/etc. as an audit trail of who approved/recorded what).
    const { error: appUserError } = await supabase
      .from("app_users")
      .update({ is_active: false })
      .eq("email", targetEmail);
    if (appUserError) return NextResponse.json({ error: appUserError.message }, { status: 500 });

    const { error: deleteAuthError } = await supabase.auth.admin.deleteUser(targetUserId);
    if (deleteAuthError) return NextResponse.json({ error: deleteAuthError.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
