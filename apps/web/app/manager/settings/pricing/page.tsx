"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "../../../_components/app-shell";
import { managerNavItems } from "../../../_components/role-nav";

type AmpereTier = {
  amp: number;
  price: number;
};

type MonthlyTariff = {
  monthKey: string;
  kwhPrice: number;
};

const MONTH_KEY_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function currentMonthKey() {
  return new Date().toISOString().slice(0, 7);
}

export default function ManagerPricingSettingsPage() {
  const [ampereTiers, setAmpereTiers] = useState<AmpereTier[]>([]);
  const [newAmp, setNewAmp] = useState("");
  const [newAmpPrice, setNewAmpPrice] = useState("");

  const [tariffMonth, setTariffMonth] = useState(currentMonthKey());
  const [tariffPrice, setTariffPrice] = useState("");
  const [monthlyTariffs, setMonthlyTariffs] = useState<MonthlyTariff[]>([]);

  const [loading, setLoading] = useState(true);
  const [ampereSaving, setAmpereSaving] = useState(false);
  const [tariffSaving, setTariffSaving] = useState(false);
  const [banner, setBanner] = useState("");
  const [error, setError] = useState("");

  const sortedAmpereTiers = useMemo(() => [...ampereTiers].sort((a, b) => a.amp - b.amp), [ampereTiers]);
  const sortedMonthlyTariffs = useMemo(
    () => [...monthlyTariffs].sort((a, b) => b.monthKey.localeCompare(a.monthKey)),
    [monthlyTariffs]
  );

  async function loadPricing() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/settings/pricing");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Failed to load pricing.");
      setAmpereTiers(data.ampereTiers ?? []);
      setMonthlyTariffs(data.monthlyTariffs ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load pricing.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPricing();
  }, []);

  function handleAddTier() {
    const amp = Number(newAmp);
    const price = Number(newAmpPrice);
    if (!Number.isFinite(amp) || amp <= 0 || !Number.isFinite(price) || price < 0) return;
    setAmpereTiers((prev) => {
      if (prev.some((tier) => tier.amp === amp)) return prev;
      return [...prev, { amp, price }];
    });
    setNewAmp("");
    setNewAmpPrice("");
  }

  function handleRemoveTier(amp: number) {
    setAmpereTiers((prev) => prev.filter((tier) => tier.amp !== amp));
  }

  function handleTierPriceChange(amp: number, price: string) {
    const parsed = Number(price);
    setAmpereTiers((prev) =>
      prev.map((tier) => (tier.amp === amp ? { ...tier, price: Number.isFinite(parsed) ? parsed : tier.price } : tier))
    );
  }

  async function handleSaveAmpereTiers() {
    setAmpereSaving(true);
    setError("");
    setBanner("");
    try {
      const response = await fetch("/api/settings/pricing/ampere-tiers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tiers: ampereTiers })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Failed to save ampere prices.");
      setBanner("Ampere prices saved. This only affects future approvals — already-approved bills keep the price they were approved with.");
      await loadPricing();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save ampere prices.");
    } finally {
      setAmpereSaving(false);
    }
  }

  async function handleMonthlyTariffSave() {
    setError("");
    setBanner("");
    if (!MONTH_KEY_RE.test(tariffMonth)) {
      setError("Month must be in YYYY-MM format.");
      return;
    }
    const price = Number(tariffPrice);
    if (!Number.isFinite(price) || price <= 0) {
      setError("kWh price must be a positive number.");
      return;
    }
    setTariffSaving(true);
    try {
      const response = await fetch("/api/settings/pricing/kwh-tariff", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monthKey: tariffMonth, kwhPrice: price })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Failed to save monthly tariff.");
      setBanner(`kWh price for ${tariffMonth} saved. Batches for that month can now be approved.`);
      setTariffPrice("");
      await loadPricing();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save monthly tariff.");
    } finally {
      setTariffSaving(false);
    }
  }

  return (
    <AppShell
      title="Numbers and Prices"
      subtitle="Configure pricing values used by billing calculations"
      navItems={managerNavItems}
    >
      <Link href="/manager/settings" className="back-link">
        ← Back to Settings
      </Link>

      {banner ? <p className="muted" role="status">{banner}</p> : null}
      {error ? <p style={{ color: "var(--danger)" }} role="alert">{error}</p> : null}
      {loading ? <p className="muted">Loading current pricing…</p> : null}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Ampere Prices (LBP)</h3>
        <p className="muted">
          Each amperage tier has a fixed price, used for amp-only and combined billing. These are the
          <em> current</em> prices — there&apos;s no monthly re-entry needed. Editing a price here only affects batches
          approved after the change; every already-approved bill keeps the price it was approved with, permanently.
        </p>
        <table>
          <thead>
            <tr>
              <th>Amp (A)</th>
              <th>Price (LBP)</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sortedAmpereTiers.map((tier) => (
              <tr key={tier.amp}>
                <td>{tier.amp}</td>
                <td>
                  <input
                    type="number"
                    value={tier.price}
                    onChange={(e) => handleTierPriceChange(tier.amp, e.target.value)}
                  />
                </td>
                <td>
                  <button type="button" className="danger-btn" onClick={() => handleRemoveTier(tier.amp)}>
                    ×
                  </button>
                </td>
              </tr>
            ))}
            <tr>
              <td>
                <input type="number" placeholder="Amp" value={newAmp} onChange={(e) => setNewAmp(e.target.value)} />
              </td>
              <td>
                <input
                  type="number"
                  placeholder="Price (LBP)"
                  value={newAmpPrice}
                  onChange={(e) => setNewAmpPrice(e.target.value)}
                />
              </td>
              <td>
                <button type="button" className="success-btn" onClick={handleAddTier}>
                  + Add tier
                </button>
              </td>
            </tr>
          </tbody>
        </table>
        <div className="card-actions-right">
          <button type="button" onClick={handleSaveAmpereTiers} disabled={ampereSaving}>
            {ampereSaving ? "Saving…" : "Save Ampere Prices"}
          </button>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Monthly kWh Tariff</h3>
        <p className="muted">
          Set once the real fuel-cost price for a month is known. A batch for that month can only be approved once
          its price is set here — this is deliberate: if readings come in before the new price is confirmed, the
          batch simply waits in review rather than getting priced with a stale or guessed number.
        </p>
        <div className="filters-grid filters-grid-pro">
          <label htmlFor="monthly-tariff-month">
            Month (YYYY-MM)
            <input
              id="monthly-tariff-month"
              type="text"
              placeholder="2026-06"
              value={tariffMonth}
              onChange={(e) => setTariffMonth(e.target.value)}
            />
          </label>
          <label htmlFor="monthly-tariff-price">
            Price per kWh
            <input
              id="monthly-tariff-price"
              type="number"
              value={tariffPrice}
              onChange={(e) => setTariffPrice(e.target.value)}
            />
          </label>
        </div>
        <div className="card-actions-right">
          <button type="button" className="success-btn" onClick={handleMonthlyTariffSave} disabled={tariffSaving}>
            {tariffSaving ? "Saving…" : "Save Monthly Tariff"}
          </button>
        </div>

        <h4 style={{ marginBottom: 8 }}>Saved monthly tariffs</h4>
        <table>
          <thead>
            <tr>
              <th>Month</th>
              <th>kWh Price (LBP)</th>
            </tr>
          </thead>
          <tbody>
            {sortedMonthlyTariffs.length === 0 ? (
              <tr>
                <td colSpan={2} className="muted">
                  No monthly tariffs set yet.
                </td>
              </tr>
            ) : (
              sortedMonthlyTariffs.map((row) => (
                <tr key={row.monthKey}>
                  <td>{row.monthKey}</td>
                  <td>{row.kwhPrice.toLocaleString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
