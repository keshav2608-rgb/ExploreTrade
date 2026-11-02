#!/usr/bin/env node
/**
 * Checks the optional live feed end to end: logs in as the demo user,
 * asks the app for a WebSocket token, connects to PulseFeed and waits for
 * a `portfolio` message. Prints what it received.
 *
 *   node scripts/live-check.mjs [http://localhost:3000] [seconds]
 *
 * Exit codes: 0 received a portfolio message; 2 feed not configured
 * (app returned 204 for /api/live-token); 1 any other failure.
 */
const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const seconds = Number(process.argv[3] ?? 20);
const jar = new Map();
const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
async function raw(path, init = {}) {
  const res = await fetch(base + path, { ...init, headers: { ...(init.headers ?? {}), cookie: cookie() }, redirect: "manual" });
  for (const c of res.headers.getSetCookie?.() ?? []) { const [pair] = c.split(";"); const i = pair.indexOf("="); jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim()); }
  return res;
}

const csrf = (await (await raw("/api/auth/csrf")).json()).csrfToken;
await raw("/api/auth/callback/credentials", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ csrfToken: csrf, email: "demo@portfoliopulse.local", password: "demo12345", json: "true" }) });
const session = await (await raw("/api/auth/session")).json();
if (!session?.user?.id) { console.error("login as demo user failed (run `npm run setup` to seed it)"); process.exit(1); }

const tok = await raw("/api/live-token");
if (tok.status === 204) { console.log("live feed not configured (PULSEFEED_WS_URL unset); nothing to check"); process.exit(2); }
const { data } = await tok.json();
console.log(`token ok, connecting to ${data.url}/live …`);

const ws = new WebSocket(`${data.url}/live?token=${encodeURIComponent(data.token)}`);
const got = [];
ws.onopen = () => console.log("connected");
ws.onmessage = (e) => { const m = JSON.parse(e.data); got.push(m); console.log("received:", JSON.stringify(m)); if (m.type === "portfolio" && m.dataStatus !== "CACHED") { ws.close(); finish(); } };
ws.onerror = () => { console.error("websocket error (is pulsefeed running?)"); process.exit(1); };
const timer = setTimeout(() => { console.log(got.some((m) => m.type === "portfolio") ? "only the initial snapshot arrived within the window" : "no portfolio message received"); process.exit(got.some((m) => m.type === "portfolio") ? 0 : 1); }, seconds * 1000);
function finish() { clearTimeout(timer); console.log(`ok: ${got.length} message(s), including a post-poll portfolio update`); process.exit(0); }
