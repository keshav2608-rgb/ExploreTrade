/**
 * Portfolio calculations (SRS §7). Pure functions: no database, no I/O,
 * so they are unit-tested exhaustively in tests/portfolio.test.ts.
 *
 * Accounting method: weighted-average cost, applied in trade-date order.
 *   - Buy charges are added to the cost basis.
 *   - Sell charges are deducted from sale proceeds.
 *   - On a sell, the cost basis of the sold quantity is
 *       quantity_sold × (remaining cost basis / remaining quantity)
 *     and realized P&L = net proceeds − that cost basis.
 *   - Return % = total P&L / total buy cost basis of all buys ever made
 *     (including charges). This denominator is documented in the UI.
 *
 * A missing quote is never treated as zero (FR-DATA-07): holdings with no
 * quote are reported with `currentValue: null` and excluded from the
 * valued totals, and the summary says how many were excluded.
 */
import { Decimal, D, ZERO } from "./money";

export type TxType = "BUY" | "SELL";

export interface TxInput {
  id: string;
  instrumentId: string;
  type: TxType;
  tradeDate: Date;
  quantity: Decimal.Value;
  pricePerShare: Decimal.Value;
  charges?: Decimal.Value;
  /** Tie-break for same-day transactions: creation order. */
  createdAt?: Date;
}

export interface QuoteInput {
  price: Decimal.Value;
  previousClose?: Decimal.Value | null;
  quoteTimestamp: Date;
  dataStatus: string;
  provider: string;
  /** True when older than the configured freshness limit. */
  isStale: boolean;
}

export interface Holding {
  instrumentId: string;
  quantity: Decimal;
  /** Remaining cost basis of the open quantity (buy charges included). */
  costBasis: Decimal;
  averageBuyPrice: Decimal | null;
  /** Realized P&L from all sells of this instrument. */
  realizedPnl: Decimal;
  /** Sum of (qty × price + charges) over all buys, the return-% denominator. */
  totalBuyCost: Decimal;
  // ---- valuation (null when no quote is available) ----
  quote: QuoteInput | null;
  currentValue: Decimal | null;
  unrealizedPnl: Decimal | null;
  totalPnl: Decimal | null;
  /** Change since previous close, when the quote carries one. */
  dayChange: Decimal | null;
}

export interface PortfolioSummary {
  investedValue: Decimal;      // remaining cost basis of open holdings
  totalBuyCost: Decimal;       // denominator for return %
  marketValue: Decimal | null; // null when nothing could be valued
  realizedPnl: Decimal;
  unrealizedPnl: Decimal | null;
  totalPnl: Decimal | null;
  returnPercent: Decimal | null;
  dayChange: Decimal | null;
  dayChangePercent: Decimal | null;
  holdingsCount: number;
  valuedCount: number;
  unvaluedCount: number;
  staleCount: number;
  /** Oldest quote timestamp among valued holdings, for the "as of" label. */
  valuationTimestamp: Date | null;
}

export class SellExceedsHoldingError extends Error {
  constructor(public readonly available: Decimal, public readonly requested: Decimal) {
    super(`Cannot sell ${requested.toString()} shares: only ${available.toString()} held on that date.`);
    this.name = "SellExceedsHoldingError";
  }
}

/** Gross value of a trade: quantity × price. */
export function grossValue(tx: Pick<TxInput, "quantity" | "pricePerShare">): Decimal {
  return D(tx.quantity).times(tx.pricePerShare);
}

/** Cash that leaves (buy) or arrives (sell) once charges are applied. */
export function netCash(tx: Pick<TxInput, "type" | "quantity" | "pricePerShare" | "charges">): Decimal {
  const gross = grossValue(tx);
  const charges = D(tx.charges ?? 0);
  return tx.type === "BUY" ? gross.plus(charges) : gross.minus(charges);
}

/** Stable ordering: trade date, then creation time, then id. */
export function sortTransactions<T extends TxInput>(txs: T[]): T[] {
  return [...txs].sort((a, b) => {
    const d = a.tradeDate.getTime() - b.tradeDate.getTime();
    if (d !== 0) return d;
    const c = (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0);
    if (c !== 0) return c;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

interface RunningPosition {
  quantity: Decimal;
  costBasis: Decimal;
  realizedPnl: Decimal;
  totalBuyCost: Decimal;
}

/**
 * Replay one instrument's transactions in order and return the open
 * position. Throws `SellExceedsHoldingError` if any sell would make the
 * quantity negative, which the API uses to reject the transaction.
 */
export function replayPosition(txs: TxInput[]): RunningPosition {
  const pos: RunningPosition = { quantity: ZERO, costBasis: ZERO, realizedPnl: ZERO, totalBuyCost: ZERO };
  for (const tx of sortTransactions(txs)) {
    const qty = D(tx.quantity);
    const charges = D(tx.charges ?? 0);
    if (tx.type === "BUY") {
      const cost = qty.times(tx.pricePerShare).plus(charges);
      pos.quantity = pos.quantity.plus(qty);
      pos.costBasis = pos.costBasis.plus(cost);
      pos.totalBuyCost = pos.totalBuyCost.plus(cost);
    } else {
      if (qty.gt(pos.quantity)) throw new SellExceedsHoldingError(pos.quantity, qty);
      // Weighted-average cost of the shares being sold.
      const avgCost = pos.quantity.isZero() ? ZERO : pos.costBasis.div(pos.quantity);
      const soldCost = avgCost.times(qty);
      const proceeds = qty.times(tx.pricePerShare).minus(charges);
      pos.realizedPnl = pos.realizedPnl.plus(proceeds.minus(soldCost));
      pos.quantity = pos.quantity.minus(qty);
      pos.costBasis = pos.quantity.isZero() ? ZERO : pos.costBasis.minus(soldCost);
    }
  }
  return pos;
}

/**
 * Build holdings for every instrument that has transactions. Instruments
 * whose open quantity is zero are still returned (with their realized P&L)
 * so the portfolio page can show closed positions; the dashboard filters
 * to `quantity > 0`.
 */
export function computeHoldings(txs: TxInput[], quotes: Map<string, QuoteInput>): Holding[] {
  const byInstrument = new Map<string, TxInput[]>();
  for (const tx of txs) {
    const list = byInstrument.get(tx.instrumentId) ?? [];
    list.push(tx);
    byInstrument.set(tx.instrumentId, list);
  }
  const holdings: Holding[] = [];
  for (const [instrumentId, list] of byInstrument) {
    const pos = replayPosition(list);
    const quote = quotes.get(instrumentId) ?? null;
    const open = pos.quantity.gt(0);
    let currentValue: Decimal | null = null;
    let unrealizedPnl: Decimal | null = null;
    let dayChange: Decimal | null = null;
    if (open && quote) {
      currentValue = pos.quantity.times(quote.price);
      unrealizedPnl = currentValue.minus(pos.costBasis);
      if (quote.previousClose !== null && quote.previousClose !== undefined) {
        dayChange = pos.quantity.times(D(quote.price).minus(quote.previousClose));
      }
    } else if (!open) {
      currentValue = ZERO;
      unrealizedPnl = ZERO;
    }
    holdings.push({
      instrumentId,
      quantity: pos.quantity,
      costBasis: pos.costBasis,
      averageBuyPrice: open ? pos.costBasis.div(pos.quantity) : null,
      realizedPnl: pos.realizedPnl,
      totalBuyCost: pos.totalBuyCost,
      quote: open ? quote : null,
      currentValue,
      unrealizedPnl,
      totalPnl: unrealizedPnl === null ? null : pos.realizedPnl.plus(unrealizedPnl),
      dayChange,
    });
  }
  return holdings;
}

/** Totals across holdings, honouring the "missing quote is not zero" rule. */
export function summarize(holdings: Holding[]): PortfolioSummary {
  const open = holdings.filter((h) => h.quantity.gt(0));
  const investedValue = open.reduce((a, h) => a.plus(h.costBasis), ZERO);
  const totalBuyCost = holdings.reduce((a, h) => a.plus(h.totalBuyCost), ZERO);
  const realizedPnl = holdings.reduce((a, h) => a.plus(h.realizedPnl), ZERO);

  const valued = open.filter((h) => h.currentValue !== null);
  const unvalued = open.length - valued.length;
  const staleCount = valued.filter((h) => h.quote?.isStale).length;

  let marketValue: Decimal | null = null;
  let unrealizedPnl: Decimal | null = null;
  let valuationTimestamp: Date | null = null;
  if (open.length === 0) {
    marketValue = ZERO;
    unrealizedPnl = ZERO;
  } else if (valued.length > 0) {
    marketValue = valued.reduce((a, h) => a.plus(h.currentValue!), ZERO);
    unrealizedPnl = valued.reduce((a, h) => a.plus(h.unrealizedPnl!), ZERO);
    valuationTimestamp = valued.reduce<Date | null>((oldest, h) => {
      const t = h.quote!.quoteTimestamp;
      return oldest === null || t < oldest ? t : oldest;
    }, null);
  }

  const totalPnl = unrealizedPnl === null ? null : realizedPnl.plus(unrealizedPnl);
  const returnPercent = totalPnl !== null && totalBuyCost.gt(0) ? totalPnl.div(totalBuyCost).times(100) : null;

  // Day change only when every valued holding has a previous close.
  const withDay = valued.filter((h) => h.dayChange !== null);
  let dayChange: Decimal | null = null;
  let dayChangePercent: Decimal | null = null;
  if (valued.length > 0 && withDay.length === valued.length) {
    dayChange = withDay.reduce((a, h) => a.plus(h.dayChange!), ZERO);
    const prevValue = marketValue!.minus(dayChange);
    dayChangePercent = prevValue.gt(0) ? dayChange.div(prevValue).times(100) : null;
  }

  return {
    investedValue,
    totalBuyCost,
    marketValue,
    realizedPnl,
    unrealizedPnl,
    totalPnl,
    returnPercent,
    dayChange,
    dayChangePercent,
    holdingsCount: open.length,
    valuedCount: valued.length,
    unvaluedCount: unvalued,
    staleCount,
    valuationTimestamp,
  };
}

/**
 * Largest positive and negative contributors to today's move (FR-INS-01).
 * Returns holdings sorted by day change; callers take the ends.
 */
export function dayContributors(holdings: Holding[]): Holding[] {
  return holdings
    .filter((h) => h.quantity.gt(0) && h.dayChange !== null && !h.dayChange.isZero())
    .sort((a, b) => b.dayChange!.comparedTo(a.dayChange!));
}
