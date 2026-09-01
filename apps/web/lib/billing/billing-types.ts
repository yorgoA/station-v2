/**
 * Which billing types are priced on metered consumption, and therefore need a
 * monthly counter reading + one counter photo captured during billing entry.
 *
 * The other real types are flat monthly charges -- the same amount every month
 * regardless of the meter -- so billing entry collects no reading, no photo,
 * and no consumption for them:
 *   - `fixed-monthly` : a set `customers.fixed_monthly_amount`
 *   - `amp-only`      : the customer's ampere-tier price
 *
 * `free` customers are handled separately (the `is_free_customer` flag), ahead
 * of this check, and are already excluded from meter entry.
 */
export const METER_READING_BILLING_TYPES = ["metered", "both"] as const;

export function billingTypeNeedsMeterReading(billingType: string | null | undefined): boolean {
  return (METER_READING_BILLING_TYPES as readonly string[]).includes(String(billingType ?? ""));
}
