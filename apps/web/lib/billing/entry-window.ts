import type { SupabaseClient } from "@supabase/supabase-js";
import { monthKeyFromDate } from "../constants/months";

export function getEntryUnlockDate(monthKey: string): Date | null {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!match) return null;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (!Number.isFinite(year) || !Number.isFinite(monthIndex) || monthIndex < 0 || monthIndex > 11) {
    return null;
  }
  // Default rule: a month can be entered starting on the 27th of that same month.
  return new Date(year, monthIndex, 27, 0, 0, 0, 0);
}

export function formatEntryUnlockDate(monthKey: string): string {
  const unlockDate = getEntryUnlockDate(monthKey);
  if (!unlockDate) return "an unknown date";
  return unlockDate.toLocaleDateString("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit"
  });
}

export type EntryLockState = {
  isOpen: boolean;
  source: "manual_override" | "calendar_rule";
  unlockDateLabel: string;
};

/**
 * Resolves whether monthKey is open for billing entry right now. A manager's
 * manual override (billing_month_locks) always wins; with no override, falls
 * back to the default 27th-of-the-month calendar rule.
 */
export async function getEntryLockState(
  supabase: SupabaseClient,
  monthKey: string,
  now: Date = new Date()
): Promise<EntryLockState> {
  const unlockDateLabel = formatEntryUnlockDate(monthKey);

  const { data } = await supabase
    .from("billing_month_locks")
    .select("override")
    .eq("month_key", monthKey)
    .maybeSingle();

  if (data?.override === "unlocked") {
    return { isOpen: true, source: "manual_override", unlockDateLabel };
  }
  if (data?.override === "locked") {
    return { isOpen: false, source: "manual_override", unlockDateLabel };
  }

  // Default rule only ever opens the real current month (never a past month --
  // once the 27th passes it must not stay open forever -- and never a future
  // one). A manager can still override any specific month above regardless.
  const unlockDate = getEntryUnlockDate(monthKey);
  const isCurrentMonth = monthKey === monthKeyFromDate(now);
  const isOpen = isCurrentMonth && unlockDate ? now >= unlockDate : false;
  return { isOpen, source: "calendar_rule", unlockDateLabel };
}
