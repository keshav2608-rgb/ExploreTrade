/**
 * Provider-independent market-data contract (SRS §13.2).
 *
 * Every adapter converts its provider's response into these shapes before
 * anything else sees it. `dataStatus` is mandatory: the UI labels every
 * price with it and the app never calls delayed data "live".
 */

export type DataStatus = "LIVE" | "DELAYED" | "END_OF_DAY" | "CACHED" | "DEMO";

export interface ProviderQuote {
  price: string;              // decimal as string, never float
  previousClose: string | null;
  dayChange: string | null;
  dayChangePercent: string | null;
  volume: bigint | null;
  quoteTimestamp: Date;
  provider: string;
  dataStatus: DataStatus;
}

export interface ProviderCandle {
  timestamp: Date;
  open: string | null;
  high: string | null;
  low: string | null;
  close: string;
  volume: bigint | null;
}

export type HistoryRange = "1M" | "3M" | "6M" | "1Y";

export interface ProviderIndexQuote {
  name: string;
  price: string;
  dayChange: string | null;
  dayChangePercent: string | null;
  quoteTimestamp: Date;
  dataStatus: DataStatus;
}

export interface MarketDataProvider {
  readonly name: string;
  /** Default status this provider's quotes carry (DELAYED for Yahoo, DEMO for fixtures). */
  readonly defaultStatus: DataStatus;
  /** Latest quote for a provider instrument id (e.g. "RELIANCE.NS"). */
  getQuote(providerInstrumentId: string): Promise<ProviderQuote>;
  /** Several quotes at once; missing ones are simply absent from the map. */
  getQuotes(providerInstrumentIds: string[]): Promise<Map<string, ProviderQuote>>;
  getHistory(providerInstrumentId: string, range: HistoryRange): Promise<ProviderCandle[]>;
  /** Index quotes for the market overview, or [] if unsupported. */
  getIndices(): Promise<ProviderIndexQuote[]>;
}

/** Thrown by adapters on HTTP 429 so the service backs off instead of retrying. */
export class RateLimitedError extends Error {
  constructor(public readonly retryAfterSeconds: number | null = null) {
    super("Market-data provider rate limit reached");
    this.name = "RateLimitedError";
  }
}

export class ProviderUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderUnavailableError";
  }
}
