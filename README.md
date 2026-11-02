# PortfolioPulse

**Personal investment portfolio tracker and market-insights dashboard for Indian listed equities (NSE).**

PortfolioPulse gives a retail investor one calm page to record buys and sells, see holdings valued at the latest available quote, follow a watchlist, and receive in-app alerts when a price crosses a chosen level. It is a tracking and education tool: it does not place trades, hold funds, give advice, or promise real-time prices. Every price on screen states its source and age.

| | |
|---|---|
| Project type | Third-year B.Tech project, MVP as specified in the PortfolioPulse SRS v1.0 |
| Status | MVP complete; all "Must" requirements implemented; verified end to end (see §11) |
| Stack | Next.js 15, TypeScript, Tailwind CSS, Prisma (SQLite / PostgreSQL), Auth.js, Recharts, Vitest; optional Rust service (Tokio) |
| Market data | Yahoo Finance (delayed, labelled) or built-in demo fixtures (labelled) |
| Data terms | Yahoo data is for personal, non-commercial use; see §6 |

---

## Table of contents

1. [Features](#1-features)
2. [Architecture](#2-architecture)
3. [Technology stack](#3-technology-stack)
4. [Getting started](#4-getting-started)
5. [Configuration](#5-configuration)
6. [Market data and data quality](#6-market-data-and-data-quality)
7. [Portfolio calculations](#7-portfolio-calculations)
8. [Alerts, notifications and the scheduled worker](#8-alerts-notifications-and-the-scheduled-worker)
9. [Optional live feed service (Rust)](#9-optional-live-feed-service-rust)
10. [API](#10-api)
11. [Testing and verification](#11-testing-and-verification)
12. [Security and privacy](#12-security-and-privacy)
13. [Requirements coverage](#13-requirements-coverage)
14. [Known limitations](#14-known-limitations)
15. [Roadmap](#15-roadmap)
16. [Deployment](#16-deployment)
17. [Project structure](#17-project-structure)
18. [Demo walkthrough](#18-demo-walkthrough)
19. [Disclaimer](#19-disclaimer)

---

## 1. Features

### Accounts
- Registration, login and logout with email and password (bcrypt hashes, JWT session cookie).
- Profile page: rename, log out, delete the account and every record it owns.
- Private routes and APIs are protected by middleware; every record is scoped to the logged-in user on the server.

### Portfolio tracking
- Manual buy and sell transactions with trade date, quantity, price per share, optional brokerage and charges, and notes.
- Server-side validation: positive quantity and price, no future dates, and a sell can never take a holding below zero on its date, including when editing or deleting earlier transactions.
- Holdings per stock: quantity, average buy price, invested amount, latest price with data status, current value, unrealized, realized and total P&L.
- Closed positions with their realized P&L.
- Transaction history with edit, confirmed delete, pagination and CSV export.

### Dashboard
- Invested amount, estimated current value, total P&L with return %, and today's change.
- Holdings summary and today's largest positive and negative contributors, with the formula stated.
- Allocation by holding and by sector.
- Portfolio-value chart from daily valuations recorded by the worker.
- Valuation timestamp, data-status badge, stale and missing-quote warnings, and an empty state for new users.

### Stocks and discovery
- Search 50 supported NSE stocks by symbol or company name (keyboard-accessible combobox).
- Stock detail: latest price, day change, previous close, volume, quote time, fetch time, provider and status; daily price chart for 1M / 3M / 6M / 1Y; add to watchlist; create an alert; add a transaction.
- Explore page: indices (NIFTY 50, SENSEX, NIFTY BANK) and today's top gainers and losers among the supported set, with coverage and timestamp stated.

### Watchlist
- Add and remove stocks, duplicate prevention, latest price and day change, sort by name, change or percentage.

### Price alerts and notifications
- Price-above and price-below alerts; edit, enable, disable, delete.
- Scheduled evaluation against the latest available quote; an alert fires once per crossing and re-arms when the price crosses back.
- In-app notification list with read/unread state and an unread badge in the navigation.
- A controlled "test quote" mode for demonstrations.

### Data quality and UI states
- Every quote carries provider, quote timestamp, fetch timestamp and a status: LIVE, DELAYED, END_OF_DAY, CACHED or DEMO.
- A failed refresh keeps the last stored quote and marks it stale; a missing quote is never shown as zero.
- Rate-limit responses pause provider calls instead of retrying in a loop.
- Loading, empty, error, stale-data and session-expiry states on every data screen; labelled form fields with inline errors; single-column layout on phones.

### Optional live feed (beyond the MVP)
- A separate Rust service that polls quotes asynchronously, re-marks all positions with a SIMD kernel, streams per-user totals over WebSocket, and can mirror ticks into ClickHouse. The web app is complete without it (§9).

---

## 2. Architecture

```
                 ┌──────────────────────────────────────────────────────────────┐
  browser ──────►│  Next.js 15 (src/app)                                        │
                 │   pages (server components) ──► services ──► Prisma ──► DB   │
                 │   /api/* route handlers ───────► services ──┘                │
                 │   middleware: session check on every private route           │
                 │   lib/market-data: provider adapter + QuoteSnapshot cache     │
                 └──────────┬───────────────────────────────┬───────────────────┘
                            │ POST /api/cron/check-alerts    │ /api/internal/{positions,quotes}
                            │ (Bearer CRON_SECRET)           │ (Bearer CRON_SECRET)
             scripts/alert-worker.ts                services/pulsefeed (Rust, optional)
             every N seconds: refresh quotes,       Tokio poll loop ─► SoA state ─► AVX2 P&L
             evaluate alerts, record valuation      ─► push quotes to the app
                                                    ─► WebSocket /live to browsers
                                                    ─► ClickHouse quote_ticks (optional)
                                           ▲
     Yahoo Finance v8 chart / demo fixtures ┘   (the app's own adapter uses the same endpoint)
```

Layers, each in its own module (NFR-09):

| Layer | Location | Responsibility |
|---|---|---|
| UI | `src/app`, `src/components` | server-rendered pages, client forms and charts |
| API | `src/app/api` | request validation (zod), session resolution, response envelope |
| Services | `src/lib/services` | all reads and writes; every function takes `userId` first and scopes every query by it |
| Domain | `src/lib/portfolio.ts`, `src/lib/alerts.ts`, `src/lib/money.ts` | pure, tested calculation rules |
| Market data | `src/lib/market-data` | provider interface, demo and Yahoo adapters, quote cache, freshness and failure rules |
| Persistence | `prisma/schema.prisma` | data model and migrations |
| Jobs | `scripts/alert-worker.ts`, `/api/cron/check-alerts` | scheduled quote refresh, alerts, valuations |
| Optional feed | `services/pulsefeed` | async ingestion, SIMD P&L, WebSocket streaming, ClickHouse mirror |

More detail: `docs/architecture.md`, `docs/data-model.md` (ER diagram), `docs/api.md`.

---

## 3. Technology stack

| Concern | Choice | Why |
|---|---|---|
| Framework | Next.js 15.1 (App Router), React 19, TypeScript 5.7 | one codebase for pages and API; server components for data pages |
| Styling | Tailwind CSS 3.4, hand-written primitives | small, consistent, accessible; no component-library install step |
| Charts | Recharts 2.15 | portfolio and price charts with text summaries |
| Database | Prisma 6.3; SQLite by default, PostgreSQL by changing one line | zero-setup local run; relational, user-owned records |
| Auth | Auth.js v5 (credentials provider), bcryptjs | runs with no external account; JWT sessions in an HTTP-only cookie |
| Money | decimal.js | no binary-float drift; rounding only at display time |
| Validation | zod | the server is the authority for every input |
| Tests | Vitest | unit tests for rules, integration tests on a real SQLite file |
| Market data | Yahoo Finance v8 chart endpoint via `fetch`; demo generator | public endpoint that works without a login cookie; demo needs no network |
| Optional feed | Rust 2021, Tokio, tokio-tungstenite, reqwest (rustls), `std::arch` AVX2 | async ingestion, SIMD mark-to-market, WebSocket server |
| Analytics (optional) | ClickHouse over HTTP | historical tick storage and SQL views |

---

## 4. Getting started

Requirements: Node.js 20 or newer. The default database is a local SQLite file, so nothing else needs installing.

```sh
git clone <repository>
cd portfoliopulse
cp .env.example .env            # Windows: copy .env.example .env
npm install
npm run setup                   # migrate, seed 50 NSE stocks and a demo user
npm run dev                     # http://localhost:3000
```

Demo account: `demo@portfoliopulse.local` / `demo12345` (a few sample transactions marked "Sample data").

By default the app uses the **demo** provider: generated prices, labelled "Demo data" on every page and in a banner. Switch to real delayed quotes in §5.

| Script | Purpose |
|---|---|
| `npm run dev` / `npm run build` / `npm start` | develop / production build / run |
| `npm run setup` | apply migrations and seed; safe to repeat |
| `npm run worker` | scheduled alert checker and daily valuation (§8) |
| `npm test` | unit and integration tests |
| `npx tsx scripts/check-provider.ts yahoo` | prove the real provider works from your network |
| `node scripts/smoke.mjs` | end-to-end API check against a running app |
| `scripts\verify.ps1` / `./scripts/verify.sh` | regenerate `VERIFICATION.md` (§11) |
| `npm run db:reset` | wipe and re-seed |
| `npm run db:studio` | browse the database |

---

## 5. Configuration

All settings live in `.env` (template: `.env.example`). Secrets are read only on the server.

| Variable | Default | Meaning |
|---|---|---|
| `DATABASE_URL` | `file:./dev.db` | SQLite file, or a PostgreSQL URL after changing `provider` in `prisma/schema.prisma` |
| `AUTH_SECRET` | (set one) | session signing key; `npx auth secret` generates one |
| `AUTH_TRUST_HOST` | `true` | required behind a proxy |
| `MARKET_DATA_PROVIDER` | `demo` | `demo` or `yahoo` |
| `QUOTE_FRESHNESS_MINUTES` | `20` | older quotes are refreshed on view and labelled stale if the refresh fails |
| `CRON_SECRET` | (set one) | bearer token for `/api/cron/*` and `/api/internal/*` |
| `WORKER_INTERVAL_SECONDS` | `300` | polling interval of `npm run worker` |
| `PULSEFEED_WS_URL` | unset | set to `ws://127.0.0.1:8790` only while the Rust feed is running (§9) |

---

## 6. Market data and data quality

**Adapter interface** (`src/lib/market-data/types.ts`): `getQuote`, `getQuotes`, `getHistory`, `getIndices`. Each adapter returns a provider-independent shape with a mandatory `dataStatus`.

**Providers**
- `demo`: deterministic random walk per symbol, labelled `DEMO`; no network.
- `yahoo`: Yahoo Finance's public v8 chart endpoint, one request per symbol with at most six in flight; quotes labelled `DELAYED` (Yahoo's NSE data is not real time, so nothing is ever labelled `LIVE`). Indices: NIFTY 50, SENSEX, NIFTY BANK.

**Rules implemented in `src/lib/market-data/index.ts`** (FR-DATA-01..07)
- Every retrieved quote is stored in `QuoteSnapshot` with `quoteTimestamp`, `fetchedAt`, `provider` and `dataStatus`.
- A page refreshes only quotes older than `QUOTE_FRESHNESS_MINUTES`.
- If the provider fails, the last stored quote is returned with `isStale = true` and the error is shown in the UI; the stored row is never overwritten with bad data.
- After an HTTP 429 the provider is not called again for five minutes.
- An instrument with no stored quote yields `null`: the holding is listed without a value and excluded from totals, and the dashboard says how many were excluded.

**Coverage**: 50 NSE large and mid caps in `src/lib/instruments.ts`. Extend the list and run `npm run setup`; symbols removed from the list are retired (hidden from search, kept for existing transactions).

**Terms**: Yahoo's data is for personal, non-commercial use and the endpoint is unofficial. Acceptable for a student project with attribution; review before any public deployment. A licensed provider is one new adapter file.

---

## 7. Portfolio calculations

Implemented as pure functions over decimal arithmetic in `src/lib/portfolio.ts`, covered by `tests/portfolio.test.ts`, and summarised on the dashboard (SRS §7).

| Quantity | Rule |
|---|---|
| Gross value | quantity × price per share |
| Buy cash out | gross + charges; charges are added to the cost basis |
| Sell cash in | gross − charges |
| Holding quantity | total bought − total sold, replayed in trade-date order; a sell that would go negative on its date is rejected |
| Average buy price | remaining cost basis ÷ remaining quantity (weighted average) |
| Realized P&L (per sell) | (quantity × price − charges) − quantity × average cost at that time |
| Current value | quantity × latest available price |
| Unrealized P&L | current value − remaining cost basis |
| Total P&L | realized + unrealized |
| Return % | total P&L ÷ cost of all buys ever made (charges included); a simple cost-based figure, not time- or money-weighted |
| Today's change | Σ quantity × (latest price − previous close), shown only when every valued holding has a previous close |
| Display | ₹ with Indian grouping (12,34,567.89); rounding at display time only |

Corporate actions are not modelled (§14).

---

## 8. Alerts, notifications and the scheduled worker

- An alert is "notify me when `SYMBOL` goes above or below ₹X".
- `POST /api/cron/check-alerts` (bearer `CRON_SECRET`) refreshes quotes for alerted stocks, evaluates every enabled alert, writes a notification for each new crossing, and records today's `PortfolioValuation` per user.
- `npm run worker` calls that endpoint every `WORKER_INTERVAL_SECONDS` and backs off when the app reports a provider rate limit. Any platform cron can replace it.
- Once-per-crossing rule (`src/lib/alerts.ts`): an alert fires when its condition becomes true while it is armed; it stays triggered while the condition holds; it re-arms when the price crosses back or when the user edits the rule.
- The alerts page states that delivery depends on quote availability and the polling interval.
- Demonstration without real prices:

```sh
curl -X POST http://localhost:3000/api/cron/check-alerts \
  -H "Authorization: Bearer $CRON_SECRET" -H "content-type: application/json" \
  -d '{"testQuotes":{"<instrumentId>":"9100"}}'
```

Email delivery is not implemented (second release in the SRS).

---

## 9. Optional live feed service (Rust)

`services/pulsefeed` is a standalone Rust service added on top of the MVP. The web app does not depend on it; with `PULSEFEED_WS_URL` unset nothing changes.

| Feature | Implementation |
|---|---|
| Async ingestion | Tokio poll loop; every `--poll-seconds` (default 60) all 50 symbols are fetched with bounded concurrency (6 in flight) from the same Yahoo v8 endpoint, or a demo generator |
| Integration with the app | `GET /api/internal/positions` (universe and every user's open positions: quantity and cost only) and `POST /api/internal/quotes` (feed pushes quotes into `QuoteSnapshot`), both behind `CRON_SECRET` |
| P&L | positions kept in Structure-of-Arrays memory; after each poll an AVX2 fused-multiply-subtract kernel recomputes every position's unrealized P&L (runtime feature detection, scalar fallback, equivalence test) |
| WebSocket streaming | browsers obtain a 5-minute HMAC-SHA256 token from `/api/live-token`; the feed verifies it and streams that user's current value, unrealized P&L and quote time after each poll; the dashboard shows a "Live feed connected" strip and hides it after three failed connection attempts |
| Self-healing | exponential back-off on provider or app failures, 15-minute cap after HTTP 429, universe re-fetched every 5 polls, `GET /health` reporting polls, failures, time since last success, SIMD in use, connected clients |
| ClickHouse (optional) | when `CLICKHOUSE_URL` is set, each poll's quotes are appended to `quote_ticks`; `services/pulsefeed/sql/clickhouse.sql` defines the table and views for daily OHLC, unusual volume (volume vs 20-day average) and 20-day volatility |

Run it:

```sh
# Rust from https://rustup.rs (Windows without Visual Studio: choose x86_64-pc-windows-gnu)
cd services/pulsefeed && cargo build --release && cd ../..
# .env: PULSEFEED_WS_URL="ws://127.0.0.1:8790"
CRON_SECRET=<same as .env> services/pulsefeed/target/release/pulsefeed --provider yahoo
node scripts/live-check.mjs       # logs in as the demo user and prints the WebSocket messages
curl http://127.0.0.1:8791/health
```

Scope statement: polling a public endpoint once a minute is not an exchange feed, and the SIMD kernel's capacity far exceeds a student deployment's needs. Its purpose is to implement these techniques correctly, test them, and have the service measure itself.

---

## 10. API

Envelope: `{ ok: true, data }` or `{ ok: false, error: { code, message, fields? } }`. Decimals are strings, dates ISO 8601. All user endpoints require the session cookie; the user is taken from the session, never from the request; another user's record by id returns 404.

| Area | Endpoints |
|---|---|
| Public | `GET /api/health`, `POST /api/register`, `/api/auth/*` |
| Stocks | `GET /api/stocks/search?q=`, `GET /api/stocks/:id`, `GET /api/stocks/:id/history?range=` |
| Portfolio | `GET /api/portfolio`, `GET /api/portfolio/history?days=` |
| Transactions | `GET/POST /api/transactions`, `GET/PATCH/DELETE /api/transactions/:id`, `GET /api/transactions/export` |
| Watchlist | `GET/POST /api/watchlist`, `DELETE /api/watchlist/:id` |
| Alerts | `GET/POST /api/alerts`, `PATCH/DELETE /api/alerts/:id` |
| Notifications | `GET /api/notifications`, `PATCH /api/notifications/:id`, `POST /api/notifications/read-all` |
| Market | `GET /api/market/overview` |
| Account | `GET/PATCH/DELETE /api/profile` |
| Feed | `GET /api/live-token` |
| Internal (bearer `CRON_SECRET`) | `POST /api/cron/check-alerts`, `GET /api/internal/positions`, `POST /api/internal/quotes` |

Full table with bodies and error codes: `docs/api.md`.

---

## 11. Testing and verification

### Automated tests (`npm test`, 24 tests)
- `tests/portfolio.test.ts`: totals with charges, weighted-average cost, partial and full sells, trade-date ordering, sell-exceeds-holding rejection, unrealized/total/return %, missing quote never zero, stale counting, empty portfolio, ₹ formatting.
- `tests/alerts.test.ts`: conditions and the once-per-crossing rule.
- `tests/services.test.ts` (real SQLite): create/edit/delete with recalculation, refusal of deletes that would strand a sell, watchlist duplicates, alert check with controlled quotes, notification ownership, provider failure keeping the stored quote, account deletion cascading, and user isolation for transactions, watchlist, alerts and notifications.
- `services/pulsefeed` (`cargo test`, 5 tests): SIMD equals scalar, token verification and rejection, per-user totals excluding unvalued positions, timestamp formatting.

### End-to-end (`node scripts/smoke.mjs`, 50 checks)
Runs the SRS §15 acceptance criteria over HTTP against a running app: anonymous 401 and redirect; registration rules; login; search; quote with source and timestamp; chart data; transaction validation with exact expected figures for a three-trade sequence (average buy ₹3,402, realized ₹980); edit and delete recalculation; CSV export; cross-user 404s; watchlist duplicates; cron authentication; alert firing once per crossing; notification ownership; market overview; profile update; account deletion ending the session.

### Verification record
`scripts/verify.ps1` (or `verify.sh`) runs tests, type-check, build, migrations and seed, the smoke test, both provider checks, the cron endpoint, the feed's build and tests, one real feed poll, and the WebSocket live check, and writes the unedited output to `VERIFICATION.md`.

Result on the build machine (Windows 11, Node 24, Rust 1.99, 2026-11-03): all ten steps completed.

| Claim | Status | Evidence / how to verify |
|---|---|---|
| Calculation and alert rules, services, user isolation | Verified | `npm test` (`VERIFICATION.md` §1) |
| Type-check and production build | Verified | §2 |
| Acceptance criteria end to end | Verified, 50 checks | §4 |
| Demo provider offline | Verified | §5 |
| Real delayed NSE quotes, history, indices | Verified | `npx tsx scripts/check-provider.ts yahoo` (§6) |
| Scheduled check and valuations | Verified | §7 |
| Feed build, SIMD equivalence, tokens | Verified | §8 |
| Feed polls Yahoo and pushes quotes into the app | Verified: 49 of 50 symbols in the recorded run; the failure was `TATAMOTORS.NS`, delisted on Yahoo after the demerger and replaced in the seed afterwards | §9 |
| WebSocket totals reach a logged-in client | Verified | `node scripts/live-check.mjs` (§10) |
| UI on desktop and mobile | Partly: pages build and render; no automated browser test, no screenshots recorded | open the app at both widths |
| ClickHouse mirror and views | Not verified (no ClickHouse on the build machine) | run ClickHouse, apply `services/pulsefeed/sql/clickhouse.sql`, run the feed with `CLICKHOUSE_URL`, check `/health` → `clickhouse_rows` |
| PostgreSQL | Not verified (built on SQLite) | switch provider, `npx prisma migrate dev`, `npm test` |
| Real provider rate limit | Not observed | pause logic is unit-level; watch `/health` → `paused_for_s` |
| NFR-03 response time | Not measured | `curl -w "%{time_total}" .../api/portfolio` |
| Accessibility audit | Not audited beyond labels, focus styles and chart captions | axe / Lighthouse |

---

## 12. Security and privacy

- Passwords are stored only as bcrypt hashes (cost 12); never logged or returned.
- Sessions are JWTs in an HTTP-only cookie; deleting an account ends the session and later requests re-check that the account exists.
- Every private query is scoped by the session's user id; ids from the request are never trusted (NFR-05).
- All inputs are validated with zod on the server (NFR-06); internal error details never reach the browser.
- Provider calls and secrets are server-side only; nothing prefixed `NEXT_PUBLIC_` carries a secret.
- Only email, display name and the user's own portfolio records are stored; no trackers. Privacy notice at `/privacy`.
- Not included: email verification, password reset, request rate limiting (put it in the reverse proxy).

---

## 13. Requirements coverage

Every FR and NFR id from the SRS is mapped to its implementation and its check in `docs/srs-coverage.md`. Summary:

- All **Must** requirements in §6.1–§6.9 are implemented and exercised by tests or the smoke run.
- **Should** items delivered: brokerage charges, realized/unrealized split, CSV export, daily change, portfolio chart, allocation by holding and sector, watchlist sorting, indices and movers, profile page, account deletion.
- **Could / partial**: unusual volume exists as a ClickHouse view only; market session state is deliberately not shown because the provider does not report it.
- **Not delivered**: email notifications (FR-ALT-08), CSV import, news links, AI explanations.

---

## 14. Known limitations

- Corporate actions (splits, bonuses, rights, mergers, demergers) are not modelled; adjust by editing transactions. Example met during verification: Yahoo stopped serving `TATAMOTORS.NS` after the Tata Motors demerger; the seed now lists `TMPV` (Tata Motors Passenger Vehicles) and `npm run setup` retires symbols that leave the list.
- Return % is cost-based, not time- or money-weighted.
- The portfolio-value chart needs the worker to have recorded at least two days.
- Movers and unusual volume cover only the 50 supported stocks.
- One account equals one portfolio; no dividends, mutual funds, multiple portfolios or broker import. Brokers such as Groww offer no public account API; holdings are entered manually.
- Yahoo Finance is an unofficial, non-commercial data source; quotes are delayed.
- Demo credentials and sample `.env` secrets are for local use only.

---

## 15. Roadmap

Second release, in the order the SRS suggests:
1. CSV import of broker exports with a column-mapping and validation step.
2. Email notifications for triggered alerts.
3. Daily or weekly portfolio summary.
4. Unusual-volume indicator in the app (currently a ClickHouse view).
5. News links per stock where a permitted source exists.

Stretch: benchmark comparison, dividends, multiple portfolios, mutual funds, mobile app, AI explanations grounded in the app's own figures.

---

## 16. Deployment

- Generate real `AUTH_SECRET` and `CRON_SECRET`; set `AUTH_TRUST_HOST=true` behind a proxy; serve over HTTPS.
- Use PostgreSQL: change `provider` in `prisma/schema.prisma`, set `DATABASE_URL`, run `npx prisma migrate deploy`.
- Run `scripts/alert-worker.ts` as a process, or point a platform cron at `POST /api/cron/check-alerts` with the bearer token.
- Optional: run the Rust feed as a second process and set `PULSEFEED_WS_URL` to its public WebSocket address.
- Suitable targets: Vercel or any Node host plus managed PostgreSQL; the feed needs a long-running host.

---

## 17. Project structure

```
.env.example                 configuration template
prisma/schema.prisma         data model (SQLite default)
prisma/migrations/           migration history
prisma/seed.ts               instrument master, demo user, retirement of dropped symbols
src/app/                     pages: landing, login, register, privacy, (app)/dashboard, portfolio,
                             transactions/new, transactions/[id]/edit, explore, stocks/[id],
                             watchlist, alerts, notifications, profile; loading and error boundaries
src/app/api/                 route handlers (see §10)
src/middleware.ts            route protection
src/components/              UI primitives, forms, stock search, charts, action buttons, live strip
src/lib/portfolio.ts         calculation rules
src/lib/alerts.ts            alert evaluation
src/lib/money.ts             decimal helpers and ₹ formatting
src/lib/validation.ts        zod schemas
src/lib/auth.ts, password.ts Auth.js config and hashing
src/lib/api.ts, errors.ts    response envelope, validation errors, session helper
src/lib/market-data/         types, demo adapter, yahoo adapter, cache and freshness rules
src/lib/services/            transactions, portfolio, watchlist, alerts, instruments, users
src/lib/instruments.ts       supported stock list
scripts/alert-worker.ts      scheduled worker
scripts/smoke.mjs            end-to-end API checks
scripts/check-provider.ts    provider check
scripts/live-check.mjs       feed WebSocket check
scripts/verify.ps1, .sh      regenerate VERIFICATION.md
services/pulsefeed/          Rust feed: config, provider, state (SoA), pnl (AVX2), ws, health,
                             app_client, clickhouse; sql/clickhouse.sql
tests/                       Vitest unit and integration tests
docs/                        architecture, API, data model (ER), SRS coverage
VERIFICATION.md              generated verification record
```

---

## 18. Demo walkthrough

1. `npm run setup && npm run dev`; open <http://localhost:3000>; log in as the demo user or register.
2. Dashboard: invested amount, current value, P&L, quote timestamp, data-status badge.
3. Explore → search "TCS" → open the stock: quote with source, chart.
4. Add transaction: buy 10 TCS at ₹3,300 with ₹20 charges; then buy 10 at ₹3,500. The average buy price becomes ₹3,402.
5. Sell 5 at ₹3,600 with ₹10 charges: realized P&L ₹980 on the portfolio page.
6. Add INFY to the watchlist; adding it again is refused.
7. Create an alert "TCS above 9000"; run the test-quote `curl` from §8 with `"9100"`: a notification appears; run it again with `"9200"`: it does not fire twice.
8. Set `MARKET_DATA_PROVIDER` to an invalid value or disconnect the network and reload: quotes show as stale with the error, never as zero.
9. Optional: start the Rust feed and show the live strip.

---

## 19. Disclaimer

PortfolioPulse is a personal portfolio tracking and financial-education project. It does not execute trades, provide investment advice, guarantee quote accuracy or availability, or predict future market performance. Portfolio values and returns are estimates based on user-entered transactions and the latest available market data. Verify important financial information with your broker or an official source.
