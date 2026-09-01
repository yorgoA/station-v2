import type { SupabaseClient } from "@supabase/supabase-js";
import { ENTRY_UNLOCK_DAY } from "../constants/months";

function formatDay(date: Date): string {
  return date.toLocaleDateString("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit"
  });
}

export function getEntryUnlockDate(monthKey: string): Date | null {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!match) return null;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (!Number.isFinite(year) || !Number.isFinite(monthIndex) || monthIndex < 0 || monthIndex > 11) {
    return null;
  }
  // Default rule: a month opens for entry on the 27th of that same month.
  return new Date(year, monthIndex, ENTRY_UNLOCK_DAY, 0, 0, 0, 0);
}

/**
 * The instant a month's entry window closes under the rolling rule: the 27th of
 * the *following* month. So month M is enterable from M-27 through M+1-26
 * inclusive -- there is always exactly one calendar-open month, and it hands off
 * cleanly on the 27th (the next month opens the same moment this one closes).
 */
export function getEntryLockDate(monthKey: string): Date | null {
  const unlock = getEntryUnlockDate(monthKey);
  if (!unlock) return null;
  return new Date(unlock.getFullYear(), unlock.getMonth() + 1, ENTRY_UNLOCK_DAY, 0, 0, 0, 0);
}

export function formatEntryUnlockDate(monthKey: string): string {
  const unlockDate = getEntryUnlockDate(monthKey);
  if (!unlockDate) return "an unknown date";
  return formatDay(unlockDate);
}

export function formatEntryLockDate(monthKey: string): string {
  const lockDate = getEntryLockDate(monthKey);
  if (!lockDate) return "an unknown date";
  // Show the last day the window is open (26th of next month), not the 27th it
  // technically flips on -- clearer to a human reading "open ... to <date>".
  const lastOpenDay = new Date(lockDate.getFullYear(), lockDate.getMonth(), lockDate.getDate() - 1);
  return formatDay(lastOpenDay);
}

export type EntryLockState = {
  isOpen: boolean;
  source: "manual_override" | "calendar_rule";
  /** Date the window opens (27th of the month). */
  unlockDateLabel: string;
  /** Last day the window stays open (26th of the following month). */
  lockDateLabel: string;
};

/**
 * Resolves whether monthKey is open for billing entry right now. A manager's
 * manual override (billing_month_locks) always wins; with no override, falls
 * back to the default rolling calendar rule (open 27th of the month through the
 * 26th of the next month).
 *
 * Note: this only governs *starting* entry for a month. A batch the manager has
 * sent back (`changes_requested`) is always editable by the employee who owns
 * it regardless of this window -- that carve-out lives in the entry UI and the
 * submissions API, not here, because it needs region/batch context.
 */
export async function getEntryLockState(
  supabase: SupabaseClient,
  monthKey: string,
  now: Date = new Date()
): Promise<EntryLockState> {
  const unlockDateLabel = formatEntryUnlockDate(monthKey);
  const lockDateLabel = formatEntryLockDate(monthKey);

  const { data } = await supabase
    .from("billing_month_locks")
    .select("override")
    .eq("month_key", monthKey)
    .maybeSingle();

  if (data?.override === "unlocked") {
    return { isOpen: true, source: "manual_override", unlockDateLabel, lockDateLabel };
  }
  if (data?.override === "locked") {
    return { isOpen: false, source: "manual_override", unlockDateLabel, lockDateLabel };
  }

  // Rolling default: open from the 27th of the month through the 26th of the
  // next month, so the reading walk that spans month-end into the first days of
  // the following month is never locked out, while a month older than that
  // still closes on schedule (the "June stayed editable all through July" bug).
  const unlockDate = getEntryUnlockDate(monthKey);
  const lockDate = getEntryLockDate(monthKey);
  const isOpen = Boolean(unlockDate && lockDate && now >= unlockDate && now < lockDate);
  return { isOpen, source: "calendar_rule", unlockDateLabel, lockDateLabel };
}
