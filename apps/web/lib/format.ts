/**
 * Number display helpers. One place so every screen groups digits the same way:
 * a plain space every 3 digits (1234567 -> "1 234 567"), never a "$", and LBP
 * amounts with no minor unit (Lebanon doesn't bill fractions of a pound).
 */

export function formatNumber(value: number | null | undefined, opts?: { maxDecimals?: number }): string {
  const n = Number.isFinite(Number(value)) ? Number(value) : 0;
  const maxDecimals = opts?.maxDecimals ?? 0;
  const fixed = n.toFixed(maxDecimals);
  const negative = fixed.startsWith("-");
  const [intPart, decPart = ""] = (negative ? fixed.slice(1) : fixed).split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const trimmedDec = decPart.replace(/0+$/, "");
  return `${negative ? "-" : ""}${grouped}${trimmedDec ? `.${trimmedDec}` : ""}`;
}

/** Money, always LBP: 1234567 -> "1 234 567 LBP". */
export function formatLbp(value: number | null | undefined): string {
  return `${formatNumber(value)} LBP`;
}

/** Energy: 5443.2 -> "5 443.2 kWh" (one decimal, trailing zero dropped). */
export function formatKwh(value: number | null | undefined): string {
  return `${formatNumber(value, { maxDecimals: 1 })} kWh`;
}
