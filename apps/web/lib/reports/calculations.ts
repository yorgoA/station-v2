export type AmpereTier = { amp: number; price: number };

export const AMPERE_PRICE_TIERS: AmpereTier[] = [
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

const MONTHLY_KWH_TARIFFS: Record<string, number> = {
  "2026-05": 54335,
  "2026-04": 54335,
  "2026-03": 44638,
  "2026-02": 33268,
};

const FALLBACK_KWH_PRICE = 54335;

export function getKwhPriceForMonth(monthKey: string): number {
  return MONTHLY_KWH_TARIFFS[monthKey] ?? FALLBACK_KWH_PRICE;
}

export function getAmperePriceForTier(subscribedAmpere: number): number {
  if (!AMPERE_PRICE_TIERS.length) return 0;
  const sorted = [...AMPERE_PRICE_TIERS].sort((a, b) => a.amp - b.amp);
  const exact = sorted.find((tier) => tier.amp === subscribedAmpere);
  if (exact) return exact.price;
  const lower = sorted.filter((tier) => tier.amp <= subscribedAmpere);
  return lower.length > 0 ? lower[lower.length - 1].price : sorted[0].price;
}
