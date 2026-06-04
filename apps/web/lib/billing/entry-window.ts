export function getEntryUnlockDate(monthKey: string): Date | null {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!match) return null;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (!Number.isFinite(year) || !Number.isFinite(monthIndex) || monthIndex < 0 || monthIndex > 11) {
    return null;
  }
  // A month can be entered starting on the 27th of that same month.
  return new Date(year, monthIndex, 27, 0, 0, 0, 0);
}

export function isEntryWindowOpen(monthKey: string, now: Date = new Date()): boolean {
  const unlockDate = getEntryUnlockDate(monthKey);
  if (!unlockDate) return false;
  return now >= unlockDate;
}

export function formatEntryUnlockDate(monthKey: string): string {
  const unlockDate = getEntryUnlockDate(monthKey);
  if (!unlockDate) return "an unknown date";
  return unlockDate.toLocaleDateString("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}
