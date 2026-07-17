function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function monthKeyFromDate(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
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
