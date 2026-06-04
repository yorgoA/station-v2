#!/usr/bin/env node
import { readFileSync, writeFileSync, rmSync, mkdirSync } from "fs";
import { resolve, extname } from "path";
import { createClient } from "@supabase/supabase-js";

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const imagePath = get("--image");
  if (!imagePath) throw new Error("Missing --image <path>.");
  return { imagePath };
}

function loadEnv(envPath) {
  const raw = readFileSync(envPath, "utf8");
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    const s = line.trim();
    if (!s || s.startsWith("#")) continue;
    const idx = s.indexOf("=");
    if (idx <= 0) continue;
    const key = s.slice(0, idx).trim();
    const value = s.slice(idx + 1).trim().replace(/^['"]|['"]$/g, "");
    out[key] = value;
  }
  return out;
}

function mimeForExt(filePath) {
  const ext = extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "application/octet-stream";
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function main() {
  const { imagePath } = parseArgs();
  const projectRoot = resolve(process.cwd(), "Station_V2");
  const envPath = resolve(projectRoot, "apps/web/.env.local");
  const snapshotsDir = resolve(projectRoot, ".db-snapshots");
  mkdirSync(snapshotsDir, { recursive: true });

  const env = loadEnv(envPath);
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in Station_V2/apps/web/.env.local");
  }

  const absoluteImagePath = resolve(imagePath);
  const base64 = readFileSync(absoluteImagePath).toString("base64");
  const dataUrl = `data:${mimeForExt(absoluteImagePath)};base64,${base64}`;
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: beforeRows, error: beforeError } = await supabase
    .from("billing_batch_items")
    .select("id,batch_id,customer_id,counter_image_url")
    .like("counter_image_url", "uploads/%")
    .order("id", { ascending: true });
  if (beforeError) throw new Error(beforeError.message);

  const before = beforeRows ?? [];
  const targetIds = before.map((r) => r.id);
  const tag = `${stamp()}-stationv2-backfill-counter-images`;
  const beforePath = resolve(snapshotsDir, `${tag}-before.json`);
  const afterPath = resolve(snapshotsDir, `${tag}-after.json`);
  writeFileSync(beforePath, JSON.stringify(before, null, 2));

  if (targetIds.length === 0) {
    writeFileSync(afterPath, JSON.stringify([], null, 2));
    rmSync(beforePath, { force: true });
    console.log("No billing_batch_items rows found with uploads/* image references.");
    return;
  }

  const { error: updateError } = await supabase
    .from("billing_batch_items")
    .update({ counter_image_url: dataUrl })
    .in("id", targetIds);
  if (updateError) {
    console.error(`Update failed. Before snapshot kept at: ${beforePath}`);
    throw new Error(updateError.message);
  }

  const { data: afterRows, error: afterError } = await supabase
    .from("billing_batch_items")
    .select("id,batch_id,customer_id,counter_image_url")
    .in("id", targetIds)
    .order("id", { ascending: true });
  if (afterError) throw new Error(afterError.message);
  writeFileSync(afterPath, JSON.stringify(afterRows ?? [], null, 2));

  const after = afterRows ?? [];
  const badAfter = after.filter((r) => !String(r.counter_image_url ?? "").startsWith("data:image/"));
  if (after.length !== before.length || badAfter.length > 0) {
    console.error("Verification failed; unexpected after-state detected.");
    console.error(`before: ${beforePath}`);
    console.error(`after:  ${afterPath}`);
    process.exit(2);
  }

  rmSync(beforePath, { force: true });
  console.log(`Updated ${after.length} rows in billing_batch_items.`);
  console.log(`After snapshot: ${afterPath}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
