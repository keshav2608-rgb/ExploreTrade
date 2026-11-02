/**
 * Does the configured market-data provider work from this machine?
 *
 *   npx tsx scripts/check-provider.ts            # uses MARKET_DATA_PROVIDER from .env
 *   npx tsx scripts/check-provider.ts yahoo      # force a provider
 *
 * Prints real responses (quotes, a month of history, indices) with their
 * data status. Exit code 1 if the provider fails.
 */
import "dotenv/config";
import { DemoProvider } from "../src/lib/market-data/demo";
import { YahooProvider } from "../src/lib/market-data/yahoo";

async function main() {
  const name = (process.argv[2] ?? process.env.MARKET_DATA_PROVIDER ?? "demo").toLowerCase();
  const p = name === "yahoo" ? new YahooProvider() : new DemoProvider();
  console.log(`provider: ${p.name} (quotes labelled ${p.defaultStatus})`);
  const started = Date.now();
  const quotes = await p.getQuotes(["RELIANCE.NS", "TCS.NS", "INFY.NS", "M&M.NS"]);
  for (const [id, q] of quotes) {
    console.log(`  ${id.padEnd(12)} price=${q.price} prevClose=${q.previousClose} change%=${q.dayChangePercent} volume=${q.volume} quoteTime=${q.quoteTimestamp.toISOString()} status=${q.dataStatus}`);
  }
  if (quotes.size === 0) throw new Error("no quotes returned");
  const h = await p.getHistory("TCS.NS", "1M");
  console.log(`  TCS.NS 1M history: ${h.length} candles, ${h[0]?.timestamp.toISOString().slice(0, 10)} close=${h[0]?.close} … ${h.at(-1)?.timestamp.toISOString().slice(0, 10)} close=${h.at(-1)?.close}`);
  const idx = await p.getIndices();
  console.log(`  indices: ${idx.map((i) => `${i.name}=${i.price} (${i.dayChangePercent}%)`).join(", ") || "none"}`);
  console.log(`ok in ${Date.now() - started} ms`);
}

main().catch((e) => {
  console.error("provider check FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
