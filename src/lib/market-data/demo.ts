/**
 * Demo provider: deterministic fixtures, no network.
 *
 * Every quote it returns is labelled DEMO and the UI shows a "Demo data"
 * banner (FR-MKT-06). Prices are generated from a seeded pseudo-random
 * walk around a base price per symbol so charts look plausible and
 * identical on every run. They are not real market prices.
 */
import type { HistoryRange, MarketDataProvider, ProviderCandle, ProviderIndexQuote, ProviderQuote } from "./types";
import { DEMO_BASE_PRICES } from "../instruments";

/** Small deterministic PRNG (mulberry32) so fixtures are stable. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSymbol(s: string): number {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

const DAYS: Record<HistoryRange, number> = { "1M": 22, "3M": 66, "6M": 130, "1Y": 250 };

/** Daily closes ending today, oldest first. */
function series(id: string, days: number): ProviderCandle[] {
  const base = DEMO_BASE_PRICES[id] ?? 500;
  const rand = rng(hashSymbol(id));
  const out: ProviderCandle[] = [];
  let price = base * (0.85 + rand() * 0.3);
  const today = new Date();
  today.setUTCHours(10, 0, 0, 0); // 15:30 IST market close
  for (let i = days - 1; i >= 0; i--) {
    const t = new Date(today);
    t.setUTCDate(t.getUTCDate() - i);
    const day = t.getUTCDay();
    if (day === 0 || day === 6) continue; // skip weekends
    const drift = (rand() - 0.48) * 0.025;
    const open = price;
    price = Math.max(1, price * (1 + drift));
    const high = Math.max(open, price) * (1 + rand() * 0.01);
    const low = Math.min(open, price) * (1 - rand() * 0.01);
    out.push({
      timestamp: t,
      open: open.toFixed(2),
      high: high.toFixed(2),
      low: low.toFixed(2),
      close: price.toFixed(2),
      volume: BigInt(Math.floor(200_000 + rand() * 3_000_000)),
    });
  }
  return out;
}

export class DemoProvider implements MarketDataProvider {
  readonly name = "demo";
  readonly defaultStatus = "DEMO" as const;

  async getQuote(id: string): Promise<ProviderQuote> {
    const s = series(id, 10);
    const last = s[s.length - 1];
    const prev = s[s.length - 2];
    const price = Number(last.close);
    const previousClose = Number(prev.close);
    const change = price - previousClose;
    return {
      price: last.close,
      previousClose: prev.close,
      dayChange: change.toFixed(2),
      dayChangePercent: ((change / previousClose) * 100).toFixed(2),
      volume: last.volume,
      quoteTimestamp: last.timestamp,
      provider: this.name,
      dataStatus: "DEMO",
    };
  }

  async getQuotes(ids: string[]): Promise<Map<string, ProviderQuote>> {
    const m = new Map<string, ProviderQuote>();
    for (const id of ids) m.set(id, await this.getQuote(id));
    return m;
  }

  async getHistory(id: string, range: HistoryRange): Promise<ProviderCandle[]> {
    return series(id, DAYS[range]);
  }

  async getIndices(): Promise<ProviderIndexQuote[]> {
    const now = new Date();
    return [
      { name: "NIFTY 50 (demo)", price: "24510.35", dayChange: "+112.40", dayChangePercent: "+0.46", quoteTimestamp: now, dataStatus: "DEMO" },
      { name: "SENSEX (demo)", price: "80215.10", dayChange: "+330.75", dayChangePercent: "+0.41", quoteTimestamp: now, dataStatus: "DEMO" },
      { name: "NIFTY BANK (demo)", price: "52890.60", dayChange: "-85.20", dayChangePercent: "-0.16", quoteTimestamp: now, dataStatus: "DEMO" },
    ];
  }
}
