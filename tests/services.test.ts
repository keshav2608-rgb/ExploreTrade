/**
 * Integration tests against a real SQLite database (§16.2): transactions
 * and recalculation, watchlist, alerts with the scheduled check, provider
 * failure fallback, and, above all, that one user can never touch
 * another's records.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/errors";
import { createTransaction, deleteTransaction, getTransaction, listTransactions, updateTransaction } from "@/lib/services/transactions";
import { getPortfolio } from "@/lib/services/portfolio";
import { addToWatchlist, listWatchlist, removeFromWatchlist } from "@/lib/services/watchlist";
import { createAlert, deleteAlert, listNotifications, markNotification, runAlertCheck, updateAlert } from "@/lib/services/alerts";
import { registerUser, deleteAccount } from "@/lib/services/users";
import { getQuote, setProviderForTests } from "@/lib/market-data";
import { DemoProvider } from "@/lib/market-data/demo";
import { ProviderUnavailableError, type MarketDataProvider } from "@/lib/market-data/types";
import { SEED_INSTRUMENTS } from "@/lib/instruments";

let alice: string, bob: string, tcs: string, infy: string;

beforeAll(async () => {
  for (const i of SEED_INSTRUMENTS.slice(0, 5)) {
    await prisma.instrument.upsert({ where: { exchange_symbol: { exchange: i.exchange, symbol: i.symbol } }, create: { symbol: i.symbol, companyName: i.companyName, exchange: i.exchange, sector: i.sector, providerInstrumentId: i.providerInstrumentId }, update: {} });
  }
  tcs = (await prisma.instrument.findUniqueOrThrow({ where: { exchange_symbol: { exchange: "NSE", symbol: "TCS" } } })).id;
  infy = (await prisma.instrument.findUniqueOrThrow({ where: { exchange_symbol: { exchange: "NSE", symbol: "INFY" } } })).id;
  alice = (await registerUser({ email: "alice@test.local", displayName: "Alice", password: "password1" })).id;
  bob = (await registerUser({ email: "bob@test.local", displayName: "Bob", password: "password1" })).id;
});

const buy = (instrumentId: string, qty: string, price: string, date = "2025-01-10") => ({ instrumentId, type: "BUY" as const, tradeDate: date, quantity: qty, pricePerShare: price, charges: "0", notes: null });
const sell = (instrumentId: string, qty: string, price: string, date = "2025-02-10") => ({ instrumentId, type: "SELL" as const, tradeDate: date, quantity: qty, pricePerShare: price, charges: "0", notes: null });

describe("transactions and holdings", () => {
  it("creates a buy and the portfolio reflects it", async () => {
    await createTransaction(alice, buy(tcs, "4", "3350"));
    const p = await getPortfolio(alice);
    const h = p.holdings.find((x) => x.instrumentId === tcs)!;
    expect(h.quantity.toString()).toBe("4");
    expect(h.averageBuyPrice!.toString()).toBe("3350");
    expect(h.currentValue).not.toBeNull(); // demo provider supplies a quote
    expect(h.storedQuote!.dataStatus).toBe("DEMO");
  });

  it("rejects zero/negative values and a sell beyond the holding", async () => {
    await expect(createTransaction(alice, { ...buy(tcs, "0", "10"), quantity: "0" })).rejects.toBeDefined;
    await expect(createTransaction(alice, sell(tcs, "5", "3400"))).rejects.toMatchObject({ status: 400, code: "NEGATIVE_HOLDING" });
    const ok = await createTransaction(alice, sell(tcs, "1", "3400"));
    expect(ok.type).toBe("SELL");
  });

  it("edit and delete recalculate, and a delete that would create a negative holding is refused", async () => {
    const b = await createTransaction(alice, buy(infy, "10", "1500"));
    const s = await createTransaction(alice, sell(infy, "4", "1580", "2025-03-01"));
    let p = await getPortfolio(alice);
    expect(p.holdings.find((h) => h.instrumentId === infy)!.quantity.toString()).toBe("6");
    expect(p.holdings.find((h) => h.instrumentId === infy)!.realizedPnl.toString()).toBe("320");

    await updateTransaction(alice, s.id, sell(infy, "2", "1580", "2025-03-01"));
    p = await getPortfolio(alice);
    expect(p.holdings.find((h) => h.instrumentId === infy)!.quantity.toString()).toBe("8");

    await expect(deleteTransaction(alice, b.id)).rejects.toMatchObject({ code: "NEGATIVE_HOLDING" });
    await deleteTransaction(alice, s.id);
    await deleteTransaction(alice, b.id);
    p = await getPortfolio(alice);
    expect(p.holdings.find((h) => h.instrumentId === infy)).toBeUndefined();
  });
});

describe("user isolation (acceptance: User A cannot reach User B's data)", () => {
  it("bob cannot read, edit or delete alice's transaction by id", async () => {
    const t = (await listTransactions(alice)).rows[0];
    await expect(getTransaction(bob, t.id)).rejects.toMatchObject({ status: 404 });
    await expect(updateTransaction(bob, t.id, buy(tcs, "1", "1"))).rejects.toMatchObject({ status: 404 });
    await expect(deleteTransaction(bob, t.id)).rejects.toMatchObject({ status: 404 });
    expect((await listTransactions(bob)).total).toBe(0);
  });

  it("bob cannot remove alice's watchlist entry or alert", async () => {
    const w = await addToWatchlist(alice, tcs);
    await expect(removeFromWatchlist(bob, w.id)).rejects.toMatchObject({ status: 404 });
    const a = await createAlert(alice, { instrumentId: tcs, condition: "ABOVE", thresholdPrice: "1" });
    await expect(updateAlert(bob, a.id, { isEnabled: false })).rejects.toMatchObject({ status: 404 });
    await expect(deleteAlert(bob, a.id)).rejects.toMatchObject({ status: 404 });
    await deleteAlert(alice, a.id);
    expect((await listWatchlist(bob)).items).toHaveLength(0);
  });
});

describe("watchlist", () => {
  it("prevents duplicates and removes cleanly", async () => {
    await expect(addToWatchlist(alice, tcs)).rejects.toMatchObject({ status: 409 });
    const { items } = await listWatchlist(alice);
    expect(items.map((i) => i.instrumentId)).toContain(tcs);
    await removeFromWatchlist(alice, items.find((i) => i.instrumentId === tcs)!.id);
    expect((await listWatchlist(alice)).items.find((i) => i.instrumentId === tcs)).toBeUndefined();
  });
});

describe("alerts and the scheduled check", () => {
  it("fires once with a controlled test quote and not again while the condition holds", async () => {
    const a = await createAlert(alice, { instrumentId: tcs, condition: "ABOVE", thresholdPrice: "4000" });
    const r1 = await runAlertCheck({ quoteOverride: new Map([[tcs, "4100"]]) });
    expect(r1.fired).toBe(1);
    const r2 = await runAlertCheck({ quoteOverride: new Map([[tcs, "4200"]]) });
    expect(r2.fired).toBe(0);
    const r3 = await runAlertCheck({ quoteOverride: new Map([[tcs, "3900"]]) }); // crosses back → re-arm
    expect(r3.reset).toBe(1);
    const r4 = await runAlertCheck({ quoteOverride: new Map([[tcs, "4001"]]) });
    expect(r4.fired).toBe(1);
    const n = await listNotifications(alice);
    expect(n.rows.filter((x) => x.alertId === a.id)).toHaveLength(2);
    expect(n.unread).toBe(2);
    await markNotification(alice, n.rows[0].id, true);
    expect((await listNotifications(alice)).unread).toBe(1);
    await expect(markNotification(bob, n.rows[0].id, true)).rejects.toMatchObject({ status: 404 });
    expect((await listNotifications(bob)).total).toBe(0);
    await deleteAlert(alice, a.id);
  });
});

describe("provider failure fallback (FR-DATA-04/05)", () => {
  it("keeps the last stored quote when the provider throws", async () => {
    const inst = await prisma.instrument.findUniqueOrThrow({ where: { id: tcs } });
    const before = await getQuote(inst);
    expect(before.quote).not.toBeNull();
    // Make the stored quote look old, then break the provider.
    await prisma.quoteSnapshot.update({ where: { instrumentId: tcs }, data: { fetchedAt: new Date(Date.now() - 3 * 3_600_000) } });
    const broken: MarketDataProvider = { name: "broken", defaultStatus: "DELAYED", getQuote: async () => { throw new ProviderUnavailableError("down"); }, getQuotes: async () => { throw new ProviderUnavailableError("down"); }, getHistory: async () => [], getIndices: async () => [] };
    setProviderForTests(broken);
    try {
      const after = await getQuote(inst);
      expect(after.refreshError).toContain("down");
      expect(after.quote).not.toBeNull();
      expect(after.quote!.price).toBe(before.quote!.price);
      expect(after.quote!.isStale).toBe(true);
      const p = await getPortfolio(alice);
      expect(p.summary.staleCount).toBeGreaterThan(0);
    } finally {
      setProviderForTests(new DemoProvider());
    }
  });
});

describe("account deletion", () => {
  it("removes the user and every owned record", async () => {
    await deleteAccount(bob);
    expect(await prisma.user.findUnique({ where: { id: bob } })).toBeNull();
    expect(await prisma.transaction.count({ where: { userId: bob } })).toBe(0);
  });
});
