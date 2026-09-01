function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function monthKeyFromDate(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
}

/**
 * Day of the month a billing month opens for meter-reading entry. A month's
 * reading walk starts a few days before month-end, so month M opens on the 27th
 * of M and -- under the rolling rule (apps/web/lib/billing/entry-window.ts) --
 * stays open until the 27th of M+1, i.e. through the 26th of the next month.
 * Single source of truth: entry-window.ts imports this rather than re-hardcoding
 * "27".
 */
export const ENTRY_UNLOCK_DAY = 27;

/**
 * The billing month an employee is expected to be entering readings for right
 * now: the current calendar month once its 27th has passed, otherwise the month
 * before it (whose entry window stays open through the 26th of this month).
 * Used as the default month on the billing-entry screen so an employee opening
 * it on, say, Sept 3rd lands on August -- the month whose readings are actually
 * due -- instead of a still-locked September.
 */
export function activeEntryMonthKey(now: Date = new Date()): string {
  const ref =
    now.getDate() >= ENTRY_UNLOCK_DAY
      ? new Date(now.getFullYear(), now.getMonth(), 1)
      : new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return monthKeyFromDate(ref);
}

/**
 * Rolling window of selectable month keys, most recent first. Computed from the
 * real current date rather than a frozen list -- a static array of literal
 * month strings silently stops offering new months (this app's dropdowns were
 * stuck offering only 2026-04/2026-05 well past both of those months).
 */
export function generateMonthOptions(monthsBack = 8, monthsForward = 3): string[] {
  const now = new Date();
  const options: string[] = [];
  for (let i = monthsForward; i >= -monthsBack; i--) {
    options.push(monthKeyFromDate(new Date(now.getFullYear(), now.getMonth() + i, 1)));
  }
  return options;
}

export const MONTH_OPTIONS = generateMonthOptions();
export const CURRENT_MONTH_KEY = monthKeyFromDate(new Date());
export const ACTIVE_ENTRY_MONTH_KEY = activeEntryMonthKey();
