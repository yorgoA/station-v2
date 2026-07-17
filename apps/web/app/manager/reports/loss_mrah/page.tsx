"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppShell } from "../../../_components/app-shell";
import { managerNavItems } from "../../../_components/role-nav";
import { ReportScopeFilters, ReportScopeLabel, useReportScope } from "../_components/report-scope-controls";
import { CURRENT_MONTH_KEY, MONTH_OPTIONS } from "../../../../lib/constants/months";

type SavedLossInput = {
  generatedKwh: number;
  validated: boolean;
  updatedAt: string;
};

const STORAGE_KEY = "station_v2_loss_mrah_manual_inputs";
const MONEY_RATE_PER_KWH = 400;
// Last 6 real months up to the current one, oldest first -- no future months (no bills exist yet).
const TREND_MONTHS = MONTH_OPTIONS.filter((m) => m <= CURRENT_MONTH_KEY).slice(0, 6).reverse();

async function fetchAppCalculatedKwh(monthKey: string, region: "mrah" | "printania"): Promise<number> {
  const response = await fetch(`/api/reports/manager?month=${monthKey}&region=${region}`);
  if (!response.ok) return 0;
  const payload = (await response.json()) as { kwhOverview?: { totalKwhProduced?: number } };
  return Number(payload.kwhOverview?.totalKwhProduced ?? 0);
}

function parseStoredLossInputs(raw: string | null): Record<string, SavedLossInput> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, SavedLossInput>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function LossMrahReportContent() {
  const searchParams = useSearchParams();
  const { monthKey, setMonthKey, region, setRegion } = useReportScope({ searchParams });
  const [generatedKwh, setGeneratedKwh] = useState("");
  const [validated, setValidated] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const [appCalculatedKwh, setAppCalculatedKwh] = useState(0);
  const [trendAppKwh, setTrendAppKwh] = useState<Record<string, number>>({});
  const storageEntryKey = `${monthKey}|${region}`;

  useEffect(() => {
    let cancelled = false;
    fetchAppCalculatedKwh(monthKey, region === "printania" ? "printania" : "mrah").then((value) => {
      if (!cancelled) setAppCalculatedKwh(value);
    });
    return () => {
      cancelled = true;
    };
  }, [monthKey, region]);

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      TREND_MONTHS.map(async (month) => [month, await fetchAppCalculatedKwh(month, region === "printania" ? "printania" : "mrah")] as const)
    ).then((entries) => {
      if (cancelled) return;
      setTrendAppKwh(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [region]);

  useEffect(() => {
    setIsHydrated(true);
    const stored = parseStoredLossInputs(localStorage.getItem(STORAGE_KEY));
    const savedEntry = stored[storageEntryKey];
    if (!savedEntry) {
      setGeneratedKwh("");
      setValidated(false);
      return;
    }
    setGeneratedKwh(String(savedEntry.generatedKwh));
    setValidated(savedEntry.validated);
  }, [storageEntryKey]);

  useEffect(() => {
    if (!isHydrated) return;
    const stored = parseStoredLossInputs(localStorage.getItem(STORAGE_KEY));
    if (generatedKwh.trim() === "") {
      delete stored[storageEntryKey];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
      return;
    }
    stored[storageEntryKey] = {
      generatedKwh: Number(generatedKwh),
      validated,
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  }, [generatedKwh, validated, isHydrated, storageEntryKey]);

  const { diff, lossPercent } = useMemo(() => {
    const generated = Number(generatedKwh || "0");
    const difference = generated - appCalculatedKwh;
    const percent = generated > 0 ? ((difference / generated) * 100).toFixed(2) : "0.00";
    return { diff: difference, lossPercent: percent };
  }, [generatedKwh, appCalculatedKwh]);

  const comparisonChartData = useMemo(
    () => [
      { metric: "Generated (manual)", kwh: Number(generatedKwh || "0"), color: "#0f766e" },
      { metric: "App calculated", kwh: appCalculatedKwh, color: "#2563eb" },
    ],
    [generatedKwh, appCalculatedKwh]
  );

  const monthlyLossTrendData = useMemo(() => {
    const stored = isHydrated ? parseStoredLossInputs(localStorage.getItem(STORAGE_KEY)) : {};
    return TREND_MONTHS.map((month) => {
      const entry = stored[`${month}|${region}`];
      const generated = entry?.generatedKwh ?? 0;
      const appKwh = trendAppKwh[month] ?? 0;
      const monthDiff = generated - appKwh;
      const monthLossPercent = generated > 0 ? Number(((monthDiff / generated) * 100).toFixed(2)) : 0;
      return { month, generated, appKwh, diffKwh: monthDiff, lossPercent: monthLossPercent };
    });
  }, [isHydrated, region, trendAppKwh]);

  const hasInput = generatedKwh.trim() !== "";
  const reportedAmount = appCalculatedKwh * MONEY_RATE_PER_KWH;
  const actualAmount = Number(generatedKwh || "0") * MONEY_RATE_PER_KWH;
  const moneyGap = actualAmount - reportedAmount;

  const moneyComparisonData = useMemo(
    () => [
      { metric: "Actual (manual)", amount: actualAmount, color: "#0f766e" },
      { metric: "Reported (app)", amount: reportedAmount, color: "#2563eb" },
      { metric: "Money gap", amount: moneyGap, color: "#b91c1c" },
    ],
    [actualAmount, reportedAmount, moneyGap]
  );

  return (
    <AppShell
      title="Actual vs Reported"
      subtitle="Manual monthly generated kWh input with kWh and money comparison graphs"
      navItems={managerNavItems}
    >
      <Link href="/manager/reports" className="back-link">
        ← Back to Reports
      </Link>
      <div className="card">
        <ReportScopeFilters
          idPrefix="loss-mrah"
          monthKey={monthKey}
          onMonthChange={setMonthKey}
          region={region}
          onRegionChange={setRegion}
        />
        <div style={{ marginTop: 8 }}>
          <ReportScopeLabel monthKey={monthKey} region={region} />
        </div>
      </div>
      <div className="card">
        <label htmlFor="mrah-generated-kwh">
          Generated kWh (manual):{" "}
          <input
            id="mrah-generated-kwh"
            type="number"
            value={generatedKwh}
            onChange={(e) => setGeneratedKwh(e.target.value)}
            disabled={validated}
          />
        </label>
        {hasInput ? (
          <p style={{ color: "var(--success)" }}>Monthly generator input received.</p>
        ) : (
          <p style={{ color: "var(--warning)" }}>Reminder: monthly generator input is missing.</p>
        )}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            className="success-btn"
            onClick={() => setValidated(true)}
            disabled={!hasInput || validated}
            title={!hasInput ? "Enter generated kWh first" : "Validate and lock this value"}
          >
            {validated ? "Validated" : "Validate"}
          </button>
          <button
            type="button"
            className={validated ? "warning-btn" : ""}
            onClick={() => setValidated(false)}
            disabled={!hasInput}
          >
            Modify
          </button>
        </div>
        {validated && (
          <p className="muted" style={{ marginBottom: 0 }}>
            Validated input is locked (grey). Use Modify to unlock and edit.
          </p>
        )}
      </div>

      <div className="card">
        <h3>Current Month Snapshot</h3>
        <table>
          <thead>
            <tr>
              <th>Metric</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Generated (manual)</td>
              <td>{Number(generatedKwh || "0").toLocaleString()} kWh</td>
            </tr>
            <tr>
              <td>App calculated</td>
              <td>{appCalculatedKwh.toLocaleString()} kWh</td>
            </tr>
            <tr>
              <td>kWh Difference</td>
              <td>{diff.toLocaleString()} kWh</td>
            </tr>
            <tr>
              <td>Loss %</td>
              <td>{lossPercent}%</td>
            </tr>
            <tr>
              <td>Actual amount (manual)</td>
              <td>{actualAmount.toLocaleString()} LBP</td>
            </tr>
            <tr>
              <td>Reported amount (app)</td>
              <td>{reportedAmount.toLocaleString()} LBP</td>
            </tr>
            <tr>
              <td>Money gap</td>
              <td>{moneyGap.toLocaleString()} LBP</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3>Graph 1: Generated kWh vs App Total kWh</h3>
        <div style={{ width: "100%", height: 320 }}>
          <ResponsiveContainer>
            <BarChart data={comparisonChartData} margin={{ top: 12, right: 24, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="metric" />
              <YAxis />
              <Tooltip formatter={(value) => `${Number(value).toLocaleString()} kWh`} />
              <Legend />
              <Bar dataKey="kwh" name="kWh" radius={[8, 8, 0, 0]}>
                {comparisonChartData.map((entry) => (
                  <Cell key={entry.metric} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card">
        <h3>Graph 2: Monthly Loss Analysis (Old Months)</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          Shows loss trend by month. Add/validate generated kWh for each month to build this history.
        </p>
        <div style={{ width: "100%", height: 340 }}>
          <ResponsiveContainer>
            <LineChart data={monthlyLossTrendData} margin={{ top: 12, right: 24, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis yAxisId="left" />
              <YAxis yAxisId="right" orientation="right" unit="%" />
              <Tooltip
                formatter={(value, name) =>
                  name === "Loss %"
                    ? `${Number(value).toFixed(2)}%`
                    : `${Number(value).toLocaleString()} kWh`
                }
              />
              <Legend />
              <Bar yAxisId="left" dataKey="diffKwh" name="kWh Difference" fill="#dc2626" radius={[8, 8, 0, 0]} />
              <Line yAxisId="right" type="monotone" dataKey="lossPercent" name="Loss %" stroke="#f59e0b" strokeWidth={3} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="card">
        <h3>Graph 3: Money Difference / Loss</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          Compares actual (manual) vs reported (app) amounts and highlights the money gap.
        </p>
        <div style={{ width: "100%", height: 320 }}>
          <ResponsiveContainer>
            <BarChart data={moneyComparisonData} margin={{ top: 12, right: 24, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="metric" />
              <YAxis />
              <Tooltip formatter={(value) => `${Number(value).toLocaleString()} LBP`} />
              <Legend />
              <Bar dataKey="amount" name="Amount (LBP)" radius={[8, 8, 0, 0]}>
                {moneyComparisonData.map((entry) => (
                  <Cell key={entry.metric} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </AppShell>
  );
}

export default function LossMrahPage() {
  return (
    <Suspense fallback={<div className="card">Loading report...</div>}>
      <LossMrahReportContent />
    </Suspense>
  );
}
