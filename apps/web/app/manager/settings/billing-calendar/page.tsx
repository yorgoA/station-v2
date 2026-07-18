"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "../../../_components/app-shell";
import { managerNavItems } from "../../../_components/role-nav";
import { CURRENT_MONTH_KEY } from "../../../../lib/constants/months";

type LockState = {
  isOpen: boolean;
  source: "manual_override" | "calendar_rule";
  unlockDateLabel: string;
};

export default function ManagerBillingCalendarSettingsPage() {
  const [monthKey, setMonthKey] = useState(CURRENT_MONTH_KEY);
  const [state, setState] = useState<LockState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function loadState() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/settings/billing-lock?month=${encodeURIComponent(monthKey)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Failed to load lock state.");
      setState(data as LockState);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load lock state.");
      setState(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthKey]);

  async function applyAction(action: "force_open" | "force_close" | "clear") {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/settings/billing-lock", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monthKey, action })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Failed to update lock state.");
      setState(data as LockState);
      setMessage(
        action === "force_open"
          ? `${monthKey} is now open for entry.`
          : action === "force_close"
            ? `${monthKey} is now locked for entry.`
            : `${monthKey} override cleared -- back to the default 27th-of-month rule.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update lock state.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell
      title="Billing Calendar"
      subtitle="Control which month employees can currently enter readings for"
      navItems={managerNavItems}
    >
      <Link href="/manager/settings" className="back-link">
        ← Back to Settings
      </Link>

      {message ? <p className="muted" role="status">{message}</p> : null}
      {error ? <p style={{ color: "var(--danger)" }} role="alert">{error}</p> : null}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Entry Window</h3>
        <p className="muted">
          By default a month opens for billing entry on its own 27th (e.g. July opens July 27th).
          Use this to force a month open earlier -- for testing, or any other exception -- or force
          it closed even after the 27th.
        </p>
        <div className="filters-grid filters-grid-pro">
          <label htmlFor="billing-calendar-month">
            Month
            <input
              id="billing-calendar-month"
              type="month"
              value={monthKey}
              onChange={(e) => setMonthKey(e.target.value)}
            />
          </label>
        </div>

        {loading ? (
          <p className="muted">Loading...</p>
        ) : state ? (
          <div className="card" style={{ background: "var(--panel-muted, #f8fafc)" }}>
            <p style={{ margin: 0 }}>
              <strong>{monthKey}</strong> is currently{" "}
              <strong style={{ color: state.isOpen ? "var(--success)" : "var(--danger)" }}>
                {state.isOpen ? "OPEN" : "LOCKED"}
              </strong>{" "}
              for entry.
            </p>
            <p className="muted" style={{ marginBottom: 0 }}>
              {state.source === "manual_override"
                ? "This is a manual override you set."
                : `Following the default rule (opens ${state.unlockDateLabel}).`}
            </p>
          </div>
        ) : null}

        <div className="card-actions-right" style={{ marginTop: 12 }}>
          <button type="button" className="success-btn" disabled={saving} onClick={() => applyAction("force_open")}>
            Force Open Now
          </button>
          <button type="button" className="danger-btn" disabled={saving} onClick={() => applyAction("force_close")}>
            Force Closed
          </button>
          <button type="button" disabled={saving} onClick={() => applyAction("clear")}>
            Clear Override (use default rule)
          </button>
        </div>
      </div>
    </AppShell>
  );
}
