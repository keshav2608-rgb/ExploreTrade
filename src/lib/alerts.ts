/**
 * Price-alert evaluation (SRS §6.7). Pure logic, unit-tested.
 *
 * Repeat-trigger rule (FR-ALT-07): an alert fires when its condition
 * becomes true while `isTriggered` is false. While the condition stays
 * true the alert remains `isTriggered` and does not fire again. When the
 * price crosses back to the other side, `isTriggered` resets so a later
 * crossing fires a new notification. The user can also re-arm by editing
 * the alert.
 */
import { Decimal, D } from "./money";

export type AlertCondition = "ABOVE" | "BELOW";

export interface AlertState {
  condition: AlertCondition;
  thresholdPrice: Decimal.Value;
  isEnabled: boolean;
  isTriggered: boolean;
}

export interface AlertDecision {
  /** Create a notification now. */
  fire: boolean;
  /** New value for `isTriggered` to persist. */
  isTriggered: boolean;
}

/** Is the condition satisfied by this price? */
export function conditionMet(condition: AlertCondition, threshold: Decimal.Value, price: Decimal.Value): boolean {
  const p = D(price);
  const t = D(threshold);
  return condition === "ABOVE" ? p.gt(t) : p.lt(t);
}

export function evaluateAlert(alert: AlertState, price: Decimal.Value): AlertDecision {
  if (!alert.isEnabled) return { fire: false, isTriggered: alert.isTriggered };
  const met = conditionMet(alert.condition, alert.thresholdPrice, price);
  if (met && !alert.isTriggered) return { fire: true, isTriggered: true };
  if (!met && alert.isTriggered) return { fire: false, isTriggered: false };
  return { fire: false, isTriggered: alert.isTriggered };
}

/** Human-readable text for the notification. */
export function alertMessage(symbol: string, condition: AlertCondition, threshold: Decimal.Value, price: Decimal.Value, status: string): string {
  const dir = condition === "ABOVE" ? "rose above" : "fell below";
  return `${symbol} ${dir} ₹${D(threshold).toFixed(2)}: latest quote ₹${D(price).toFixed(2)} (${status.toLowerCase()} data). Alert checks depend on quote availability and the polling interval.`;
}
