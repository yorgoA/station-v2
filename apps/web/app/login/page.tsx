"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabasePublicClient } from "../../lib/supabase/browser-public";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createSupabasePublicClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (signInError || !data.user) {
      setError(signInError?.message ?? "Unable to sign in.");
      setLoading(false);
      return;
    }

    const role =
      (data.user.user_metadata?.role as string | undefined) ??
      (data.user.app_metadata?.role as string | undefined) ??
      "employee";

    if (role === "manager") {
      router.push("/manager/dashboard");
    } else if (role === "collector") {
      router.push("/collector/dashboard");
    } else {
      router.push("/employee/dashboard");
    }
    router.refresh();
  }

  return (
    <main className="page" style={{ maxWidth: 420 }}>
      <div className="card">
        <h1>Station V2 Login</h1>
        <p className="muted">Sign in with your Supabase account.</p>
        <form onSubmit={onSubmit}>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ width: "100%", margin: "6px 0 12px" }}
          />

          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ width: "100%", margin: "6px 0 14px" }}
          />

          <button type="submit" disabled={loading} style={{ width: "100%" }}>
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
        {error && <p style={{ color: "var(--danger)", marginTop: 12 }}>{error}</p>}
      </div>
    </main>
  );
}
