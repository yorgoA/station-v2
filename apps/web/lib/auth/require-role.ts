import { NextResponse } from "next/server";
import { getSessionUser, type SessionRole } from "../supabase/server-session";
import { createSupabaseAdminClient } from "../supabase/server-admin";

export type AuthorizedActor = {
  authUserId: string;
  email: string;
  role: SessionRole;
  /** app_users.id — use this for actor_user_id / reviewed_by_user_id / entered_by_user_id columns. */
  appUserId: string;
};

export type RequireRoleResult = { actor: AuthorizedActor } | { response: NextResponse };

/**
 * Validates the caller's Supabase session, checks their role, and resolves
 * their app_users row (matched by email) so callers get a real actor id
 * instead of the placeholder "system.manager" used before real auth existed.
 *
 * Usage:
 *   const auth = await requireRole(["manager"]);
 *   if ("response" in auth) return auth.response;
 *   const { actor } = auth;
 */
export async function requireRole(allowedRoles: SessionRole[]): Promise<RequireRoleResult> {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return { response: NextResponse.json({ error: "Not authenticated." }, { status: 401 }) };
  }
  if (!allowedRoles.includes(sessionUser.role)) {
    return {
      response: NextResponse.json(
        { error: `This action requires role: ${allowedRoles.join(" or ")}.` },
        { status: 403 }
      )
    };
  }

  const supabase = createSupabaseAdminClient();
  const { data: appUser, error } = await supabase
    .from("app_users")
    .select("id, is_active")
    .eq("email", sessionUser.email)
    .maybeSingle();
  if (error) {
    return { response: NextResponse.json({ error: error.message }, { status: 500 }) };
  }
  if (!appUser) {
    return {
      response: NextResponse.json(
        {
          error: `No app_users record found for ${sessionUser.email}. Ask a manager to add your account in Settings -> Accounts.`
        },
        { status: 403 }
      )
    };
  }
  if (!appUser.is_active) {
    return {
      response: NextResponse.json(
        { error: "This account has been disabled. Contact a manager." },
        { status: 403 }
      )
    };
  }

  return { actor: { ...sessionUser, appUserId: appUser.id as string } };
}
