"use client";

import Link from "next/link";
import { type ReactNode } from "react";
import { type ReportKpiTone } from "../../../../lib/types/reports";

type KpiGridProps = {
  children: ReactNode;
};

export function KpiGrid({ children }: KpiGridProps) {
  return <div className="kpi-grid">{children}</div>;
}

type KpiCardProps = {
  label: string;
  value: string | number;
  tone?: ReportKpiTone;
  actionHref?: string;
  actionLabel?: string;
};

export function KpiCard({ label, value, tone = "neutral", actionHref, actionLabel }: KpiCardProps) {
  const toneClass = tone === "money" ? "kpi-money" : tone === "kwh" ? "kpi-kwh" : "";
  return (
    <div className={`card ${toneClass}`.trim()}>
      <p className="muted" style={{ fontWeight: 700 }}>
        {label}
      </p>
      <p className="kpi-value">{value}</p>
      {actionHref && actionLabel ? (
        <Link href={actionHref} className="action-link-btn">
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}
