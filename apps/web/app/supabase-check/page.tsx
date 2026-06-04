import { createSupabaseAdminClient } from "../../lib/supabase/server-admin";

export const dynamic = "force-dynamic";

async function runServerCheck() {
  try {
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.from("regions").select("id").limit(1);
    if (error) {
      return `Connected but query failed: ${error.message}`;
    }
    return "Connection OK. Server query succeeded.";
  } catch (error) {
    return error instanceof Error ? error.message : "Unknown server error.";
  }
}

export default async function SupabaseCheckPage() {
  const result = await runServerCheck();

  return (
    <main className="page">
      <h1>Supabase Connection Check</h1>
      <div className="card">
        <p className="muted">
          Runs a server-side safe read query on <code>regions</code> using the
          service role key.
        </p>
        <p>{result}</p>
      </div>
    </main>
  );
}
