/**
 * Yahoo Finance adapter using the public v8 "chart" endpoint directly.
 *
 * Why not a client library: the v7 quote endpoint now requires a consent
 * cookie and crumb, and the wrapper library's handshake failed from this
 * machine on 2026-11-03. The v8 chart endpoint answers plain requests and
 * carries everything the MVP needs in its `meta` block (last price,
 * previous close, volume, quote time) plus daily candles for charts.
 *
 * Coverage: NSE symbols are "<SYMBOL>.NS", BSE "<SYMBOL>.BO". Yahoo's
 * Indian equity data is delayed, so every quote is labelled DELAYED and
 * never LIVE. Yahoo's terms allow personal, non-commercial use; check them
 * before any public deployment (SRS §13.1). Swapping providers means
 * replacing this one file.
 */
import {
  type HistoryRange,
  type MarketDataProvider,
  type ProviderCandle,
  type ProviderIndexQuote,
  type ProviderQuote,
  ProviderUnavailableError,
  RateLimitedError,
} from "./types";

const BASE = "https://query1.finance.yahoo.com/v8/finance/chart/";
const RANGE: Record<HistoryRange, string> = { "1M": "1mo", "3M": "3mo", "6M": "6mo", "1Y": "1y" };
const INDICES: Array<[string, string]> = [["^NSEI", "NIFTY 50"], ["^BSESN", "SENSEX"], ["^NSEBANK", "NIFTY BANK"]];

interface ChartMeta {
  regularMarketPrice?: number;
  chartPreviousClose?: number;
  previousClose?: number;
  regularMarketVolume?: number;
  regularMarketTime?: number;
}
interface ChartResponse {
  chart?: { result?: Array<{ meta?: ChartMeta; timestamp?: number[]; indicators?: { quote?: Array<{ open?: (number | null)[]; high?: (number | null)[]; low?: (number | null)[]; close?: (number | null)[]; volume?: (number | null)[] }> } }> | null; error?: { description?: string } | null };
}

async function chart(symbol: string, params: Record<string, string>): Promise<NonNullable<NonNullable<ChartResponse["chart"]>["result"]>[number]> {
  const url = BASE + encodeURIComponent(symbol) + "?" + new URLSearchParams(params).toString();
  let res: Response;
  try {
    res = await fetch(url, { headers: { "user-agent": "PortfolioPulse/1.0 (student project)" }, signal: AbortSignal.timeout(12_000) });
  } catch (e) {
    throw new ProviderUnavailableError(`Yahoo Finance unreachable: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (res.status === 429) throw new RateLimitedError(Number(res.headers.get("retry-after")) || null);
  if (!res.ok) throw new ProviderUnavailableError(`Yahoo Finance HTTP ${res.status} for ${symbol}`);
  const body = (await res.json()) as ChartResponse;
  const r = body.chart?.result?.[0];
  if (!r) throw new ProviderUnavailableError(`Yahoo Finance: ${body.chart?.error?.description ?? "no result"} for ${symbol}`);
  return r;
}

/** Yahoo returns binary-float noise like 2114.39990234375; keep 4 dp. */
function num(v: unknown): string | null {
  return typeof v === "number" && Number.isFinite(v) ? String(Number(v.toFixed(4))) : null;
}

function metaToQuote(meta: ChartMeta | undefined, provider: string): ProviderQuote | null {
  const price = meta?.regularMarketPrice;
  if (typeof price !== "number") return null;
  const prev = meta?.chartPreviousClose ?? meta?.previousClose ?? null;
  const change = prev === null ? null : price - prev;
  return {
    price: num(price)!,
    previousClose: num(prev),
    dayChange: change === null ? null : change.toFixed(4),
    dayChangePercent: change === null || !prev ? null : ((change / prev) * 100).toFixed(4),
    volume: typeof meta?.regularMarketVolume === "number" ? BigInt(Math.floor(meta.regularMarketVolume)) : null,
    quoteTimestamp: typeof meta?.regularMarketTime === "number" ? new Date(meta.regularMarketTime * 1000) : new Date(),
    provider,
    dataStatus: "DELAYED",
  };
}

export class YahooProvider implements MarketDataProvider {
  readonly name = "yahoo";
  readonly defaultStatus = "DELAYED" as const;

  async getQuote(id: string): Promise<ProviderQuote> {
    const r = await chart(id, { range: "1d", interval: "1d" });
    const q = metaToQuote(r.meta, this.name);
    if (!q) throw new ProviderUnavailableError(`Yahoo Finance returned no price for ${id}`);
    return q;
  }

  /** One request per symbol, at most 6 in flight. A failed symbol is simply absent. */
  async getQuotes(ids: string[]): Promise<Map<string, ProviderQuote>> {
    const out = new Map<string, ProviderQuote>();
    let rateLimited: RateLimitedError | null = null;
    const queue = [...ids];
    const worker = async () => {
      while (queue.length) {
        const id = queue.shift()!;
        try {
          out.set(id, await this.getQuote(id));
        } catch (e) {
          if (e instanceof RateLimitedError) { rateLimited = e; queue.length = 0; }
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(6, ids.length) }, worker));
    if (rateLimited && out.size === 0) throw rateLimited;
    return out;
  }

  async getHistory(id: string, range: HistoryRange): Promise<ProviderCandle[]> {
    const r = await chart(id, { range: RANGE[range], interval: "1d" });
    const ts = r.timestamp ?? [];
    const q = r.indicators?.quote?.[0] ?? {};
    const out: ProviderCandle[] = [];
    for (let i = 0; i < ts.length; i++) {
      const close = q.close?.[i];
      if (typeof close !== "number") continue;
      out.push({ timestamp: new Date(ts[i] * 1000), open: num(q.open?.[i]), high: num(q.high?.[i]), low: num(q.low?.[i]), close: num(close)!, volume: typeof q.volume?.[i] === "number" ? BigInt(Math.floor(q.volume![i] as number)) : null });
    }
    return out;
  }

  async getIndices(): Promise<ProviderIndexQuote[]> {
    const out: ProviderIndexQuote[] = [];
    for (const [symbol, name] of INDICES) {
      try {
        const q = await this.getQuote(symbol);
        out.push({ name, price: q.price, dayChange: q.dayChange, dayChangePercent: q.dayChangePercent, quoteTimestamp: q.quoteTimestamp, dataStatus: "DELAYED" });
      } catch (e) {
        if (e instanceof RateLimitedError) throw e;
        // One missing index is not a reason to hide the others.
      }
    }
    return out;
  }
}
