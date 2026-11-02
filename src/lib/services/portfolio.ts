/**
 * Portfolio service: joins a user's transactions with stored quotes and
 * runs the pure calculations in lib/portfolio.ts.
 */
import { prisma } from "../prisma";
import { computeHoldings, dayContributors, summarize, type Holding, type PortfolioSummary, type TxInput } from "../portfolio";
import { getQuotes, toQuoteInput, type StoredQuote } from "../market-data";

export interface HoldingView extends Holding {
  instrument: { id: string; symbol: string; companyName: string; exchange: string; sector: string | null };
  storedQuote: StoredQuote | null;
}

export interface PortfolioView {
  holdings: HoldingView[];      // open positions, largest value first
  closed: HoldingView[];        // fully sold positions (realized P&L only)
  summary: PortfolioSummary;
  contributors: { gainers: HoldingView[]; losers: HoldingView[] };
  refreshError: string | null;
  provider: string | null;
  /** Worst data status among valued holdings, for the banner. */
  dataStatus: string | null;
  allocation: Array<{ label: string; value: string; percent: string }>;
  sectorAllocation: Array<{ label: string; value: string; percent: string }>;
}

export async function getPortfolio(userId: string): Promise<PortfolioView> {
  const txRows = await prisma.transaction.findMany({ where: { userId }, include: { instrument: { select: { id: true, symbol: true, companyName: true, exchange: true, sector: true, providerInstrumentId: true } } } });
  const txs: TxInput[] = txRows.map((t) => ({ id: t.id, instrumentId: t.instrumentId, type: t.type as "BUY" | "SELL", tradeDate: t.tradeDate, quantity: t.quantity.toString(), pricePerShare: t.pricePerShare.toString(), charges: t.charges.toString(), createdAt: t.createdAt }));

  const instruments = new Map<string, (typeof txRows)[number]["instrument"]>();
  for (const t of txRows) instruments.set(t.instrumentId, t.instrument);

  const { quotes: stored, refreshError } = await getQuotes([...instruments.values()].map((i) => ({ id: i.id, providerInstrumentId: i.providerInstrumentId })));
  const quoteInputs = new Map([...stored].map(([id, q]) => [id, toQuoteInput(q)]));

  const holdings = computeHoldings(txs, quoteInputs).map<HoldingView>((h) => {
    const i = instruments.get(h.instrumentId)!;
    return { ...h, instrument: { id: i.id, symbol: i.symbol, companyName: i.companyName, exchange: i.exchange, sector: i.sector }, storedQuote: stored.get(h.instrumentId) ?? null };
  });
  const open = holdings.filter((h) => h.quantity.gt(0)).sort((a, b) => (b.currentValue ?? b.costBasis).comparedTo(a.currentValue ?? a.costBasis));
  const closed = holdings.filter((h) => h.quantity.lte(0));
  const summary = summarize(holdings);
  const sorted = dayContributors(open) as HoldingView[];
  const gainers = sorted.filter((h) => h.dayChange!.gt(0)).slice(0, 3);
  const losers = sorted.filter((h) => h.dayChange!.lt(0)).slice(-3).reverse();

  const statusRank: Record<string, number> = { LIVE: 0, DELAYED: 1, END_OF_DAY: 2, CACHED: 3, DEMO: 4 };
  let dataStatus: string | null = null;
  let provider: string | null = null;
  for (const h of open) {
    if (!h.storedQuote) continue;
    provider ??= h.storedQuote.provider;
    if (dataStatus === null || (statusRank[h.storedQuote.dataStatus] ?? 9) > (statusRank[dataStatus] ?? 9)) dataStatus = h.storedQuote.dataStatus;
  }

  // Allocation by holding and by sector, based on current value where
  // available and cost basis otherwise (labelled in the UI).
  const total = open.reduce((a, h) => a.plus(h.currentValue ?? h.costBasis), summary.investedValue.times(0));
  const allocation = open.map((h) => {
    const v = h.currentValue ?? h.costBasis;
    return { label: h.instrument.symbol, value: v.toString(), percent: total.gt(0) ? v.div(total).times(100).toFixed(1) : "0" };
  });
  const bySector = new Map<string, typeof total>();
  for (const h of open) {
    const k = h.instrument.sector ?? "Unclassified";
    bySector.set(k, (bySector.get(k) ?? total.times(0)).plus(h.currentValue ?? h.costBasis));
  }
  const sectorAllocation = [...bySector].sort((a, b) => b[1].comparedTo(a[1])).map(([label, v]) => ({ label, value: v.toString(), percent: total.gt(0) ? v.div(total).times(100).toFixed(1) : "0" }));

  return { holdings: open, closed, summary, contributors: { gainers, losers }, refreshError, provider, dataStatus, allocation, sectorAllocation };
}

/** Daily valuation rows for the performance chart (written by the worker). */
export async function getValuationHistory(userId: string, days = 90) {
  const since = new Date(Date.now() - days * 86_400_000);
  return prisma.portfolioValuation.findMany({ where: { userId, valuationTimestamp: { gte: since } }, orderBy: { valuationTimestamp: "asc" } });
}

/** Record today's valuation for a user (one row per UTC day). */
export async function recordValuation(userId: string): Promise<void> {
  const view = await getPortfolio(userId);
  const s = view.summary;
  if (s.marketValue === null || s.unrealizedPnl === null || s.totalPnl === null) return; // nothing valued: do not write zeros
  const day = new Date();
  day.setUTCHours(0, 0, 0, 0);
  await prisma.portfolioValuation.upsert({
    where: { userId_valuationTimestamp: { userId, valuationTimestamp: day } },
    create: { userId, valuationTimestamp: day, investedValue: s.investedValue.toString(), marketValue: s.marketValue.toString(), realizedPnl: s.realizedPnl.toString(), unrealizedPnl: s.unrealizedPnl.toString(), totalPnl: s.totalPnl.toString(), quoteStatusSummary: `${view.dataStatus ?? "NONE"} valued=${s.valuedCount} unvalued=${s.unvaluedCount} stale=${s.staleCount}` },
    update: { investedValue: s.investedValue.toString(), marketValue: s.marketValue.toString(), realizedPnl: s.realizedPnl.toString(), unrealizedPnl: s.unrealizedPnl.toString(), totalPnl: s.totalPnl.toString(), quoteStatusSummary: `${view.dataStatus ?? "NONE"} valued=${s.valuedCount} unvalued=${s.unvaluedCount} stale=${s.staleCount}` },
  });
}
