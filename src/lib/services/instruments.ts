/** Instrument search, detail and market overview (SRS §6.2, §6.6). */
import { prisma } from "../prisma";
import { HttpError } from "../errors";
import { getHistory, getIndices, getQuote, getQuotes, type StoredQuote } from "../market-data";
import type { HistoryRange } from "../market-data/types";
import { D } from "../money";

export async function searchInstruments(q: string, limit = 12) {
  const term = q.trim();
  const where = term
    ? { isActive: true, OR: [{ symbol: { contains: term.toUpperCase() } }, { companyName: { contains: term } }] }
    : { isActive: true };
  const rows = await prisma.instrument.findMany({ where, orderBy: [{ symbol: "asc" }], take: limit, select: { id: true, symbol: true, companyName: true, exchange: true, sector: true } });
  // Prefer symbol prefix matches first, then name matches.
  const upper = term.toUpperCase();
  return rows.sort((a, b) => Number(b.symbol.startsWith(upper)) - Number(a.symbol.startsWith(upper)));
}

export async function getInstrument(id: string) {
  const i = await prisma.instrument.findFirst({ where: { id, isActive: true } });
  if (!i) throw new HttpError(404, "NOT_FOUND", "Stock not found.");
  return i;
}

export async function getInstrumentDetail(id: string) {
  const instrument = await getInstrument(id);
  const { quote, refreshError } = await getQuote(instrument);
  return { instrument, quote, refreshError };
}

export async function getInstrumentHistory(id: string, range: HistoryRange) {
  const instrument = await getInstrument(id);
  return getHistory(instrument, range);
}

export interface MoverRow {
  instrument: { id: string; symbol: string; companyName: string; sector: string | null };
  quote: StoredQuote;
}

/**
 * Market overview: indices from the provider plus gainers/losers computed
 * from the stored quotes of the supported instrument set. The movers are
 * therefore "among the stocks this app tracks", and the page says so.
 */
export async function getMarketOverview() {
  const instruments = await prisma.instrument.findMany({ where: { isActive: true }, select: { id: true, symbol: true, companyName: true, sector: true, providerInstrumentId: true } });
  const [{ indices, error: indicesError }, { quotes, refreshError }] = await Promise.all([getIndices(), getQuotes(instruments)]);
  const rows: MoverRow[] = [];
  for (const i of instruments) {
    const q = quotes.get(i.id);
    if (q && q.dayChangePercent !== null) rows.push({ instrument: i, quote: q });
  }
  rows.sort((a, b) => D(b.quote.dayChangePercent!).comparedTo(D(a.quote.dayChangePercent!)));
  const gainers = rows.filter((r) => D(r.quote.dayChangePercent!).gt(0)).slice(0, 5);
  const losers = rows.filter((r) => D(r.quote.dayChangePercent!).lt(0)).slice(-5).reverse();
  const covered = rows.length;
  const status = rows[0]?.quote.dataStatus ?? null;
  const newest = rows.reduce<Date | null>((m, r) => (m === null || r.quote.quoteTimestamp > m ? r.quote.quoteTimestamp : m), null);
  return { indices, indicesError, gainers, losers, covered, universe: instruments.length, status, asOf: newest, refreshError };
}
