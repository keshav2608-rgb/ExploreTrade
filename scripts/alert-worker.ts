/**
 * Local scheduled worker (SRS §10, "scheduled jobs").
 *
 *   npm run worker
 *
 * Every WORKER_INTERVAL_SECONDS it POSTs to /api/cron/check-alerts with the
 * CRON_SECRET, which refreshes quotes for alerted instruments, evaluates
 * alerts and records the daily portfolio valuation. On a hosted platform,
 * point a cron job at the same endpoint instead of running this script.
 *
 * It never gives up on an error: a failed run is logged and the next one
 * happens on schedule. It also backs off (doubling, up to 10 minutes) when
 * the app reports a provider rate limit, so it does not make it worse.
 */
import "dotenv/config";

const base = process.env.APP_URL ?? "http://localhost:3000";
const secret = process.env.CRON_SECRET;
const interval = Math.max(15, Number(process.env.WORKER_INTERVAL_SECONDS ?? 300) || 300) * 1000;

if (!secret) {
  console.error("CRON_SECRET is not set in .env; the worker cannot authenticate.");
  process.exit(1);
}

let backoff = 0;

async function tick() {
  const started = Date.now();
  try {
    const res = await fetch(`${base}/api/cron/check-alerts`, { method: "POST", headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" }, body: "{}" });
    const body = await res.json();
    if (!res.ok || !body.ok) {
      console.error(`[worker] ${new Date().toISOString()} failed: HTTP ${res.status} ${JSON.stringify(body.error ?? body)}`);
    } else {
      const d = body.data;
      console.log(`[worker] ${new Date().toISOString()} alerts=${d.checked} fired=${d.fired} reset=${d.reset} quotes=${d.quotesRefreshed} valuations=${d.valuationsRecorded}${d.refreshError ? ` refreshError="${d.refreshError}"` : ""} (${Date.now() - started} ms)`);
      backoff = d.refreshError && /rate|429|paused/i.test(d.refreshError) ? Math.min(backoff ? backoff * 2 : interval, 600_000) : 0;
    }
  } catch (e) {
    console.error(`[worker] ${new Date().toISOString()} app not reachable at ${base}: ${e instanceof Error ? e.message : e}`);
  }
  setTimeout(tick, backoff || interval);
}

console.log(`[worker] polling ${base}/api/cron/check-alerts every ${interval / 1000}s`);
tick();
