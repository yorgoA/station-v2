import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export type SessionRole = "manager" | "employee" | "collector";

export type SessionUser = {
  authUserId: string;
  email: string;
  role: SessionRole;
};

/** Route-handler-scoped Supabase client that reads the caller's auth cookies. */
function createSupabaseRouteClient() {
  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error(
      "Missing Supabase public env vars. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY."
    );
  }
  const cookieStore = cookies();
  return createServerClient(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
      }
    }
  });
}

/**
 * Validates the caller's session against Supabase auth (not just trusting the
 * cookie) and resolves their role the same way the client-side AppShell does.
 * Returns null if there's no valid session.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = createSupabaseRouteClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  const role =
    (data.user.user_metadata?.role as SessionRole | undefined) ??
    (data.user.app_metadata?.role as SessionRole | undefined) ??
    "employee";

  return { authUserId: data.user.id, email: data.user.email ?? "", role };
}
