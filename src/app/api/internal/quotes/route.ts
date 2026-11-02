import { z } from "zod";
import { fail, handle, ok, parseBody } from "@/lib/api";
import { prisma } from "@/lib/prisma";

/**
 * Internal endpoint for the optional PulseFeed service: it pushes the
 * quotes it fetched so the app's QuoteSnapshot table (the source of truth
 * for every page) stays fresh without the web process polling the
 * provider itself. Protected by CRON_SECRET.
 */
const schema = z.object({
  provider: z.string().min(1).max(40),
  dataStatus: z.enum(["LIVE", "DELAYED", "END_OF_DAY", "CACHED", "DEMO"]),
  quotes: z
    .array(
      z.object({
        instrumentId: z.string().min(1),
        price: z.string().regex(/^\d+(\.\d+)?$/),
        previousClose: z.string().regex(/^\d+(\.\d+)?$/).nullable(),
        volume: z.string().regex(/^\d+$/).nullable(),
        quoteTimestamp: z.string().datetime(),
      }),
    )
    .max(500),
});

export const POST = handle(async (req) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return fail(401, "UNAUTHENTICATED", "Missing or wrong CRON_SECRET.");
  const body = await parseBody(req, schema);
  const known = new Set((await prisma.instrument.findMany({ where: { id: { in: body.quotes.map((q) => q.instrumentId) } }, select: { id: true } })).map((i) => i.id));
  let upserted = 0;
  for (const q of body.quotes) {
    if (!known.has(q.instrumentId)) continue;
    const price = Number(q.price);
    const prev = q.previousClose === null ? null : Number(q.previousClose);
    const dayChange = prev === null ? null : (price - prev).toFixed(4);
    const dayChangePercent = prev === null || prev === 0 ? null : (((price - prev) / prev) * 100).toFixed(4);
    const data = { price: q.price, previousClose: q.previousClose, dayChange, dayChangePercent, volume: q.volume === null ? null : BigInt(q.volume), quoteTimestamp: new Date(q.quoteTimestamp), fetchedAt: new Date(), provider: body.provider, dataStatus: body.dataStatus };
    await prisma.quoteSnapshot.upsert({ where: { instrumentId: q.instrumentId }, create: { instrumentId: q.instrumentId, ...data }, update: data });
    upserted++;
  }
  return ok({ upserted, ignored: body.quotes.length - upserted });
});
