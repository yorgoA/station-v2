import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "../../../lib/supabase/server-admin";
import { requireRole } from "../../../lib/auth/require-role";

type CreateQrCollectionBody = {
  customerId: string;
  customerNumber: string;
  customerName: string;
  regionCode: "mrah" | "printania";
  monthKey: string;
  collectedAmount: number;
  currency: "LBP" | "USD";
  billScanImageName?: string;
  employeeReceiptImageName?: string;
};

export async function GET(request: Request) {
  try {
    const auth = await requireRole(["manager", "employee", "collector"]);
    if ("response" in auth) return auth.response;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const region = searchParams.get("region");
    const month = searchParams.get("month");
    const supabase = createSupabaseAdminClient();

    let query = supabase
      .from("qr_collection_logs")
      .select("id, customer_id, customer_number, customer_name, month_key, collected_amount, currency, status, bill_scan_image_name, employee_receipt_image_name, modification_reason, modified_by_employee, validated_by_employee_at, scanned_at, regions!inner(code)")
      .order("scanned_at", { ascending: false });

    if (status && status !== "all") query = query.eq("status", status);
    if (month && month !== "all") query = query.eq("month_key", month);
    if (region && region !== "all") query = query.eq("regions.code", region);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const readRegion = (value: { code: string } | Array<{ code: string }> | null) => {
      if (Array.isArray(value)) return value[0] ?? null;
      return value;
    };

    const rows = (data ?? []).map((row) => ({
      id: row.id,
      customerId: row.customer_id,
      customerNumber: row.customer_number,
      customerName: row.customer_name,
      region: readRegion(row.regions as { code: string } | Array<{ code: string }> | null)?.code ?? "mrah",
      monthKey: row.month_key,
      collectedAmount: Number(row.collected_amount),
      currency: row.currency,
      status: row.status,
      billScanImageName: row.bill_scan_image_name,
      employeeReceiptImageName: row.employee_receipt_image_name,
      modificationReason: row.modification_reason,
      modifiedByEmployee: row.modified_by_employee,
      validatedByEmployeeAt: row.validated_by_employee_at,
      scannedAt: row.scanned_at,
    }));
    return NextResponse.json({ logs: rows });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireRole(["collector"]);
    if ("response" in auth) return auth.response;

    const body = (await request.json()) as CreateQrCollectionBody;
    if (!body.customerId || !body.customerNumber || !body.regionCode || !body.monthKey || !body.collectedAmount) {
      return NextResponse.json({ error: "Invalid QR collection payload." }, { status: 400 });
    }
    const supabase = createSupabaseAdminClient();
    const { data: region, error: regionError } = await supabase
      .from("regions")
      .select("id")
      .eq("code", body.regionCode)
      .maybeSingle();
    if (regionError) return NextResponse.json({ error: regionError.message }, { status: 500 });
    if (!region) return NextResponse.json({ error: "Region not found." }, { status: 400 });

    const { data, error } = await supabase
      .from("qr_collection_logs")
      .insert({
        customer_id: body.customerId,
        customer_number: body.customerNumber,
        customer_name: body.customerName,
        region_id: region.id,
        month_key: body.monthKey,
        collected_amount: body.collectedAmount,
        currency: body.currency ?? "LBP",
        status: "pending_employee_validation",
        bill_scan_image_name: body.billScanImageName ?? null,
        employee_receipt_image_name: body.employeeReceiptImageName ?? null,
      })
      .select("id")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, id: data.id });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
