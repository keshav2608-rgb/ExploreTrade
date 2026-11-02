# SRS coverage

Requirement ids from the PortfolioPulse SRS v1.0, with where each one lives and how it is checked. "smoke" = `scripts/smoke.mjs` (run by `scripts/verify.*`, output in `VERIFICATION.md`); "unit" = `npm test`.

| ID | Status | Where | Checked by |
|---|---|---|---|
| FR-AUTH-01..04 | Done | `src/lib/auth.ts`, `src/middleware.ts`, `src/app/api/register` | smoke: register, login, 401, redirect |
| FR-AUTH-05 | Done | `/profile` | smoke: profile update |
| FR-AUTH-06 | Done | `DELETE /api/profile` (cascades, ends session) | smoke + unit |
| FR-STK-01..05 | Done | `/explore`, `/stocks/[id]`, `services/instruments.ts` | smoke: search, detail with status + timestamp |
| FR-STK-06 | Done | day change from previous close | smoke |
| FR-STK-07 | Done | chart ranges 1M/3M/6M/1Y | smoke: history |
| FR-STK-08 | Done (volume, previous close) | stock detail | manual |
| FR-STK-09 | Done | `ErrorBox` states on stock page | unit: provider failure |
| FR-TXN-01..03, 05..10 | Done | `services/transactions.ts`, `lib/portfolio.ts` | smoke + unit |
| FR-TXN-04 | Done | charges field | smoke numbers include charges |
| FR-TXN-11 | Done | realized and unrealized columns | smoke |
| FR-TXN-12 | Done | `/api/transactions/export` | smoke: CSV |
| FR-DASH-01..03, 05, 08, 09 | Done | `/dashboard` | smoke (totals), manual (empty state) |
| FR-DASH-04 | Done, shown only when every valued holding has a previous close | `summarize()` | unit |
| FR-DASH-06 | Done, needs ≥ 2 daily valuations from the worker | `PortfolioValuation` | smoke: `valuationsRecorded` |
| FR-DASH-07 | Done | allocation by holding and sector | manual |
| FR-WL-01..06 | Done | `services/watchlist.ts`, `/watchlist` | smoke + unit |
| FR-MKT-01..03 | Done, movers computed over the supported set and labelled as such | `/explore` | smoke: overview |
| FR-MKT-04 | Partial: SQL view in ClickHouse only (`unusual_volume`), not in the UI | `services/pulsefeed/sql` | not verified (no ClickHouse) |
| FR-MKT-05 | Done by omission: session state is not shown because the provider does not report it | `/explore` footnote | — |
| FR-MKT-06 | Done | DEMO label and banner | smoke: status fields |
| FR-ALT-01..07, 09 | Done | `lib/alerts.ts`, `services/alerts.ts`, `/alerts` | smoke + unit (fires once per crossing) |
| FR-ALT-08 | Not done (email) | — | — |
| FR-INS-01 | Done | dashboard contributors | manual |
| FR-INS-02 | Partial (ClickHouse view only) | see FR-MKT-04 | — |
| FR-INS-03, 04 | Done | explanatory text on dashboard and explore | manual |
| FR-INS-05, 06 | N/A (no AI features) | — | — |
| FR-DATA-01..07 | Done | `lib/market-data/index.ts` | unit: provider failure keeps stored quote, stale flag; missing quote null |
| NFR-01, 02 | Done by design; not user-tested | forms, responsive layout | manual |
| NFR-03 | Not measured | — | `curl -w %{time_total}` |
| NFR-04..08, 13, 14 | Done | bcrypt, userId-scoped services, zod, cascades, transactions | smoke + unit |
| NFR-09 | Done | layout in `src/lib` | — |
| NFR-10 | Done | server logs errors without secrets | — |
| NFR-11 | Not tested across browsers | — | manual |
| NFR-12 | Done: worker and feed are separate processes | — | — |

Second-release items delivered early: CSV export, allocation by sector, daily valuation chart. Not delivered: email notifications, CSV import, news links.
