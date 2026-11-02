/**
 * Market-data service: the only module the rest of the app talks to for
 * prices. It picks the provider from MARKET_DATA_PROVIDER, caches quotes in
 * the QuoteSnapshot table with timestamps, and applies the failure rules
 * from SRS §13.3:
 *
 *  - a failed refresh keeps the last stored quote (FR-DATA-04);
 *  - a stored quote older than QUOTE_FRESHNESS_MINUTES is returned with
 *    `isStale: true` and its original status, never relabelled (FR-DATA-03);
 *  - a 429 from the provider pauses refreshes for a cool-down instead of
 *    hammering it (FR-DATA-06);
 *  - a quote that cannot be obtained at all is `null`, never zero.
 */
import { prisma } from "../prisma";
import { D } from "../money";
import type { QuoteInput } from "../portfolio";
import { DemoProvider } from "./demo";
import { YahooProvider } from "./yahoo";
import { type HistoryRange, type MarketDataProvider, type ProviderCandle, type ProviderIndexQuote, RateLimitedError } from "./types";

let providerSingleton: MarketDataProvider | null = null;

export function getProvider(): MarketDataProvider {
  if (providerSingleton) return providerSingleton;
  const name = (process.env.MARKET_DATA_PROVIDER ?? "demo").toLowerCase();
  providerSingleton = name === "yahoo" ? new YahooProvider() : new DemoProvider();
  return providerSingleton;
}

/** For tests: swap the provider. */
export function setProviderForTests(p: MarketDataProvider | null) {
  providerSingleton = p;
}

export function freshnessLimitMs(): number {
  const minutes = Number(process.env.QUOTE_FRESHNESS_MINUTES ?? 20);
  return (Number.isFinite(minutes) && minutes > 0 ? minutes : 20) * 60_000;
}

/** Rate-limit cool-down shared by the whole process. */
let pausedUntil = 0;
export function providerPausedUntil(): number {
  return pausedUntil;
}

export interface StoredQuote extends Omit<QuoteInput, "price" | "previousClose"> {
  instrumentId: string;
  price: string;
  previousClose: string | null;
  fetchedAt: Date;
  dayChange: string | null;
  dayChangePercent: string | null;
  volume: bigint | null;
}

type SnapshotRow = {
  instrumentId: string;
  price: { toString(): string };
  previousClose: { toString(): string } | null;
  dayChange: { toString(): string } | null;
  dayChangePercent: { toString(): string } | null;
  volume: bigint | null;
  quoteTimestamp: Date;
  fetchedAt: Date;
  provider: string;
  dataStatus: string;
};

function toStored(row: SnapshotRow, now: number): StoredQuote {
  return {
    instrumentId: row.instrumentId,
    price: row.price.toString(),
    previousClose: row.previousClose?.toString() ?? null,
    dayChange: row.dayChange?.toString() ?? null,
    dayChangePercent: row.dayChangePercent?.toString() ?? null,
    volume: row.volume,
    quoteTimestamp: row.quoteTimestamp,
    fetchedAt: row.fetchedAt,
    provider: row.provider,
    dataStatus: row.dataStatus,
    isStale: now - row.fetchedAt.getTime() > freshnessLimitMs(),
  };
}

/**
 * Refresh quotes for the given instruments from the provider and upsert
 * them. Returns the number refreshed. Errors are swallowed after being
 * recorded (the caller falls back to stored quotes).
 */
export async function refreshQuotes(instruments: Array<{ id: string; providerInstrumentId: string | null }>): Promise<{ refreshed: number; error: string | null }> {
  const now = Date.now();
  if (now < pausedUntil) return { refreshed: 0, error: `Provider paused until ${new Date(pausedUntil).toISOString()} after a rate limit` };
  const targets = instruments.filter((i) => i.providerInstrumentId);
  if (targets.length === 0) return { refreshed: 0, error: null };
  const provider = getProvider();
  try {
    const quotes = await provider.getQuotes(targets.map((t) => t.providerInstrumentId!));
    let refreshed = 0;
    for (const t of targets) {
      const q = quotes.get(t.providerInstrumentId!);
      if (!q) continue;
      await prisma.quoteSnapshot.upsert({
        where: { instrumentId: t.id },
        create: {
          instrumentId: t.id,
          price: q.price,
          previousClose: q.previousClose,
          dayChange: q.dayChange,
          dayChangePercent: q.dayChangePercent,
          volume: q.volume,
          quoteTimestamp: q.quoteTimestamp,
          fetchedAt: new Date(),
          provider: q.provider,
          dataStatus: q.dataStatus,
        },
        update: {
          price: q.price,
          previousClose: q.previousClose,
          dayChange: q.dayChange,
          dayChangePercent: q.dayChangePercent,
          volume: q.volume,
          quoteTimestamp: q.quoteTimestamp,
          fetchedAt: new Date(),
          provider: q.provider,
          dataStatus: q.dataStatus,
        },
      });
      refreshed++;
    }
    return { refreshed, error: null };
  } catch (e) {
    if (e instanceof RateLimitedError) {
      pausedUntil = Date.now() + (e.retryAfterSeconds ?? 300) * 1000;
    }
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[market-data] refresh failed: ${msg}`);
    return { refreshed: 0, error: msg };
  }
}

/**
 * Quotes for instruments, refreshing any that are missing or stale first.
 * Always returns whatever is stored, even when the refresh failed.
 */
export async function getQuotes(instruments: Array<{ id: string; providerInstrumentId: string | null }>): Promise<{ quotes: Map<string, StoredQuote>; refreshError: string | null }> {
  const ids = instruments.map((i) => i.id);
  const now = Date.now();
  const existing = await prisma.quoteSnapshot.findMany({ where: { instrumentId: { in: ids } } });
  const fresh = new Set(existing.filter((r) => now - r.fetchedAt.getTime() <= freshnessLimitMs()).map((r) => r.instrumentId));
  const needRefresh = instruments.filter((i) => !fresh.has(i.id));
  let refreshError: string | null = null;
  if (needRefresh.length > 0) {
    refreshError = (await refreshQuotes(needRefresh)).error;
  }
  const rows = needRefresh.length > 0 ? await prisma.quoteSnapshot.findMany({ where: { instrumentId: { in: ids } } }) : existing;
  const quotes = new Map<string, StoredQuote>();
  const after = Date.now();
  for (const r of rows) quotes.set(r.instrumentId, toStored(r, after));
  return { quotes, refreshError };
}

export async function getQuote(instrument: { id: string; providerInstrumentId: string | null }): Promise<{ quote: StoredQuote | null; refreshError: string | null }> {
  const { quotes, refreshError } = await getQuotes([instrument]);
  return { quote: quotes.get(instrument.id) ?? null, refreshError };
}

/** Historical closes straight from the provider (not persisted in the MVP). */
export async function getHistory(instrument: { providerInstrumentId: string | null }, range: HistoryRange): Promise<{ candles: ProviderCandle[]; error: string | null; status: string }> {
  const provider = getProvider();
  if (!instrument.providerInstrumentId) return { candles: [], error: "No provider mapping for this instrument", status: provider.defaultStatus };
  if (Date.now() < pausedUntil) return { candles: [], error: "Provider paused after a rate limit", status: provider.defaultStatus };
  try {
    const candles = await provider.getHistory(instrument.providerInstrumentId, range);
    return { candles, error: null, status: provider.defaultStatus };
  } catch (e) {
    if (e instanceof RateLimitedError) pausedUntil = Date.now() + 300_000;
    return { candles: [], error: e instanceof Error ? e.message : String(e), status: provider.defaultStatus };
  }
}

export async function getIndices(): Promise<{ indices: ProviderIndexQuote[]; error: string | null }> {
  if (Date.now() < pausedUntil) return { indices: [], error: "Provider paused after a rate limit" };
  try {
    return { indices: await getProvider().getIndices(), error: null };
  } catch (e) {
    if (e instanceof RateLimitedError) pausedUntil = Date.now() + 300_000;
    return { indices: [], error: e instanceof Error ? e.message : String(e) };
  }
}

/** Convert a stored quote into the shape the portfolio maths expects. */
export function toQuoteInput(q: StoredQuote): QuoteInput {
  return { price: D(q.price), previousClose: q.previousClose === null ? null : D(q.previousClose), quoteTimestamp: q.quoteTimestamp, dataStatus: q.dataStatus, provider: q.provider, isStale: q.isStale };
}
