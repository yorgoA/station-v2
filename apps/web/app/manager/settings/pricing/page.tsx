"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AppShell } from "../../../_components/app-shell";
import { managerNavItems } from "../../../_components/role-nav";

type AmpereTier = {
  amp: number;
  price: number;
};

type MonthlyTariff = {
  month: string;
  price: number;
};

const initialAmpereTiers: AmpereTier[] = [
  { amp: 3, price: 231000 },
  { amp: 4, price: 308000 },
  { amp: 5, price: 385000 },
  { amp: 6, price: 462000 },
  { amp: 7, price: 539000 },
  { amp: 10, price: 685000 },
  { amp: 15, price: 985000 },
  { amp: 16, price: 1062000 },
  { amp: 20, price: 1285000 },
  { amp: 25, price: 1585000 },
  { amp: 30, price: 1885000 },
  { amp: 32, price: 2039000 },
  { amp: 40, price: 2485000 },
  { amp: 48, price: 3016000 },
  { amp: 60, price: 3685000 },
  { amp: 63, price: 3865000 },
  { amp: 75, price: 4585000 },
  { amp: 120, price: 7285000 },
  { amp: 150, price: 9085000 },
  { amp: 180, price: 10885000 },
];

const initialMonthlyTariffs: MonthlyTariff[] = [
  { month: "2026-04", price: 54335 },
  { month: "2026-03", price: 44638 },
  { month: "2026-02", price: 33268 },
];

export default function ManagerPricingSettingsPage() {
  const [ampereTiers, setAmpereTiers] = useState<AmpereTier[]>(initialAmpereTiers);
  const [newAmp, setNewAmp] = useState("");
  const [newAmpPrice, setNewAmpPrice] = useState("");

  const [tariffMonth, setTariffMonth] = useState("2026-05");
  const [tariffPrice, setTariffPrice] = useState("54335");
  const [savedMonthlyTariffs, setSavedMonthlyTariffs] = useState<MonthlyTariff[]>(initialMonthlyTariffs);

  const [fallbackPrice, setFallbackPrice] = useState("54335");
  const [currency, setCurrency] = useState("LBP");

  const sortedAmpereTiers = useMemo(() => [...ampereTiers].sort((a, b) => a.amp - b.amp), [ampereTiers]);
  const sortedMonthlyTariffs = useMemo(
    () => [...savedMonthlyTariffs].sort((a, b) => b.month.localeCompare(a.month)),
    [savedMonthlyTariffs]
  );

  function handleAddTier() {
    const amp = Number(newAmp);
    const price = Number(newAmpPrice);
    if (!Number.isFinite(amp) || amp <= 0 || !Number.isFinite(price) || price <= 0) return;
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

  function handleMonthlyTariffSave() {
    const price = Number(tariffPrice);
    if (!Number.isFinite(price) || price <= 0) return;
    setSavedMonthlyTariffs((prev) => {
      const withoutMonth = prev.filter((row) => row.month !== tariffMonth);
      return [...withoutMonth, { month: tariffMonth, price }];
    });
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
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Ampere Prices (LBP)</h3>
        <p className="muted">Each amperage tier has a fixed price. Used for AMPERE_ONLY and BOTH billing types.</p>
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
                <td>{tier.price.toLocaleString()}</td>
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
          <button type="button">Save Ampere Prices</button>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Other Settings</h3>
        <p className="muted">Set monthly kWh tariffs and fallback values for months without specific entries.</p>

        <h4 style={{ marginBottom: 8 }}>Monthly kWh tariff</h4>
        <div className="filters-grid filters-grid-pro">
          <label htmlFor="monthly-tariff-month">
            Month
            <select id="monthly-tariff-month" value={tariffMonth} onChange={(e) => setTariffMonth(e.target.value)}>
              <option value="2026-05">May 2026</option>
              <option value="2026-04">April 2026</option>
              <option value="2026-03">March 2026</option>
              <option value="2026-02">February 2026</option>
            </select>
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
          <button type="button" className="success-btn" onClick={handleMonthlyTariffSave}>
            Save Monthly Tariff
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
            {sortedMonthlyTariffs.map((row) => (
              <tr key={row.month}>
                <td>{row.month}</td>
                <td>{row.price.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h4 style={{ marginBottom: 8 }}>Fallback (global) kWh price</h4>
        <p className="muted">Used only if a month has no monthly tariff entry.</p>
        <div className="filters-grid filters-grid-pro">
          <label htmlFor="fallback-kwh-price">
            Fallback Price per kWh
            <input
              id="fallback-kwh-price"
              type="number"
              value={fallbackPrice}
              onChange={(e) => setFallbackPrice(e.target.value)}
            />
          </label>
          <label htmlFor="settings-currency">
            Currency
            <select id="settings-currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
              <option value="LBP">LBP (Lebanese Pounds)</option>
              <option value="USD">USD (US Dollar)</option>
            </select>
          </label>
        </div>
        <div className="card-actions-right">
          <button type="button">Save Fallback Settings</button>
        </div>
      </div>
    </AppShell>
  );
}
