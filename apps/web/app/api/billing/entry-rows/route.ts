import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "../../../../lib/supabase/server-admin";
import { requireRole } from "../../../../lib/auth/require-role";

export async function GET(request: Request) {
  try {
    const auth = await requireRole(["manager", "employee"]);
    if ("response" in auth) return auth.response;

    const { searchParams } = new URL(request.url);
    const monthKey = searchParams.get("month");
    const regionCode = searchParams.get("region");
    if (!monthKey || !regionCode) {
      return NextResponse.json({ error: "month and region query params are required." }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const { data: region, error: regionError } = await supabase
      .from("regions")
      .select("id")
      .eq("code", regionCode)
      .maybeSingle();
    if (regionError) return NextResponse.json({ error: regionError.message }, { status: 500 });
    if (!region) return NextResponse.json({ rows: [] });

    const { data: customers, error: customersError } = await supabase
      .from("customers")
      .select("id, customer_number, full_name, billing_type_id, is_free_customer, monitor_id")
      .eq("region_id", region.id)
      .order("customer_number", { ascending: true });
    if (customersError) return NextResponse.json({ error: customersError.message }, { status: 500 });

    const customerList = customers ?? [];
    const customerIds = customerList.map((c) => c.id as string).filter(Boolean);

    const latestCounterByCustomerId = new Map<string, number>();
    if (customerIds.length > 0) {
      const { data: billsRows, error: billsError } = await supabase
        .from("bills")
        .select("customer_id, new_counter, month_key")
        .in("customer_id", customerIds);
      if (billsError) return NextResponse.json({ error: billsError.message }, { status: 500 });
      const byNewestFirst = [...(billsRows ?? [])].sort((a, b) =>
        String(b.month_key ?? "").localeCompare(String(a.month_key ?? ""))
      );
      for (const bill of byNewestFirst) {
        const cid = bill.customer_id as string;
        if (!latestCounterByCustomerId.has(cid)) {
          latestCounterByCustomerId.set(cid, Number(bill.new_counter ?? 0));
        }
      }
    }

    const baseCustomerNumberByMonitorId = new Map<string, string>();
    for (const c of customerList) {
      const mid = c.monitor_id ? String(c.monitor_id) : "";
      const cn = String(c.customer_number ?? "");
      if (!mid || cn.startsWith("M-")) continue;
      if (!baseCustomerNumberByMonitorId.has(mid)) {
        baseCustomerNumberByMonitorId.set(mid, cn);
      }
    }

    const { data: billingTypes, error: billingTypesError } = await supabase
      .from("billing_types")
      .select("id, key");
    if (billingTypesError) return NextResponse.json({ error: billingTypesError.message }, { status: 500 });
    const billingTypeById = new Map((billingTypes ?? []).map((row) => [row.id as string, row.key as string]));

    const rows = customerList.map((customer) => {
      const cn = String(customer.customer_number ?? "");
      const isMonitor = cn.startsWith("M-");
      const mid = customer.monitor_id ? String(customer.monitor_id) : "";
      const obligatoryLinkedToCustomerNumber =
        isMonitor && mid ? baseCustomerNumberByMonitorId.get(mid) : undefined;

      return {
        id: `entry-${customer.id}`,
        customerNumber: cn,
        customerName: customer.full_name ?? "",
        regionCode,
        previousCounter: latestCounterByCustomerId.get(customer.id as string) ?? 0,
        billingType: (billingTypeById.get(customer.billing_type_id as string) ?? "metered") as
          | "metered"
          | "fixed-monthly",
        isFreeCustomer: Boolean(customer.is_free_customer),
        isMonitor,
        obligatoryLinkedToCustomerNumber,
      };
    });

    return NextResponse.json({ rows, monthKey, regionCode });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown server error." },
      { status: 500 }
    );
  }
}
