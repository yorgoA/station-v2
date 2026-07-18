"use client";

import { useEffect, useState } from "react";
import { CURRENT_MONTH_KEY } from "../constants/months";

/**
 * Real, data-driven month list for filters/pickers: the current month plus
 * every month that actually has billing data. Starts as just the current
 * month (synchronous, no flash of empty state) and fills in once the fetch
 * resolves.
 */
export function useAvailableMonths(): string[] {
  const [months, setMonths] = useState<string[]>([CURRENT_MONTH_KEY]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings/available-months")
      .then(async (response) => {
        if (!response.ok) throw new Error("Failed to load available months.");
        const payload = (await response.json()) as { months?: string[] };
        if (!cancelled && payload.months?.length) setMonths(payload.months);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return months;
}
