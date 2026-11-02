# Architecture

PortfolioPulse is one Next.js application (UI + API in the same process), a
SQLite or PostgreSQL database through Prisma, a market-data adapter, a
scheduled worker, and an optional Rust feed service.

```
                 ┌────────────────────────────────────────────────────────────┐
  browser ──────►│  Next.js 15 (src/app)                                      │
  (pages, fetch) │   pages (server components) ─► services ─► Prisma ─► DB    │
                 │   /api/* route handlers ─────► services ─┘                 │
                 │   middleware: session check on every private route         │
                 │   lib/market-data: provider adapter + QuoteSnapshot cache   │
                 └───────┬───────────────────────────────┬────────────────────┘
                         │ /api/cron/check-alerts         │ /api/internal/{positions,quotes}
                         │ (Bearer CRON_SECRET)           │ (Bearer CRON_SECRET)
     scripts/alert-worker.ts                     services/pulsefeed (Rust, optional)
     every N seconds: refresh quotes,            Tokio poll loop ─► SoA state ─► AVX2 P&L
     evaluate alerts, record valuation           ─► push quotes to app
                                                 ─► WebSocket /live to browsers (HMAC token)
                                                 ─► ClickHouse quote_ticks (optional)
                                        ▲
  Yahoo Finance v8 chart / demo fixtures ┘  (the app's own adapter uses the same endpoint)
```

## Request path for a page

1. The browser requests `/dashboard`. `src/middleware.ts` verifies the
   session cookie (Auth.js JWT) and redirects to `/login` if absent.
2. The server component calls a service, e.g. `getPortfolio(userId)`, with
   the id from the session. Services take `userId` as their first argument
   and put it in every query; there is no code path that reads a user id
   from the request.
3. The service loads the user's transactions, asks `lib/market-data` for
   quotes (stored `QuoteSnapshot` rows, refreshed from the provider when
   older than `QUOTE_FRESHNESS_MINUTES`), and runs the pure calculations in
   `lib/portfolio.ts`.
4. The page renders with the quote timestamp and data-status label next to
   every valued figure.

## Request path for an action

Client components call `/api/...` with `fetch`. Route handlers validate the
body with zod (`lib/validation.ts`), resolve the user from the session,
call the service, and answer with `{ ok, data }` or `{ ok: false, error }`.
Errors carry field messages the forms show inline.

## Market-data layer

`lib/market-data/index.ts` is the only module the rest of the app talks to
for prices. It:

- picks the provider from `MARKET_DATA_PROVIDER` (`demo` or `yahoo`);
- caches every quote in `QuoteSnapshot` with `quoteTimestamp`, `fetchedAt`,
  `provider` and `dataStatus`;
- keeps the last stored quote when a refresh fails and marks it stale;
- pauses provider calls for five minutes after an HTTP 429;
- returns `null` (never zero) when no quote exists.

## Scheduled work

`scripts/alert-worker.ts` is a small Node loop that calls
`POST /api/cron/check-alerts` with the shared secret. Any platform cron can
replace it. The endpoint refreshes quotes for alerted instruments,
evaluates alerts with the pure rule in `lib/alerts.ts`, writes
notifications, and records one `PortfolioValuation` row per user per day.

## Optional live feed (services/pulsefeed)

The app is complete without it. When it runs, it polls the provider on a
fixed interval with bounded concurrency, pushes quotes into the app so every
page benefits, keeps all users' open positions in Structure-of-Arrays memory
and re-marks them with an AVX2 kernel after each poll, and streams per-user
totals over WebSocket to browsers that hold an HMAC token minted by the app.
If `CLICKHOUSE_URL` is set it also appends every poll's quotes to a
ClickHouse table for historical analytics (see `services/pulsefeed/sql`).

The dashboard's live strip appears only when `PULSEFEED_WS_URL` is set and
the feed answers; otherwise the dashboard behaves as a plain server-rendered
page with a "Refresh quotes" button.
