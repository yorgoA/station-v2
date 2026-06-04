"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { AppShell } from "../../../_components/app-shell";
import { managerNavItems } from "../../../_components/role-nav";

function LossPrintaniaReportContent() {
  const searchParams = useSearchParams();
  const monthKey = searchParams.get("month") ?? "2026-05";
  const region = searchParams.get("region") ?? "printania";
  const [generatedKwh, setGeneratedKwh] = useState("");
  const appCalculatedKwh = 96_792;

  const { diff, lossPercent } = useMemo(() => {
    const generated = Number(generatedKwh || "0");
    const difference = generated - appCalculatedKwh;
    const percent = generated > 0 ? ((difference / generated) * 100).toFixed(2) : "0.00";
    return { diff: difference, lossPercent: percent };
  }, [generatedKwh]);

  return (
    <AppShell
      title="Loss Report - Printania"
      subtitle="Manual monthly generated kWh input with 2 required graphs"
      navItems={managerNavItems}
    >
      <Link href="/manager/reports" className="back-link">
        ← Back to Reports
      </Link>
      <div className="card">
        <p className="muted" style={{ margin: 0 }}>
          Scope: <strong>{monthKey}</strong> / <strong>{region === "all" ? "All regions" : region}</strong>
        </p>
      </div>
      <div className="card">
        <label htmlFor="printania-generated-kwh">
          Generated kWh (manual):{" "}
          <input
            id="printania-generated-kwh"
            type="number"
            value={generatedKwh}
            onChange={(e) => setGeneratedKwh(e.target.value)}
          />
        </label>
        {generatedKwh.trim() === "" ? (
          <p style={{ color: "var(--warning)" }}>Reminder: monthly generator input is missing.</p>
        ) : (
          <p style={{ color: "var(--success)" }}>Monthly generator input received.</p>
        )}
      </div>

      <div className="card">
        <h3>Graph 1: Generated kWh vs App Total kWh</h3>
        <table>
          <thead>
            <tr>
              <th>Metric</th>
              <th>kWh</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Generated (manual)</td>
              <td>{Number(generatedKwh || "0").toLocaleString()}</td>
            </tr>
            <tr>
              <td>App calculated</td>
              <td>{appCalculatedKwh.toLocaleString()}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3>Graph 2: kWh Difference and Loss %</h3>
        <table>
          <thead>
            <tr>
              <th>Metric</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>kWh Difference</td>
              <td>{diff.toLocaleString()} kWh</td>
            </tr>
            <tr>
              <td>Loss %</td>
              <td>{lossPercent}%</td>
            </tr>
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}

export default function LossPrintaniaPage() {
  return (
    <Suspense fallback={<div className="card">Loading report...</div>}>
      <LossPrintaniaReportContent />
    </Suspense>
  );
}
