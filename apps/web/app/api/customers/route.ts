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
  linkedCustomerIds?: string[];
  monitorCategory?: "theft-controller" | "elevator";
  subscribedAmpere?: number;
  fixedMonthlyAmount?: number;
  startingCounter?: number;
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

/**
 * Returns the first value that's an actual positive number. Unlike `??`, this
 * skips a legitimate-looking 0 -- needed because a stale/incomplete
 * billing_batch_items row (e.g. a draft nobody finished, or a superseded
 * resubmission cycle) can carry calculated_amount/consumption_kwh = 0 even
 * after the real bill for that month posted with the true figure; `??` would
 * stop at that 0 and never reach the posted bill.
 */
function firstPositive(...values: Array<number | undefined>): number | undefined {
  for (const value of values) {
    if (typeof value === "number" && value > 0) return value;
  }
  return undefined;
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
    // Collectors read this for their dashboard and the scan screen (name, phone,
    // address, bill amount, paid status). Creating customers (POST) stays
    // manager/employee only.
    const auth = await requireRole(["manager", "employee", "collector"]);
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
        "id, customer_number, full_name, phone, box_number, building, status, is_free_customer, monitor_id, notes, starting_counter, fixed_monthly_amount, regions!inner(code), billing_types(key)"
      )
      .order("full_name", { ascending: true });
    if (customersError) return NextResponse.json({ error: customersError.message }, { status: 500 });

    const customerIds = (customers ?? []).map((row) => String((row as Record<string, unknown>).id ?? ""));
    const { data: monthBills, error: billsError } = customerIds.length
      ? await supabase
          .from("bills")
          .select("customer_id, remaining_amount, consumption_kwh, amount")
          .eq("month_key", monthKey)
          .in("customer_id", customerIds)
      : { data: [], error: null };
    if (billsError) return NextResponse.json({ error: billsError.message }, { status: 500 });

    const billByCustomerId = new Map<string, { remainingAmount: number; consumptionKwh: number; amount: number }>();
    for (const bill of monthBills ?? []) {
      billByCustomerId.set(String((bill as Record<string, unknown>).customer_id ?? ""), {
        remainingAmount: Number((bill as Record<string, unknown>).remaining_amount ?? 0),
        consumptionKwh: Number((bill as Record<string, unknown>).consumption_kwh ?? 0),
        amount: Number((bill as Record<string, unknown>).amount ?? 0),
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
          .select("customer_id, consumption_kwh, calculated_amount, billing_batches!inner(month_key)")
          .in("customer_id", customerIds)
          .eq("billing_batches.month_key", monthKey)
      : { data: [], error: null };
    if (monthBatchItemsError) {
      return NextResponse.json({ error: monthBatchItemsError.message }, { status: 500 });
    }

    // Entry/review data should drive this month's monitor table even before posting to bills.
    const monthConsumptionByCustomerId = new Map<string, number>();
    const monthAmountByCustomerId = new Map<string, number>();
    for (const item of monthBatchItems ?? []) {
      const data = item as Record<string, unknown>;
      const customerId = String(data.customer_id ?? "");
      monthConsumptionByCustomerId.set(customerId, Number(data.consumption_kwh ?? 0));
      monthAmountByCustomerId.set(customerId, Number(data.calculated_amount ?? 0));
    }

    // This month's kWh price -- needed to turn a fixed-monthly customer's flat
    // fee back into an implied kWh figure (they never get a real meter reading).
    const { data: tariffRow, error: tariffError } = await supabase
      .from("monthly_kwh_tariffs")
      .select("kwh_price")
      .eq("month_key", monthKey)
      .maybeSingle();
    if (tariffError) return NextResponse.json({ error: tariffError.message }, { status: 500 });
    const kwhPriceThisMonth = Number((tariffRow as Record<string, unknown> | null)?.kwh_price ?? 0);

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

    const linkedByMonitorId = new Map<
      string,
      Array<{ id: string; fullName: string; customerNumber: string; billingType: string; fixedMonthlyAmount: number }>
    >();
    for (const row of customers ?? []) {
      const data = row as Record<string, unknown>;
      const monitorId = readMonitorId(data);
      const customerNumber = String(data.customer_number ?? "");
      if (!monitorId || customerNumber.startsWith("M-")) continue;
      const list = linkedByMonitorId.get(monitorId) ?? [];
      list.push({
        id: String(data.id ?? ""),
        fullName: String(data.full_name ?? ""),
        customerNumber,
        billingType: readBillingTypeKey(data.billing_types),
        fixedMonthlyAmount: Number(data.fixed_monthly_amount ?? 0)
      });
      linkedByMonitorId.set(monitorId, list);
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
        const linkedList = monitorId ? linkedByMonitorId.get(monitorId) ?? [] : [];
        const monitorCategory = isMonitor ? readMonitorCategory(data.notes) : "-";
        const billInfo = billByCustomerId.get(id);
        const hasBillThisMonth = Boolean(billInfo);
        const remainingThisMonth = billInfo?.remainingAmount ?? 0;
        const ongoingBalanceCarryOver = sumUnpaidRemaining(unpaidBills, id, monthKey, true);
        const ongoingBalance = sumUnpaidRemaining(unpaidBills, id, monthKey, false);
        const monitorKwh = firstPositive(billInfo?.consumptionKwh, monthConsumptionByCustomerId.get(id)) ?? 0;
        // Fixed-monthly customers never get a real meter reading (consumption_kwh
        // is always stored as 0 for them) -- their kWh is implied by dividing what
        // they actually pay this month by this month's kWh price, so a monitor
        // linked to a flat-rate customer can still be reconciled against real usage.
        let linkedDataFound = false;
        const linkedIncludedKwh = linkedList.reduce((sum, linked) => {
          if (linked.billingType === "fixed-monthly") {
            const amountThisMonth =
              firstPositive(
                billByCustomerId.get(linked.id)?.amount,
                monthAmountByCustomerId.get(linked.id),
                linked.fixedMonthlyAmount
              ) ?? 0;
            if (amountThisMonth > 0 && kwhPriceThisMonth > 0) {
              linkedDataFound = true;
              return sum + amountThisMonth / kwhPriceThisMonth;
            }
            return sum;
          }
          // A posted bill's reading is authoritative (even if it's genuinely 0,
          // e.g. a vacant unit) -- only fall back to the draft batch item when
          // no bill exists yet for this month at all.
          const billedConsumption = billByCustomerId.get(linked.id)?.consumptionKwh;
          const tracked = billedConsumption !== undefined ? billedConsumption : monthConsumptionByCustomerId.get(linked.id);
          if (tracked !== undefined) linkedDataFound = true;
          return sum + (tracked ?? 0);
        }, 0);
        // Match = monitor's own kWh - what its linked customers' pricing
        // accounts for. Positive means the monitor is reading more than that --
        // real usage has outgrown what's being paid for.
        const monitorMatchKwh = monitorKwh - linkedIncludedKwh;
        // The point of linking a monitor to fixed-price customers is to catch
        // exactly that. Flag it only once we actually have both sides of the
        // comparison, with a tolerance (5 kWh, or 10% of the linked figure) to
        // absorb rounding/meter-timing noise.
        const monitorOverBudget =
          isMonitor && linkedDataFound && monitorKwh > 0 && monitorMatchKwh > Math.max(5, linkedIncludedKwh * 0.1);
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
          linkedTo:
            linkedList.length > 0
              ? linkedList.map((c) => `${c.fullName} (${c.customerNumber})`).join(", ")
              : "Missing link",
          linkedCustomers: linkedList,
          // Back-compat single-value fields (first linked customer, if any) -- some
          // older UI still reads these; linkedCustomers is the source of truth.
          linkedCustomerId: linkedList[0]?.id ?? "",
          linkedCustomerName: linkedList[0]?.fullName ?? "Missing link",
          monitorCategory,
          monitorKwh,
          linkedIncludedKwh,
          // False when the only reason linkedIncludedKwh is 0 is missing data
          // (no reading/bill yet, or no kWh price set for this month) rather
          // than the linked customers genuinely using nothing -- lets the UI
          // show "no data" instead of a misleading zero.
          linkedKwhAvailable: linkedList.length === 0 || linkedDataFound,
          monitorMatchKwh,
          monitorOverBudget,
          startingCounter: Number(data.starting_counter ?? 0),
          // billing_types.key is already the real lowercase-hyphenated key
          // (metered/amp-only/both/fixed-monthly) — no remapping needed here.
          billingType: isFree ? "free" : billingTypeKey || "metered",
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

    // Lets the monitors view explain a genuine "no data yet" month (e.g. this
    // month's price hasn't been entered) instead of looking like a bug.
    return NextResponse.json({
      customers: rows,
      kwhPriceAvailable: kwhPriceThisMonth > 0,
      kwhPriceThisMonth
    });
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
    if (body.startingCounter !== undefined && (!Number.isFinite(body.startingCounter) || body.startingCounter < 0)) {
      return NextResponse.json(
        { error: "startingCounter must be a number >= 0." },
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
      const linkedIds = Array.from(new Set((body.linkedCustomerIds ?? []).map((v) => v.trim()).filter(Boolean)));
      if (linkedIds.length === 0) {
        return NextResponse.json({ error: "At least one linked customer is required for monitor mode." }, { status: 400 });
      }
      const { data: linkedCustomers, error: linkedCustomerError } = await supabase
        .from("customers")
        .select("id, region_id, monitor_id")
        .in("id", linkedIds);
      if (linkedCustomerError || !linkedCustomers || linkedCustomers.length !== linkedIds.length) {
        return NextResponse.json({ error: "One or more linked customers not found." }, { status: 400 });
      }
      regionId = String(linkedCustomers[0].region_id ?? region.id);
      const existingOther = linkedCustomers.find((c) => c.monitor_id);
      monitorId = existingOther ? String(existingOther.monitor_id) : null;

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
      }

      const { error: updateLinkedError } = await supabase
        .from("customers")
        .update({ monitor_id: monitorId })
        .in("id", linkedIds);
      if (updateLinkedError) {
        return NextResponse.json(
          { error: updateLinkedError.message ?? "Failed to link monitor to customer(s)." },
          { status: 500 }
        );
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
        starting_counter: body.startingCounter ?? 0,
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
