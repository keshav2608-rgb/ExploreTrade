/** Unit tests for the calculation rules in SRS §7 (requirement §16.1). */
import { describe, expect, it } from "vitest";
import { computeHoldings, grossValue, netCash, replayPosition, SellExceedsHoldingError, summarize, type QuoteInput, type TxInput } from "@/lib/portfolio";
import { D, formatInr, groupIndian } from "@/lib/money";

const d = (s: string) => new Date(s + "T00:00:00Z");
const tx = (over: Partial<TxInput>): TxInput => ({ id: Math.random().toString(36).slice(2), instrumentId: "A", type: "BUY", tradeDate: d("2025-01-01"), quantity: "1", pricePerShare: "1", charges: "0", ...over });
const quote = (price: string, prev: string | null = null, stale = false): QuoteInput => ({ price, previousClose: prev, quoteTimestamp: new Date("2025-06-01T10:00:00Z"), dataStatus: "DEMO", provider: "demo", isStale: stale });

describe("transaction totals (§7.1)", () => {
  it("gross = qty × price; buy adds charges, sell deducts them", () => {
    expect(grossValue({ quantity: "10", pricePerShare: "1420.50" }).toString()).toBe("14205");
    expect(netCash({ type: "BUY", quantity: "10", pricePerShare: "1420.50", charges: "20" }).toString()).toBe("14225");
    expect(netCash({ type: "SELL", quantity: "10", pricePerShare: "1420.50", charges: "20" }).toString()).toBe("14185");
  });
});

describe("weighted-average cost basis (§7.3)", () => {
  it("averages two buys including charges", () => {
    const pos = replayPosition([tx({ quantity: "10", pricePerShare: "100", charges: "10" }), tx({ quantity: "10", pricePerShare: "120", charges: "10", tradeDate: d("2025-01-02") })]);
    expect(pos.quantity.toString()).toBe("20");
    expect(pos.costBasis.toString()).toBe("2220"); // 1010 + 1210
    expect(pos.costBasis.div(pos.quantity).toString()).toBe("111");
  });

  it("realizes P&L on a partial sell at average cost and keeps the rest at the same average", () => {
    const pos = replayPosition([
      tx({ quantity: "10", pricePerShare: "100", charges: "0" }),
      tx({ quantity: "10", pricePerShare: "120", charges: "0", tradeDate: d("2025-01-02") }),
      tx({ type: "SELL", quantity: "5", pricePerShare: "150", charges: "5", tradeDate: d("2025-01-03") }),
    ]);
    // avg 110; sold 5 → cost 550; proceeds 750 − 5 = 745; realized 195
    expect(pos.realizedPnl.toString()).toBe("195");
    expect(pos.quantity.toString()).toBe("15");
    expect(pos.costBasis.toString()).toBe("1650");
  });

  it("fully closing a position leaves zero cost basis and no float dust", () => {
    const pos = replayPosition([tx({ quantity: "3", pricePerShare: "33.33" }), tx({ type: "SELL", quantity: "3", pricePerShare: "40", tradeDate: d("2025-02-01") })]);
    expect(pos.quantity.isZero()).toBe(true);
    expect(pos.costBasis.isZero()).toBe(true);
    expect(pos.realizedPnl.toString()).toBe("20.01");
  });

  it("orders by trade date, not insertion order", () => {
    const pos = replayPosition([tx({ type: "SELL", quantity: "1", pricePerShare: "10", tradeDate: d("2025-03-01") }), tx({ quantity: "1", pricePerShare: "5", tradeDate: d("2025-02-01") })]);
    expect(pos.realizedPnl.toString()).toBe("5");
  });

  it("rejects a sell larger than the holding on that date (§7.2)", () => {
    expect(() => replayPosition([tx({ quantity: "5", pricePerShare: "10" }), tx({ type: "SELL", quantity: "6", pricePerShare: "10", tradeDate: d("2025-01-02") })])).toThrow(SellExceedsHoldingError);
    // A sell dated before the buy is also rejected, even if the total would be fine.
    expect(() => replayPosition([tx({ quantity: "5", pricePerShare: "10", tradeDate: d("2025-01-05") }), tx({ type: "SELL", quantity: "1", pricePerShare: "10", tradeDate: d("2025-01-02") })])).toThrow(SellExceedsHoldingError);
  });
});

describe("valuation and P&L (§7.4–§7.8)", () => {
  it("computes unrealized, total and return %", () => {
    const quotes = new Map([["A", quote("150", "140")]]);
    const [h] = computeHoldings([tx({ quantity: "10", pricePerShare: "100", charges: "10" })], quotes);
    expect(h.currentValue!.toString()).toBe("1500");
    expect(h.unrealizedPnl!.toString()).toBe("490"); // 1500 − 1010
    expect(h.dayChange!.toString()).toBe("100");
    const s = summarize([h]);
    expect(s.totalPnl!.toString()).toBe("490");
    expect(s.returnPercent!.toFixed(4)).toBe("48.5149"); // 490 / 1010
    expect(s.dayChangePercent!.toFixed(4)).toBe("7.1429"); // 100 / 1400
  });

  it("never treats a missing quote as zero (FR-DATA-07)", () => {
    const quotes = new Map([["A", quote("150")]]);
    const holdings = computeHoldings([tx({ instrumentId: "A", quantity: "10", pricePerShare: "100" }), tx({ instrumentId: "B", quantity: "5", pricePerShare: "200" })], quotes);
    const b = holdings.find((h) => h.instrumentId === "B")!;
    expect(b.currentValue).toBeNull();
    expect(b.totalPnl).toBeNull();
    const s = summarize(holdings);
    expect(s.marketValue!.toString()).toBe("1500"); // only A
    expect(s.unvaluedCount).toBe(1);
    expect(s.valuedCount).toBe(1);
    expect(s.investedValue.toString()).toBe("2000"); // cost basis counts both
    expect(s.dayChange).toBeNull(); // A has no previous close
  });

  it("reports stale quotes and the oldest valuation timestamp", () => {
    const quotes = new Map([["A", quote("1", null, true)]]);
    const s = summarize(computeHoldings([tx({ quantity: "1", pricePerShare: "1" })], quotes));
    expect(s.staleCount).toBe(1);
    expect(s.valuationTimestamp?.toISOString()).toBe("2025-06-01T10:00:00.000Z");
  });

  it("empty portfolio summarises to zeros, not nulls", () => {
    const s = summarize([]);
    expect(s.marketValue!.isZero()).toBe(true);
    expect(s.totalPnl!.isZero()).toBe(true);
    expect(s.returnPercent).toBeNull();
  });
});

describe("display formatting (§7.10)", () => {
  it("uses Indian digit grouping and the ₹ symbol", () => {
    expect(groupIndian("1234567")).toBe("12,34,567");
    expect(groupIndian("999")).toBe("999");
    expect(formatInr("1234567.891")).toBe("₹12,34,567.89");
    expect(formatInr("-5.5")).toBe("-₹5.50");
    expect(formatInr("5", { signed: true })).toBe("+₹5.00");
    expect(formatInr(D("0"), { signed: true })).toBe("₹0.00");
  });
});
