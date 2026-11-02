import { fail, handle, ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { replayPosition, type TxInput } from "@/lib/portfolio";

/**
 * Internal endpoint for the optional PulseFeed service: the supported
 * instrument universe plus every user's open positions (quantity and
 * remaining cost basis only). Protected by CRON_SECRET; never exposed to
 * browsers. No emails, names or transaction details leave the app.
 */
export const GET = handle(async (req) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return fail(401, "UNAUTHENTICATED", "Missing or wrong CRON_SECRET.");

  const instruments = await prisma.instrument.findMany({ where: { isActive: true }, select: { id: true, symbol: true, providerInstrumentId: true } });
  const txs = await prisma.transaction.findMany({ select: { id: true, userId: true, instrumentId: true, type: true, tradeDate: true, quantity: true, pricePerShare: true, charges: true, createdAt: true } });

  const byKey = new Map<string, TxInput[]>();
  for (const t of txs) {
    const k = `${t.userId}|${t.instrumentId}`;
    const list = byKey.get(k) ?? [];
    list.push({ id: t.id, instrumentId: t.instrumentId, type: t.type as "BUY" | "SELL", tradeDate: t.tradeDate, quantity: t.quantity.toString(), pricePerShare: t.pricePerShare.toString(), charges: t.charges.toString(), createdAt: t.createdAt });
    byKey.set(k, list);
  }
  const positions: Array<{ userId: string; instrumentId: string; quantity: string; costBasis: string }> = [];
  for (const [k, list] of byKey) {
    const [userId, instrumentId] = k.split("|");
    try {
      const pos = replayPosition(list);
      if (pos.quantity.gt(0)) positions.push({ userId, instrumentId, quantity: pos.quantity.toString(), costBasis: pos.costBasis.toString() });
    } catch {
      // An inconsistent history is a data problem for that user, not a reason to fail the feed.
    }
  }
  return ok({ instruments, positions, generatedAt: new Date().toISOString() });
});
