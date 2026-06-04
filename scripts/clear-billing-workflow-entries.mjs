#!/usr/bin/env node
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";

function loadEnv(filePath) {
  const raw = readFileSync(filePath, "utf8");
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const s = line.trim();
    if (!s || s.startsWith("#")) continue;
    const idx = s.indexOf("=");
    if (idx <= 0) continue;
    env[s.slice(0, idx).trim()] = s.slice(idx + 1).trim().replace(/^['"]|['"]$/g, "");
  }
  return env;
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function countRows(supabase, table) {
  const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
  if (error) throw new Error(`${table}: ${error.message}`);
  return count ?? 0;
}

async function getIds(supabase, table) {
  const { data, error } = await supabase.from(table).select("id");
  if (error) throw new Error(`${table}: ${error.message}`);
  return (data ?? []).map((r) => String(r.id));
}

async function snapshot(supabase) {
  const tables = [
    "billing_batches",
    "billing_batch_items",
    "billing_batch_item_reviews",
    "billing_batch_events",
  ];
  const result = {
    tables: {},
    preserved: {
      customers: await countRows(supabase, "customers"),
      monitors: await countRows(supabase, "monitors"),
    },
  };
  for (const t of tables) {
    result.tables[t] = {
      count: await countRows(supabase, t),
      ids: await getIds(supabase, t),
    };
  }
  return result;
}

async function clearWorkflowEntries(supabase) {
  // Explicit order avoids FK issues when delete cascades are absent.
  for (const table of [
    "billing_batch_item_reviews",
    "billing_batch_events",
    "billing_batch_items",
    "billing_batches",
  ]) {
    const { error } = await supabase.from(table).delete().not("id", "is", null);
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

function verify(before, after) {
  const changedUnexpectedly = [];
  if (before.preserved.customers !== after.preserved.customers) {
    changedUnexpectedly.push("customers count changed");
  }
  if (before.preserved.monitors !== after.preserved.monitors) {
    changedUnexpectedly.push("monitors count changed");
  }

  const workflowTables = [
    "billing_batches",
    "billing_batch_items",
    "billing_batch_item_reviews",
    "billing_batch_events",
  ];
  for (const t of workflowTables) {
    if (after.tables[t].count !== 0) {
      changedUnexpectedly.push(`${t} still has ${after.tables[t].count} rows`);
    }
  }
  return changedUnexpectedly;
}

async function main() {
  const root = resolve(process.cwd(), "Station_V2");
  const envPath = resolve(root, "apps/web/.env.local");
  const snapDir = resolve(root, ".db-snapshots");
  mkdirSync(snapDir, { recursive: true });

  const env = loadEnv(envPath);
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRole) {
    throw new Error("Missing Supabase env in Station_V2/apps/web/.env.local");
  }
  const supabase = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const tag = `${stamp()}-clear-stationv2-billing-workflow`;
  const beforePath = resolve(snapDir, `${tag}-before.json`);
  const afterPath = resolve(snapDir, `${tag}-after.json`);

  const before = await snapshot(supabase);
  writeFileSync(beforePath, JSON.stringify(before, null, 2));

  await clearWorkflowEntries(supabase);

  const after = await snapshot(supabase);
  writeFileSync(afterPath, JSON.stringify(after, null, 2));

  const problems = verify(before, after);
  if (problems.length > 0) {
    console.error("Verification failed:");
    for (const p of problems) console.error(`- ${p}`);
    console.error(`before: ${beforePath}`);
    console.error(`after:  ${afterPath}`);
    process.exit(2);
  }

  rmSync(beforePath, { force: true });
  console.log("Station_V2 billing workflow entries cleared successfully.");
  console.log(`after snapshot: ${afterPath}`);
  console.log(
    `preserved counts -> customers: ${after.preserved.customers}, monitors: ${after.preserved.monitors}`
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
