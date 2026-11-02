/** Watchlist service (SRS §6.5). All queries scoped by userId. */
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { HttpError } from "../errors";
import { getQuotes, type StoredQuote } from "../market-data";

const include = { instrument: { select: { id: true, symbol: true, companyName: true, exchange: true, sector: true, providerInstrumentId: true } } } as const;
export type WatchlistRow = Prisma.WatchlistItemGetPayload<{ include: typeof include }>;

export async function listWatchlist(userId: string): Promise<{ items: Array<WatchlistRow & { quote: StoredQuote | null }>; refreshError: string | null }> {
  const items = await prisma.watchlistItem.findMany({ where: { userId }, include, orderBy: { createdAt: "asc" } });
  const { quotes, refreshError } = await getQuotes(items.map((i) => i.instrument));
  return { items: items.map((i) => ({ ...i, quote: quotes.get(i.instrumentId) ?? null })), refreshError };
}

export async function addToWatchlist(userId: string, instrumentId: string): Promise<WatchlistRow> {
  const instrument = await prisma.instrument.findFirst({ where: { id: instrumentId, isActive: true } });
  if (!instrument) throw new HttpError(400, "VALIDATION", "Choose a supported stock.", { instrumentId: "Unknown stock" });
  // The unique index is the real guard; this gives a friendlier message.
  const dup = await prisma.watchlistItem.findUnique({ where: { userId_instrumentId: { userId, instrumentId } } });
  if (dup) throw new HttpError(409, "DUPLICATE", `${instrument.symbol} is already on your watchlist.`);
  return prisma.watchlistItem.create({ data: { userId, instrumentId }, include });
}

export async function removeFromWatchlist(userId: string, id: string): Promise<void> {
  const r = await prisma.watchlistItem.deleteMany({ where: { id, userId } });
  if (r.count === 0) throw new HttpError(404, "NOT_FOUND", "Watchlist entry not found.");
}

export async function isWatched(userId: string, instrumentId: string): Promise<string | null> {
  const row = await prisma.watchlistItem.findUnique({ where: { userId_instrumentId: { userId, instrumentId } } });
  return row?.id ?? null;
}
