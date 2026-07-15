import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "../../../lib/supabase/server-admin";
import { requireRole } from "../../../lib/auth/require-role";

type RegionCode = "mrah" | "printania";
type CreateCustomerBody = {
  fullName: string;
  region: RegionCode;
  billingType: "fixed-monthly" | "metered" | "amp-only" | "both" | "free";
  phone?: string;
  boxNumber?: string;
  building?: string;
  status?: "active" | "paused";
  mode?: "customer" | "monitor";
  monitorName?: string;
  linkedCustomerId?: string;
  monitorCategory?: "theft-controller" | "elevator";
  subscribedAmpere?: number;
  fixedMonthlyAmount?: number;
};

async function generateCustomerNumber(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  prefix: "C" | "M"
) {
  const { data, error } = await supabase
    .from("customers")
    .select("customer_number")
    .like("customer_number", `${prefix}-%`);
  if (error) throw error;
  const maxSeq = (data ?? []).reduce((max, row) => {
    const value = String((row as Record<string, unknown>).customer_number ?? "");
    const m = value.match(new RegExp(`^${prefix}-(\\d+)$`));
    const seq = m ? Number(m[1]) : 0;
    return Number.isFinite(seq) ? Math.max(max, seq) : max;
  }, 0);
  const next = maxSeq + 1;
  return `${prefix}-${String(next).padStart(4, "0")}`;
}

function normalizeRegion(value: string | null): "all" | RegionCode {
  if (value === "mrah" || value === "printania") return value;
  return "all";
}

function normalizeView(value: string | null): "all" | "customers" | "monitors" {
  if (value === "customers" || value === "monitors") return value;
  return "all";
}

function sumUnpaidRemaining(
  unpaidBills: Array<{ customerId: string; monthKey: string; remainingAmount: number }>,
  customerId: string,
  throughMonthKey: string,
  beforeMonthOnly: boolean
) {
  return unpaidBills.reduce((sum, bill) => {
    if (bill.customerId !== customerId) return sum;
    const inScope = beforeMonthOnly
      ? bill.monthKey < throughMonthKey
      : bill.monthKey <= throughMonthKey;
    return inScope ? sum + bill.remainingAmount : sum;
  }, 0);
}

export async function GET(request: Request) {
  try {
    const auth = await requireRole(["manager", "employee"]);
    if ("response" in auth) return auth.response;

    const { searchParams } = new URL(request.url);
    const region = normalizeRegion(searchParams.get("region"));
    const view = normalizeView(searchParams.get("view"));
    const monthKey = searchParams.get("month") ?? new Date().toISOString().slice(0, 7);
    const statusFilter = searchParams.get("status");
    const supabase = createSupabaseAdminClient();

    const { data: customers, error: customersError } = await supabase
      .from("customers")
      .select(
        "id, customer_number, full_name, phone, box_number, building, status, is_free_customer, monitor_id, notes, regions!inner(code), billing_types(key)"
      )
      .order("full_name", { ascending: true });
    if (customersError) return NextResponse.json({ error: customersError.message }, { status: 500 });

    const customerIds = (customers ?? []).map((row) => String((row as Record<string, unknown>).id ?? ""));
    const { data: monthBills, error: billsError } = customerIds.length
      ? await supabase
          .from("bills")
          .select("customer_id, remaining_amount, consumption_kwh")
          .eq("month_key", monthKey)
          .in("customer_id", customerIds)
      : { data: [], error: null };
    if (billsError) return NextResponse.json({ error: billsError.message }, { status: 500 });

    const billByCustomerId = new Map<string, { remainingAmount: number; consumptionKwh: number }>();
    for (const bill of monthBills ?? []) {
      billByCustomerId.set(String((bill as Record<string, unknown>).customer_id ?? ""), {
        remainingAmount: Number((bill as Record<string, unknown>).remaining_amount ?? 0),
        consumptionKwh: Number((bill as Record<string, unknown>).consumption_kwh ?? 0),
      });
    }

    const { data: unpaidBillsRaw, error: unpaidBillsError } = customerIds.length
      ? await supabase
          .from("bills")
          .select("customer_id, month_key, remaining_amount")
          .in("customer_id", customerIds)
          .gt("remaining_amount", 0)
      : { data: [], error: null };
    if (unpaidBillsError) return NextResponse.json({ error: unpaidBillsError.message }, { status: 500 });

    const unpaidBills = (unpaidBillsRaw ?? []).map((bill) => ({
      customerId: String((bill as Record<string, unknown>).customer_id ?? ""),
      monthKey: String((bill as Record<string, unknown>).month_key ?? ""),
      remainingAmount: Number((bill as Record<string, unknown>).remaining_amount ?? 0),
    }));

    const { data: monthBatchItems, error: monthBatchItemsError } = customerIds.length
      ? await supabase
          .from("billing_batch_items")
          .select("customer_id, consumption_kwh, billing_batches!inner(month_key)")
          .in("customer_id", customerIds)
          .eq("billing_batches.month_key", monthKey)
      : { data: [], error: null };
    if (monthBatchItemsError) {
      return NextResponse.json({ error: monthBatchItemsError.message }, { status: 500 });
    }

    // Entry/review data should drive this month's monitor table even before posting to bills.
    const monthConsumptionByCustomerId = new Map<string, number>();
    for (const item of monthBatchItems ?? []) {
      monthConsumptionByCustomerId.set(
        String((item as Record<string, unknown>).customer_id ?? ""),
        Number((item as Record<string, unknown>).consumption_kwh ?? 0)
      );
    }

    const readRegionCode = (node: unknown): string => {
      if (Array.isArray(node)) return String((node[0] as { code?: string } | undefined)?.code ?? "");
      return String((node as { code?: string } | null)?.code ?? "");
    };
    const readBillingTypeKey = (node: unknown): string => {
      if (Array.isArray(node)) return String((node[0] as { key?: string } | undefined)?.key ?? "");
      return String((node as { key?: string } | null)?.key ?? "");
    };

    const readMonitorId = (data: Record<string, unknown>) => {
      const raw = data.monitor_id;
      return raw === null || raw === undefined ? "" : String(raw);
    };

    const linkedByMonitorId = new Map<string, { id: string; fullName: string; customerNumber: string }>();
    for (const row of customers ?? []) {
      const data = row as Record<string, unknown>;
      const monitorId = readMonitorId(data);
      const customerNumber = String(data.customer_number ?? "");
      if (!monitorId || customerNumber.startsWith("M-")) continue;
      if (!linkedByMonitorId.has(monitorId)) {
        linkedByMonitorId.set(monitorId, {
          id: String(data.id ?? ""),
          fullName: String(data.full_name ?? ""),
          customerNumber,
        });
      }
    }

    const readMonitorCategory = (notesValue: unknown): "theft-controller" | "elevator" | "-" => {
      const notes = String(notesValue ?? "");
      const match = notes.match(/monitorCategory:(theft-controller|elevator)/);
      return (match?.[1] as "theft-controller" | "elevator" | undefined) ?? "-";
    };

    const rows = (customers ?? [])
      .map((row) => {
        const data = row as Record<string, unknown>;
        const id = String(data.id ?? "");
        const regionCode = readRegionCode(data.regions) as RegionCode;
        const billingTypeKey = readBillingTypeKey(data.billing_types);
        const isFree = Boolean(data.is_free_customer);
        const monitorId = readMonitorId(data);
        const customerNumber = String(data.customer_number ?? "");
        const isMonitor = customerNumber.startsWith("M-");
        const linked = monitorId ? linkedByMonitorId.get(monitorId) : undefined;
        const monitorCategory = isMonitor ? readMonitorCategory(data.notes) : "-";
        const billInfo = billByCustomerId.get(id);
        const hasBillThisMonth = Boolean(billInfo);
        const remainingThisMonth = billInfo?.remainingAmount ?? 0;
        const ongoingBalanceCarryOver = sumUnpaidRemaining(unpaidBills, id, monthKey, true);
        const ongoingBalance = sumUnpaidRemaining(unpaidBills, id, monthKey, false);
        const monitorKwh = monthConsumptionByCustomerId.get(id) ?? billInfo?.consumptionKwh ?? 0;
        const linkedIncludedKwh = linked
          ? (monthConsumptionByCustomerId.get(linked.id) ?? billByCustomerId.get(linked.id)?.consumptionKwh ?? 0)
          : 0;
        const monitorMatchKwh = monitorKwh - linkedIncludedKwh;
        return {
          id,
          customerNumber,
          fullName: String(data.full_name ?? ""),
          phone: String(data.phone ?? ""),
          boxNumber: String(data.box_number ?? ""),
          building: String(data.building ?? ""),
          status: String(data.status ?? "active").toLowerCase(),
          region: regionCode,
          isMonitor,
          linkedTo: linked ? `${linked.fullName} (${linked.customerNumber})` : "Missing link",
          linkedCustomerId: linked?.id ?? "",
          linkedCustomerName: linked?.fullName ?? "Missing link",
          monitorCategory,
          monitorKwh,
          linkedIncludedKwh,
          monitorMatchKwh,
          billingType:
            isFree || billingTypeKey === "FREE"
              ? "free"
              : billingTypeKey === "FIXED_MONTHLY"
                ? "fixed-monthly"
                : "metered",
          billEnteredThisMonth: hasBillThisMonth,
          paidThisMonth: hasBillThisMonth && remainingThisMonth <= 0,
          ongoingBalance: Math.max(0, ongoingBalance),
          ongoingBalanceCarryOver: Math.max(0, ongoingBalanceCarryOver),
          ongoingBalanceThisMonth: Math.max(0, remainingThisMonth),
        };
      })
      .filter((row) => (view === "all" ? true : view === "monitors" ? row.isMonitor : !row.isMonitor))
      .filter((row) => (region === "all" ? true : row.region === region))
      .filter((row) => (statusFilter && statusFilter !== "all" ? row.status === statusFilter : true));

    return NextResponse.json({ customers: rows });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireRole(["manager", "employee"]);
    if ("response" in auth) return auth.response;

    const body = (await request.json()) as CreateCustomerBody;
    if (!body.fullName?.trim() || !body.region) {
      return NextResponse.json(
        { error: "fullName and region are required." },
        { status: 400 }
      );
    }
    if (
      (body.billingType === "amp-only" || body.billingType === "both") &&
      (!Number.isFinite(body.subscribedAmpere) || (body.subscribedAmpere ?? 0) <= 0)
    ) {
      return NextResponse.json(
        { error: "subscribedAmpere is required (and must be > 0) for amp-only/both billing." },
        { status: 400 }
      );
    }
    if (
      body.billingType === "fixed-monthly" &&
      (!Number.isFinite(body.fixedMonthlyAmount) || (body.fixedMonthlyAmount ?? 0) <= 0)
    ) {
      return NextResponse.json(
        { error: "fixedMonthlyAmount is required (and must be > 0) for fixed-monthly billing." },
        { status: 400 }
      );
    }

    const supabase = createSupabaseAdminClient();
    const prefix: "C" | "M" = body.mode === "monitor" ? "M" : "C";
    const customerNumber = await generateCustomerNumber(supabase, prefix);
    const fullName = body.fullName.trim();
    // 'free' has no billing_types row of its own (it's the orthogonal is_free_customer
    // flag) so it needs a real underlying key; 'metered' is a reasonable default since a
    // free customer is still metered for loss-tracking. 'amp-only'/'both' now map to
    // their own real billing_types rows instead of being silently downgraded to metered.
    const billingKey = body.billingType === "free" ? "metered" : body.billingType;

    const [{ data: region, error: regionError }, { data: billingType, error: billingError }] =
      await Promise.all([
        supabase.from("regions").select("id").eq("code", body.region).single(),
        supabase.from("billing_types").select("id").eq("key", billingKey).single(),
      ]);

    if (regionError || !region) {
      return NextResponse.json({ error: "Invalid region." }, { status: 400 });
    }
    if (billingError || !billingType) {
      return NextResponse.json({ error: `Billing type '${billingKey}' not found.` }, { status: 400 });
    }

    let regionId = region.id as string;
    let monitorId: string | null = null;
    if (body.mode === "monitor") {
      if (!body.linkedCustomerId?.trim()) {
        return NextResponse.json({ error: "linkedCustomerId is required for monitor mode." }, { status: 400 });
      }
      const { data: linkedCustomer, error: linkedCustomerError } = await supabase
        .from("customers")
        .select("id, region_id, monitor_id")
        .eq("id", body.linkedCustomerId.trim())
        .single();
      if (linkedCustomerError || !linkedCustomer) {
        return NextResponse.json({ error: "Linked customer not found." }, { status: 400 });
      }
      regionId = String(linkedCustomer.region_id ?? region.id);
      monitorId = linkedCustomer.monitor_id ? String(linkedCustomer.monitor_id) : null;

      const monitorName = body.monitorName?.trim() || `${fullName} Monitor`;
      if (!monitorId) {
        const { data: monitor, error: monitorError } = await supabase
          .from("monitors")
          .insert({
            region_id: regionId,
            name: monitorName,
            is_active: true,
          })
          .select("id")
          .single();
        if (monitorError || !monitor) {
          return NextResponse.json(
            { error: monitorError?.message ?? "Failed to create monitor." },
            { status: 500 }
          );
        }
        monitorId = String(monitor.id);

        const { error: updateLinkedError } = await supabase
          .from("customers")
          .update({ monitor_id: monitorId })
          .eq("id", body.linkedCustomerId.trim());
        if (updateLinkedError) {
          return NextResponse.json(
            { error: updateLinkedError.message ?? "Failed to link monitor to customer." },
            { status: 500 }
          );
        }
      }
    }

    const { data: created, error: createError } = await supabase
      .from("customers")
      .insert({
        customer_number: customerNumber,
        full_name: fullName,
        region_id: regionId,
        monitor_id: monitorId,
        billing_type_id: billingType.id,
        box_number: body.boxNumber?.trim() || null,
        building: body.building?.trim() || null,
        phone: body.phone?.trim() || null,
        subscribed_ampere:
          body.billingType === "amp-only" || body.billingType === "both" ? body.subscribedAmpere : null,
        fixed_monthly_amount: body.billingType === "fixed-monthly" ? body.fixedMonthlyAmount : 0,
        is_free_customer: body.billingType === "free",
        status: body.status?.toLowerCase() === "paused" ? "paused" : "active",
        notes:
          body.mode === "monitor" && body.monitorCategory
            ? `monitorCategory:${body.monitorCategory}`
            : null,
      })
      .select("id, customer_number")
      .single();

    if (createError || !created) {
      return NextResponse.json(
        { error: createError?.message ?? "Failed to create customer." },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, customerId: created.id, customerNumber: created.customer_number });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
