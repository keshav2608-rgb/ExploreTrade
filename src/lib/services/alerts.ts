/**
 * Price alerts and notifications (SRS §6.7).
 *
 * `runAlertCheck` is what the scheduled worker calls: it refreshes quotes
 * for every instrument with an enabled alert, evaluates each alert with
 * the pure rule in lib/alerts.ts, and writes a notification only on a new
 * crossing.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { HttpError } from "../errors";
import { alertMessage, evaluateAlert, type AlertCondition } from "../alerts";
import { getQuotes, refreshQuotes } from "../market-data";
import { recordValuation } from "./portfolio";

const include = { instrument: { select: { id: true, symbol: true, companyName: true, exchange: true, providerInstrumentId: true } } } as const;
export type AlertRow = Prisma.PriceAlertGetPayload<{ include: typeof include }>;

export async function listAlerts(userId: string) {
  const alerts = await prisma.priceAlert.findMany({ where: { userId }, include, orderBy: { createdAt: "desc" } });
  const { quotes } = await getQuotes(alerts.map((a) => a.instrument));
  return alerts.map((a) => ({ ...a, quote: quotes.get(a.instrumentId) ?? null }));
}

export async function createAlert(userId: string, input: { instrumentId: string; condition: AlertCondition; thresholdPrice: string }): Promise<AlertRow> {
  const instrument = await prisma.instrument.findFirst({ where: { id: input.instrumentId, isActive: true } });
  if (!instrument) throw new HttpError(400, "VALIDATION", "Choose a supported stock.", { instrumentId: "Unknown stock" });
  return prisma.priceAlert.create({ data: { userId, instrumentId: input.instrumentId, condition: input.condition, thresholdPrice: input.thresholdPrice }, include });
}

export async function updateAlert(userId: string, id: string, input: { condition?: AlertCondition; thresholdPrice?: string; isEnabled?: boolean }): Promise<AlertRow> {
  const existing = await prisma.priceAlert.findFirst({ where: { id, userId } });
  if (!existing) throw new HttpError(404, "NOT_FOUND", "Alert not found.");
  // Changing the rule re-arms the alert so the new rule can fire.
  const rearm = input.condition !== undefined || input.thresholdPrice !== undefined;
  return prisma.priceAlert.update({ where: { id }, data: { ...input, ...(rearm ? { isTriggered: false } : {}) }, include });
}

export async function deleteAlert(userId: string, id: string): Promise<void> {
  const r = await prisma.priceAlert.deleteMany({ where: { id, userId } });
  if (r.count === 0) throw new HttpError(404, "NOT_FOUND", "Alert not found.");
}

export async function listNotifications(userId: string, page = 1, pageSize = 25) {
  const [rows, total, unread] = await prisma.$transaction([
    prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.notification.count({ where: { userId } }),
    prisma.notification.count({ where: { userId, isRead: false } }),
  ]);
  return { rows, total, unread, page, pageSize };
}

export async function markNotification(userId: string, id: string, isRead: boolean) {
  const r = await prisma.notification.updateMany({ where: { id, userId }, data: { isRead } });
  if (r.count === 0) throw new HttpError(404, "NOT_FOUND", "Notification not found.");
}

export async function markAllRead(userId: string) {
  await prisma.notification.updateMany({ where: { userId, isRead: false }, data: { isRead: true } });
}

export interface AlertCheckResult {
  checked: number;
  fired: number;
  reset: number;
  quotesRefreshed: number;
  refreshError: string | null;
  valuationsRecorded: number;
}

/**
 * One scheduled pass (FR-ALT-04). `quoteOverride` lets tests and the demo
 * inject a controlled price for an instrument without touching the
 * provider ("use a controlled test quote to trigger the alert", SRS §19).
 */
export async function runAlertCheck(opts: { quoteOverride?: Map<string, string>; recordValuations?: boolean } = {}): Promise<AlertCheckResult> {
  const alerts = await prisma.priceAlert.findMany({ where: { isEnabled: true }, include });
  const instruments = new Map(alerts.map((a) => [a.instrumentId, a.instrument]));
  const { refreshed, error } = await refreshQuotes([...instruments.values()]);
  const snapshots = await prisma.quoteSnapshot.findMany({ where: { instrumentId: { in: [...instruments.keys()] } } });
  const prices = new Map(snapshots.map((s) => [s.instrumentId, { price: s.price.toString(), status: s.dataStatus }]));
  for (const [id, p] of opts.quoteOverride ?? []) prices.set(id, { price: p, status: "TEST" });

  let fired = 0;
  let reset = 0;
  for (const a of alerts) {
    const q = prices.get(a.instrumentId);
    if (!q) continue; // no quote: cannot evaluate, never assume
    const decision = evaluateAlert({ condition: a.condition as AlertCondition, thresholdPrice: a.thresholdPrice.toString(), isEnabled: a.isEnabled, isTriggered: a.isTriggered }, q.price);
    if (decision.isTriggered === a.isTriggered && !decision.fire) continue;
    await prisma.$transaction(async (tx) => {
      await tx.priceAlert.update({ where: { id: a.id }, data: { isTriggered: decision.isTriggered, ...(decision.fire ? { lastTriggeredAt: new Date() } : {}) } });
      if (decision.fire) {
        await tx.notification.create({
          data: {
            userId: a.userId,
            alertId: a.id,
            type: "ALERT_TRIGGERED",
            title: `${a.instrument.symbol} ${a.condition === "ABOVE" ? "above" : "below"} ₹${a.thresholdPrice.toFixed(2)}`,
            message: alertMessage(a.instrument.symbol, a.condition as AlertCondition, a.thresholdPrice.toString(), q.price, q.status),
          },
        });
      }
    });
    if (decision.fire) fired++;
    else reset++;
  }

  let valuationsRecorded = 0;
  if (opts.recordValuations) {
    const users = await prisma.user.findMany({ select: { id: true }, where: { transactions: { some: {} } } });
    for (const u of users) {
      await recordValuation(u.id);
      valuationsRecorded++;
    }
  }
  return { checked: alerts.length, fired, reset, quotesRefreshed: refreshed, refreshError: error, valuationsRecorded };
}
