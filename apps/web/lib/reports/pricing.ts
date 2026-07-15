import type { SupabaseClient } from "@supabase/supabase-js";

export type AmpereTier = { amp: number; price: number };
export type MonthlyTariff = { monthKey: string; kwhPrice: number };

export type BillingTypeKey = "metered" | "amp-only" | "both" | "fixed-monthly" | "free";

/**
 * Exact match, else the highest tier at or below the given amp, else the
 * smallest tier available. Mirrors get_ampere_price() in db/schema.sql —
 * keep both in sync if this changes.
 */
export function resolveAmperePrice(tiers: AmpereTier[], subscribedAmpere: number): number | null {
  if (!tiers.length) return null;
  const sorted = [...tiers].sort((a, b) => a.amp - b.amp);
  const exact = sorted.find((tier) => tier.amp === subscribedAmpere);
  if (exact) return exact.price;
  const lower = sorted.filter((tier) => tier.amp <= subscribedAmpere);
  return lower.length > 0 ? lower[lower.length - 1].price : sorted[0].price;
}

export async function getAllAmpereTiers(supabase: SupabaseClient): Promise<AmpereTier[]> {
  const { data, error } = await supabase.from("ampere_price_tiers").select("amp, price").order("amp", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({ amp: row.amp as number, price: Number(row.price) }));
}

export async function getAmperePriceForTier(
  supabase: SupabaseClient,
  subscribedAmpere: number
): Promise<number | null> {
  const tiers = await getAllAmpereTiers(supabase);
  return resolveAmperePrice(tiers, subscribedAmpere);
}

export async function getAllMonthlyTariffs(supabase: SupabaseClient): Promise<MonthlyTariff[]> {
  const { data, error } = await supabase
    .from("monthly_kwh_tariffs")
    .select("month_key, kwh_price")
    .order("month_key", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({ monthKey: row.month_key as string, kwhPrice: Number(row.kwh_price) }));
}

/**
 * Returns null (not a fallback constant) when no price has been entered for
 * that month yet — a missing price must be visible, never silently guessed.
 */
export async function getKwhPriceForMonth(supabase: SupabaseClient, monthKey: string): Promise<number | null> {
  const { data, error } = await supabase
    .from("monthly_kwh_tariffs")
    .select("kwh_price")
    .eq("month_key", monthKey)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? Number(data.kwh_price) : null;
}

export type BillAmountInput = {
  billingTypeKey: BillingTypeKey;
  isFreeCustomer: boolean;
  consumptionKwh: number;
  subscribedAmpere: number | null;
  fixedMonthlyAmount: number | null;
  ampereTierPrice: number | null;
  kwhPrice: number | null;
};

export type BillAmountResult = {
  amount: number;
  ampereSnapshot: number | null;
  kwhSnapshot: number | null;
};

/**
 * Pure calculation, single source of truth for both the approve_billing_batch()
 * SQL function (authoritative, DB-side) and any TS-side preview/report code.
 * Keep in sync with approve_billing_batch() in db/schema.sql if this changes.
 */
export function calculateBillAmount(input: BillAmountInput): BillAmountResult {
  if (input.isFreeCustomer) {
    return { amount: 0, ampereSnapshot: null, kwhSnapshot: null };
  }

  switch (input.billingTypeKey) {
    case "metered": {
      if (input.kwhPrice == null) throw new Error("kWh price is required for metered billing.");
      return { amount: input.consumptionKwh * input.kwhPrice, ampereSnapshot: null, kwhSnapshot: input.kwhPrice };
    }
    case "amp-only": {
      if (input.ampereTierPrice == null) throw new Error("Ampere price is required for amp-only billing.");
      return { amount: input.ampereTierPrice, ampereSnapshot: input.ampereTierPrice, kwhSnapshot: null };
    }
    case "both": {
      if (input.ampereTierPrice == null) throw new Error("Ampere price is required for combined billing.");
      if (input.kwhPrice == null) throw new Error("kWh price is required for combined billing.");
      return {
        amount: input.ampereTierPrice + input.consumptionKwh * input.kwhPrice,
        ampereSnapshot: input.ampereTierPrice,
        kwhSnapshot: input.kwhPrice
      };
    }
    case "fixed-monthly":
      return { amount: input.fixedMonthlyAmount ?? 0, ampereSnapshot: null, kwhSnapshot: null };
    case "free":
      return { amount: 0, ampereSnapshot: null, kwhSnapshot: null };
    default:
      throw new Error(`Unknown billing type: ${input.billingTypeKey}`);
  }
}
