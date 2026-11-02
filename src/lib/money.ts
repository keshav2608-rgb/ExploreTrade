/**
 * Money and quantity helpers.
 *
 * All arithmetic goes through decimal.js (SRS §7.10): JavaScript numbers
 * cannot represent 0.1 + 0.2 exactly, and a portfolio tracker that drifts
 * by a paisa per transaction is not trustworthy. Values are only converted
 * to `number` at the very end, for charts.
 *
 * Rounding happens at display time (`formatInr`, `formatQty`), never in
 * stored values.
 */
import Decimal from "decimal.js";

// 20 significant digits is plenty for INR amounts and share quantities.
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

export { Decimal };
export type DecimalInput = Decimal.Value;

export const D = (v: DecimalInput): Decimal => new Decimal(v);
export const ZERO = new Decimal(0);

/** Sum a list of decimals. */
export function sum(values: Iterable<DecimalInput>): Decimal {
  let acc = ZERO;
  for (const v of values) acc = acc.plus(v);
  return acc;
}

/**
 * Format an amount in rupees with the ₹ symbol and Indian digit grouping
 * (12,34,567.89). `signed` adds an explicit + so gains are never
 * colour-only.
 */
export function formatInr(value: DecimalInput, opts: { signed?: boolean; decimals?: number } = {}): string {
  const d = new Decimal(value);
  const decimals = opts.decimals ?? 2;
  const abs = d.abs().toFixed(decimals);
  const [intPart, fracPart] = abs.split(".");
  const grouped = groupIndian(intPart);
  const body = fracPart !== undefined ? `${grouped}.${fracPart}` : grouped;
  const sign = d.isNegative() ? "-" : opts.signed && d.gt(0) ? "+" : "";
  return `${sign}₹${body}`;
}

/** 1234567 -> "12,34,567" (last three digits, then groups of two). */
export function groupIndian(digits: string): string {
  if (digits.length <= 3) return digits;
  const last3 = digits.slice(-3);
  let rest = digits.slice(0, -3);
  const groups: string[] = [];
  while (rest.length > 2) {
    groups.unshift(rest.slice(-2));
    rest = rest.slice(0, -2);
  }
  if (rest) groups.unshift(rest);
  return `${groups.join(",")},${last3}`;
}

/** Percentage with sign, e.g. "+12.34%". */
export function formatPercent(value: DecimalInput | null, decimals = 2): string {
  if (value === null) return "—";
  const d = new Decimal(value);
  const sign = d.isNegative() ? "-" : d.gt(0) ? "+" : "";
  return `${sign}${d.abs().toFixed(decimals)}%`;
}

/** Share quantity: integers shown without decimals, fractions up to 4 dp. */
export function formatQty(value: DecimalInput): string {
  const d = new Decimal(value);
  return d.isInteger() ? d.toFixed(0) : d.toDecimalPlaces(4).toString();
}

/** Serialise a Decimal for JSON responses as a string (no precision loss). */
export function serializeDecimal(d: Decimal | null | undefined): string | null {
  return d === null || d === undefined ? null : d.toString();
}
