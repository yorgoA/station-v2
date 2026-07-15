import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "../../../../lib/supabase/server-admin";
import { requireRole } from "../../../../lib/auth/require-role";

type RegionCode = "mrah" | "printania";

function normalizeRegion(value: string | null): "all" | RegionCode {
  if (value === "mrah" || value === "printania") return value;
  return "all";
}

function billingTypeFromKey(key: string | null | undefined): "metered" | "fixed-monthly" {
  return key === "FIXED_MONTHLY" ? "fixed-monthly" : "metered";
}

export async function GET(request: Request) {
  try {
    const auth = await requireRole(["manager"]);
    if ("response" in auth) return auth.response;

    const { searchParams } = new URL(request.url);
    const monthKey = searchParams.get("month") ?? new Date().toISOString().slice(0, 7);
    const region = normalizeRegion(searchParams.get("region"));
    const supabase = createSupabaseAdminClient();

    const billsQuery = supabase
      .from("bills")
      .select(
        "id, customer_id, month_key, amount, remaining_amount, paid_amount, consumption_kwh, customers!inner(full_name, is_free_customer, billing_type_id, regions!inner(code))"
      );
    const paymentsQuery = supabase
      .from("payments")
      .select(
        "id, amount, payment_date, method, receipt_image_url, customers!inner(full_name, regions!inner(code))"
      );
    const customersQuery = supabase
      .from("customers")
      .select("id, is_free_customer, monitor_id, regions!inner(code)");

    const [{ data: bills, error: billsError }, { data: payments, error: paymentsError }, { data: customers, error: customersError }] =
      await Promise.all([billsQuery, paymentsQuery, customersQuery]);

    if (billsError) return NextResponse.json({ error: billsError.message }, { status: 500 });
    if (paymentsError) return NextResponse.json({ error: paymentsError.message }, { status: 500 });
    if (customersError) return NextResponse.json({ error: customersError.message }, { status: 500 });

    const readRegionCode = (node: unknown): string => {
      if (Array.isArray(node)) return String((node[0] as { code?: string } | undefined)?.code ?? "");
      return String((node as { code?: string } | null)?.code ?? "");
    };
    const readCustomer = (node: unknown) => {
      if (Array.isArray(node)) return (node[0] as Record<string, unknown> | undefined) ?? null;
      return (node as Record<string, unknown> | null) ?? null;
    };

    const filteredBills = (bills ?? []).filter((row) => {
      const customer = readCustomer((row as Record<string, unknown>).customers);
      const code = readRegionCode(customer?.regions);
      if (region !== "all" && code !== region) return false;
      return true;
    });
    const monthBills = filteredBills.filter(
      (row) => String((row as Record<string, unknown>).month_key ?? "") === monthKey
    );
    const previousBills = filteredBills.filter(
      (row) => String((row as Record<string, unknown>).month_key ?? "") < monthKey
    );

    const filteredPayments = (payments ?? []).filter((row) => {
      const customer = readCustomer((row as Record<string, unknown>).customers);
      const code = readRegionCode(customer?.regions);
      if (region !== "all" && code !== region) return false;
      return true;
    });
    const monthPayments = filteredPayments.filter((row) =>
      String((row as Record<string, unknown>).payment_date ?? "").startsWith(`${monthKey}-`)
    );

    const filteredCustomers = (customers ?? []).filter((row) => {
      const code = readRegionCode((row as Record<string, unknown>).regions);
      if (region !== "all" && code !== region) return false;
      return true;
    });

    const totalToBePaid = monthBills.reduce(
      (sum, row) => sum + Number((row as Record<string, unknown>).amount ?? 0),
      0
    );
    const collected = monthPayments.reduce(
      (sum, row) => sum + Number((row as Record<string, unknown>).amount ?? 0),
      0
    );
    const unpaidCurrent = monthBills.reduce(
      (sum, row) => sum + Number((row as Record<string, unknown>).remaining_amount ?? 0),
      0
    );
    const previousUnpaid = previousBills.reduce(
      (sum, row) => sum + Number((row as Record<string, unknown>).remaining_amount ?? 0),
      0
    );
    const unpaidTillToday = unpaidCurrent + previousUnpaid;
    const totalKwhProduced = monthBills.reduce(
      (sum, row) => sum + Number((row as Record<string, unknown>).consumption_kwh ?? 0),
      0
    );
    const payingKwh = monthBills.reduce((sum, row) => {
      const customer = readCustomer((row as Record<string, unknown>).customers);
      if (Boolean(customer?.is_free_customer)) return sum;
      return sum + Number((row as Record<string, unknown>).consumption_kwh ?? 0);
    }, 0);
    const lossPercent = totalKwhProduced > 0 ? ((totalKwhProduced - payingKwh) / totalKwhProduced) * 100 : 0;

    const monitorCustomers = filteredCustomers.filter((row) =>
      Boolean((row as Record<string, unknown>).monitor_id)
    ).length;
    const freeCustomers = filteredCustomers.filter((row) =>
      Boolean((row as Record<string, unknown>).is_free_customer)
    ).length;

    const billRows = monthBills.map((row) => {
      const customer = readCustomer((row as Record<string, unknown>).customers);
      const amount = Number((row as Record<string, unknown>).amount ?? 0);
      const remaining = Number((row as Record<string, unknown>).remaining_amount ?? 0);
      const isFree = Boolean(customer?.is_free_customer);
      return {
        customer: String(customer?.full_name ?? "-"),
        region: (readRegionCode(customer?.regions) || "mrah") as RegionCode,
        monthKey: String((row as Record<string, unknown>).month_key ?? monthKey),
        amount,
        currency: "LBP" as const,
        status: remaining <= 0 ? ("paid" as const) : ("unpaid" as const),
        billingType: isFree ? "fixed-monthly" : "metered",
      };
    });

    const paymentRows = monthPayments.map((row) => {
      const customer = readCustomer((row as Record<string, unknown>).customers);
      return {
        customer: String(customer?.full_name ?? "-"),
        region: (readRegionCode(customer?.regions) || "mrah") as RegionCode,
        date: String((row as Record<string, unknown>).payment_date ?? ""),
        amount: `${Number((row as Record<string, unknown>).amount ?? 0).toLocaleString()} LBP`,
        method: String((row as Record<string, unknown>).method ?? "manual"),
        receiptRef: String((row as Record<string, unknown>).receipt_image_url ?? "-"),
      };
    });

    const freeCustomerRows = monthBills
      .filter((row) => Boolean(readCustomer((row as Record<string, unknown>).customers)?.is_free_customer))
      .map((row) => {
        const customer = readCustomer((row as Record<string, unknown>).customers);
        return {
          customer: String(customer?.full_name ?? "-"),
          region: (readRegionCode(customer?.regions) || "mrah") as RegionCode,
          consumedKwh: Number((row as Record<string, unknown>).consumption_kwh ?? 0),
          reason: "Free customer",
          subscribedAmpere: 0,
        };
      });

    return NextResponse.json({
      monthKey,
      region,
      overview: {
        totalToBePaid,
        collected,
        unpaidTillToday,
        totalKwhProduced,
        payingKwh,
        lossPercent,
        monitorCustomers,
        freeCustomers,
        totalCustomers: filteredCustomers.length,
      },
      moneyOverview: {
        totalCustomers: filteredCustomers.length,
        totalToBePaid,
        collected,
        unpaidCurrent,
        previousUnpaid,
        unpaidTillToday,
      },
      kwhOverview: {
        totalKwhProduced,
        payingKwh,
        freeKwh: Math.max(0, totalKwhProduced - payingKwh),
      },
      bills: billRows,
      payments: paymentRows,
      freeCustomers: freeCustomerRows,
      monitors: [],
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
