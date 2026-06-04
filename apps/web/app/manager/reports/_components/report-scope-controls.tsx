"use client";

import { type ReadonlyURLSearchParams, usePathname, useRouter } from "next/navigation";
import { type ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_REPORT_MONTH,
  DEFAULT_REPORT_REGION,
  REPORT_MONTH_OPTIONS,
} from "../../../../lib/constants/reports";
import { type ReportMonthKey, type ReportRegionFilter } from "../../../../lib/types/reports";

type UseReportScopeArgs = {
  searchParams: ReadonlyURLSearchParams;
};

export function useReportScope({ searchParams }: UseReportScopeArgs) {
  const router = useRouter();
  const pathname = usePathname();
  const [monthKey, setMonthKey] = useState<ReportMonthKey>(
    searchParams.get("month") ?? DEFAULT_REPORT_MONTH
  );
  const [region, setRegion] = useState<ReportRegionFilter>(
    (searchParams.get("region") as ReportRegionFilter) ?? DEFAULT_REPORT_REGION
  );
  const query = useMemo(() => `month=${monthKey}&region=${region}`, [monthKey, region]);

  useEffect(() => {
    const nextMonth = searchParams.get("month") ?? DEFAULT_REPORT_MONTH;
    const nextRegion = (searchParams.get("region") as ReportRegionFilter) ?? DEFAULT_REPORT_REGION;
    setMonthKey(nextMonth);
    setRegion(nextRegion);
  }, [searchParams]);

  useEffect(() => {
    const currentMonth = searchParams.get("month") ?? DEFAULT_REPORT_MONTH;
    const currentRegion = (searchParams.get("region") as ReportRegionFilter) ?? DEFAULT_REPORT_REGION;
    if (currentMonth === monthKey && currentRegion === region) return;
    router.replace(`${pathname}?${query}`, { scroll: false });
  }, [monthKey, pathname, query, region, router, searchParams]);

  return { monthKey, setMonthKey, region, setRegion, query };
}

type ReportScopeFiltersProps = {
  idPrefix: string;
  monthKey: ReportMonthKey;
  onMonthChange: (value: ReportMonthKey) => void;
  region: ReportRegionFilter;
  onRegionChange: (value: ReportRegionFilter) => void;
  allRegionsLabel?: string;
  children?: ReactNode;
};

export function ReportScopeFilters({
  idPrefix,
  monthKey,
  onMonthChange,
  region,
  onRegionChange,
  allRegionsLabel = "All regions",
  children,
}: ReportScopeFiltersProps) {
  return (
    <div className="filters-grid filters-grid-pro">
      <label htmlFor={`${idPrefix}-month`}>
        Month
        <select
          id={`${idPrefix}-month`}
          value={monthKey}
          onChange={(e) => onMonthChange(e.target.value)}
        >
          {REPORT_MONTH_OPTIONS.map((month) => (
            <option key={month} value={month}>
              {month}
            </option>
          ))}
        </select>
      </label>
      <label htmlFor={`${idPrefix}-region`}>
        Region
        <select
          id={`${idPrefix}-region`}
          value={region}
          onChange={(e) => onRegionChange(e.target.value as ReportRegionFilter)}
        >
          <option value="all">{allRegionsLabel}</option>
          <option value="mrah">Mrah</option>
          <option value="printania">Printania</option>
        </select>
      </label>
      {children}
    </div>
  );
}

type ReportScopeLabelProps = {
  monthKey: ReportMonthKey;
  region: ReportRegionFilter;
  prefix?: string;
};

export function ReportScopeLabel({ monthKey, region, prefix = "Scope:" }: ReportScopeLabelProps) {
  return (
    <p className="muted">
      {prefix} <strong>{monthKey}</strong> / <strong>{region === "all" ? "All regions" : region}</strong>
    </p>
  );
}
