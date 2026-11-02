#!/usr/bin/env node
/**
 * End-to-end smoke test over HTTP against a running app.
 *
 *   node scripts/smoke.mjs [http://localhost:3000]
 *
 * Walks the demo scenario from SRS §19 as a real browser would (cookies,
 * CSRF token, JSON APIs) and checks the acceptance criteria that can be
 * checked without a UI: registration, login, transaction rules, portfolio
 * totals, watchlist duplicates, alerts firing once per crossing, user
 * isolation, and 401s for anonymous requests. Prints PASS/FAIL per step
 * and exits non-zero on any failure. Needs CRON_SECRET from .env.
 */
import { readFileSync } from "node:fs";

const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const env = Object.fromEntries(readFileSync(".env", "utf8").split("\n").filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }));
const stamp = Date.now();
let failures = 0;

function check(name, cond, detail = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`);
  if (!cond) failures++;
}

/** Minimal cookie jar per user session. */
function session() {
  const jar = new Map();
  const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  async function raw(path, init = {}) {
    const res = await fetch(base + path, { ...init, headers: { ...(init.headers ?? {}), cookie: cookieHeader() }, redirect: "manual" });
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pair] = c.split(";");
      const i = pair.indexOf("=");
      jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
    }
    return res;
  }
  async function api(method, path, body) {
    const res = await raw(path, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    let json = null;
    try { json = await res.json(); } catch { /* empty */ }
    return { status: res.status, json };
  }
  async function login(email, password) {
    const csrf = (await (await raw("/api/auth/csrf")).json()).csrfToken;
    const form = new URLSearchParams({ csrfToken: csrf, email, password, json: "true" });
    await raw("/api/auth/callback/credentials", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: form });
    // Auth.js answers with a redirect either way; the session endpoint tells the truth.
    const s = await (await raw("/api/auth/session")).json();
    return s?.user?.id ? 200 : 401;
  }
  return { api, login, raw };
}

const health = await (await fetch(base + "/api/health")).json();
check("health endpoint", health.ok === true, `provider=${health.data?.provider} instruments=${health.data?.instruments}`);

// ---- anonymous access is refused ------------------------------------------
const anon = session();
check("anonymous API request gets 401", (await anon.api("GET", "/api/portfolio")).status === 401);
const page = await anon.raw("/dashboard");
check("anonymous page redirects to /login", page.status === 307 && (page.headers.get("location") ?? "").includes("/login"));

// ---- register + login two users -------------------------------------------
const a = session(), b = session();
const emailA = `alice-${stamp}@smoke.local`, emailB = `bob-${stamp}@smoke.local`;
check("register user A", (await a.api("POST", "/api/register", { email: emailA, displayName: "Alice Smoke", password: "password1" })).status === 201);
check("register rejects a weak password", (await a.api("POST", "/api/register", { email: "x@smoke.local", displayName: "X", password: "short" })).status === 400);
check("register rejects a duplicate email", (await a.api("POST", "/api/register", { email: emailA, displayName: "Alice", password: "password1" })).status === 409);
check("login user A", (await a.login(emailA, "password1")) === 200);
check("login with a wrong password fails", (await session().login(emailA, "wrong-password")) !== 200 || (await session().api("GET", "/api/portfolio")).status === 401);
check("register + login user B", (await b.api("POST", "/api/register", { email: emailB, displayName: "Bob Smoke", password: "password1" })).status === 201 && (await b.login(emailB, "password1")) === 200);

// ---- search and stock detail ----------------------------------------------
const search = await a.api("GET", "/api/stocks/search?q=tcs");
const tcs = search.json?.data?.[0];
check("search finds TCS", tcs?.symbol === "TCS", tcs ? `${tcs.symbol} ${tcs.companyName}` : "");
const detail = await a.api("GET", `/api/stocks/${tcs.id}`);
check("stock detail has a quote with source and timestamp", !!detail.json?.data?.quote?.price && !!detail.json?.data?.quote?.dataStatus && !!detail.json?.data?.quote?.quoteTimestamp, `price=${detail.json?.data?.quote?.price} status=${detail.json?.data?.quote?.dataStatus}`);
const hist = await a.api("GET", `/api/stocks/${tcs.id}/history?range=1M`);
check("history returns daily candles", Array.isArray(hist.json?.data?.candles) && hist.json.data.candles.length > 5, `${hist.json?.data?.candles?.length} candles, status=${hist.json?.data?.status}`);

// ---- transactions -----------------------------------------------------------
const emptyPf = await a.api("GET", "/api/portfolio");
check("empty portfolio has zero holdings", emptyPf.json?.data?.summary?.holdingsCount === 0);
const t1 = await a.api("POST", "/api/transactions", { instrumentId: tcs.id, type: "BUY", tradeDate: "2025-06-02", quantity: "10", pricePerShare: "3300", charges: "20" });
check("buy 10 TCS @ 3300 + 20 charges", t1.status === 201);
const t2 = await a.api("POST", "/api/transactions", { instrumentId: tcs.id, type: "BUY", tradeDate: "2025-07-01", quantity: "10", pricePerShare: "3500", charges: "20" });
check("buy 10 more TCS @ 3500 (average cost case)", t2.status === 201);
check("rejects quantity 0", (await a.api("POST", "/api/transactions", { instrumentId: tcs.id, type: "BUY", tradeDate: "2025-07-01", quantity: "0", pricePerShare: "10" })).status === 400);
check("rejects negative price", (await a.api("POST", "/api/transactions", { instrumentId: tcs.id, type: "BUY", tradeDate: "2025-07-01", quantity: "1", pricePerShare: "-5" })).status === 400);
const overSell = await a.api("POST", "/api/transactions", { instrumentId: tcs.id, type: "SELL", tradeDate: "2025-08-01", quantity: "25", pricePerShare: "3600" });
check("rejects selling more than held", overSell.status === 400 && overSell.json?.error?.code === "NEGATIVE_HOLDING");
const t3 = await a.api("POST", "/api/transactions", { instrumentId: tcs.id, type: "SELL", tradeDate: "2025-08-01", quantity: "5", pricePerShare: "3600", charges: "10" });
check("sell 5 TCS @ 3600", t3.status === 201);

const pf = await a.api("GET", "/api/portfolio");
const h = pf.json?.data?.holdings?.find((x) => x.instrumentId === tcs.id);
// avg cost = (33020 + 35020) / 20 = 3402; sold 5 → cost 17010, proceeds 17990 → realized 980; remaining 15 @ 3402 = 51030
check("holding quantity 15 and average buy 3402", h?.quantity === "15" && h?.averageBuyPrice === "3402", `qty=${h?.quantity} avg=${h?.averageBuyPrice}`);
check("realized P&L 980", h?.realizedPnl === "980", `realized=${h?.realizedPnl}`);
check("invested (cost basis) 51030", pf.json?.data?.summary?.investedValue === "51030", `invested=${pf.json?.data?.summary?.investedValue}`);
check("current value uses a quote, not zero", h?.currentValue !== null && Number(h?.currentValue) > 0 && !!pf.json?.data?.summary?.valuationTimestamp, `value=${h?.currentValue} status=${pf.json?.data?.dataStatus}`);

const edit = await a.api("PATCH", `/api/transactions/${t3.json.data.id}`, { instrumentId: tcs.id, type: "SELL", tradeDate: "2025-08-01", quantity: "2", pricePerShare: "3600", charges: "10" });
check("edit sell to 2 shares recalculates", edit.status === 200 && (await a.api("GET", "/api/portfolio")).json?.data?.holdings?.find((x) => x.instrumentId === tcs.id)?.quantity === "18");
check("delete the first buy (still enough shares for the sell)", (await a.api("DELETE", `/api/transactions/${t1.json.data.id}`)).status === 200);
const delBuy = await a.api("DELETE", `/api/transactions/${t2.json.data.id}`);
check("delete of the last buy that would strand the sell is refused", delBuy.status === 400 && delBuy.json?.error?.code === "NEGATIVE_HOLDING");
check("transaction list shows 2 rows", (await a.api("GET", "/api/transactions")).json?.data?.total === 2);
const csv = await a.raw("/api/transactions/export");
check("CSV export downloads", csv.status === 200 && (await csv.text()).startsWith("trade_date,symbol"));

// ---- isolation ----------------------------------------------------------------
check("B cannot read A's transaction", (await b.api("GET", `/api/transactions/${t2.json.data.id}`)).status === 404);
check("B cannot edit A's transaction", (await b.api("PATCH", `/api/transactions/${t2.json.data.id}`, { instrumentId: tcs.id, type: "BUY", tradeDate: "2025-01-01", quantity: "1", pricePerShare: "1" })).status === 404);
check("B cannot delete A's transaction", (await b.api("DELETE", `/api/transactions/${t2.json.data.id}`)).status === 404);
check("B's portfolio is empty", (await b.api("GET", "/api/portfolio")).json?.data?.summary?.holdingsCount === 0);

// ---- watchlist -----------------------------------------------------------------
const infy = (await a.api("GET", "/api/stocks/search?q=infy")).json.data[0];
const w1 = await a.api("POST", "/api/watchlist", { instrumentId: infy.id });
check("add INFY to watchlist", w1.status === 201);
check("duplicate watchlist entry refused", (await a.api("POST", "/api/watchlist", { instrumentId: infy.id })).status === 409);
check("watchlist shows a price", (await a.api("GET", "/api/watchlist")).json?.data?.items?.[0]?.quote?.price !== undefined);
check("B cannot remove A's watchlist entry", (await b.api("DELETE", `/api/watchlist/${w1.json.data.id}`)).status === 404);
check("A removes it", (await a.api("DELETE", `/api/watchlist/${w1.json.data.id}`)).status === 200);

// ---- alerts and the scheduled checker ---------------------------------------------
const al = await a.api("POST", "/api/alerts", { instrumentId: tcs.id, condition: "ABOVE", thresholdPrice: "9000" });
check("create price-above alert", al.status === 201);
const cronHeaders = { authorization: `Bearer ${env.CRON_SECRET}` };
const cronNoAuth = await fetch(base + "/api/cron/check-alerts", { method: "POST" });
check("cron endpoint refuses without secret", cronNoAuth.status === 401);
const fire1 = await (await fetch(base + "/api/cron/check-alerts", { method: "POST", headers: { ...cronHeaders, "content-type": "application/json" }, body: JSON.stringify({ testQuotes: { [tcs.id]: "9100" } }) })).json();
check("test quote 9100 fires the alert once", fire1.data?.fired === 1, JSON.stringify(fire1.data));
const fire2 = await (await fetch(base + "/api/cron/check-alerts", { method: "POST", headers: { ...cronHeaders, "content-type": "application/json" }, body: JSON.stringify({ testQuotes: { [tcs.id]: "9200" } }) })).json();
check("still above: does not fire again", fire2.data?.fired === 0);
const notes = await a.api("GET", "/api/notifications");
check("notification appears for A", notes.json?.data?.total === 1 && notes.json.data.rows[0].type === "ALERT_TRIGGERED", notes.json?.data?.rows?.[0]?.title);
check("no notification for B", (await b.api("GET", "/api/notifications")).json?.data?.total === 0);
check("B cannot disable A's alert", (await b.api("PATCH", `/api/alerts/${al.json.data.id}`, { isEnabled: false })).status === 404);
check("A disables then deletes the alert", (await a.api("PATCH", `/api/alerts/${al.json.data.id}`, { isEnabled: false })).status === 200 && (await a.api("DELETE", `/api/alerts/${al.json.data.id}`)).status === 200);
check("mark notification read", (await a.api("PATCH", `/api/notifications/${notes.json.data.rows[0].id}`, { isRead: true })).status === 200);

// ---- market overview, profile, cleanup --------------------------------------------
const mk = await a.api("GET", "/api/market/overview");
check("market overview responds", mk.status === 200 && typeof mk.json?.data?.universe === "number", `indices=${mk.json?.data?.indices?.length} gainers=${mk.json?.data?.gainers?.length}`);
check("profile update", (await a.api("PATCH", "/api/profile", { displayName: "Alice Renamed" })).status === 200);
check("delete account A", (await a.api("DELETE", "/api/profile")).status === 200 && (await a.api("GET", "/api/portfolio")).status === 401);
check("delete account B", (await b.api("DELETE", "/api/profile")).status === 200);

console.log(failures === 0 ? "\nAll smoke checks passed." : `\n${failures} smoke check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
