# API

All endpoints return JSON in one envelope:

```json
{ "ok": true,  "data": { ... } }
{ "ok": false, "error": { "code": "VALIDATION", "message": "Please correct the highlighted fields.", "fields": { "quantity": "Quantity must be greater than zero" } } }
```

Decimals are strings (never floats), dates are ISO 8601. Every endpoint
except those marked *public* requires the session cookie; the user is taken
from the session, never from the request. Unauthenticated calls get `401`.
Accessing another user's record by id gives `404`.

| Method | Path | Purpose | Notes |
|---|---|---|---|
| GET | `/api/health` | liveness, instrument count, provider | public |
| POST | `/api/register` | create an account | public; `{ email, displayName, password }` |
| GET/POST | `/api/auth/*` | Auth.js sign-in, sign-out, session, csrf | public |
| GET | `/api/stocks/search?q=` | search supported instruments by symbol or name | |
| GET | `/api/stocks/:id` | instrument + latest quote (`quote` may be `null`) + `watchlistItemId` | |
| GET | `/api/stocks/:id/history?range=1M|3M|6M|1Y` | daily candles from the provider | `candles` may be empty with `error` set |
| GET | `/api/portfolio` | holdings, closed positions, summary, contributors, allocation | see `lib/services/portfolio.ts` |
| GET | `/api/portfolio/history?days=` | daily valuation rows (written by the worker) | |
| GET | `/api/transactions?page=&pageSize=` | paginated history | |
| POST | `/api/transactions` | create | `{ instrumentId, type: BUY|SELL, tradeDate: YYYY-MM-DD, quantity, pricePerShare, charges?, notes? }`; `400 NEGATIVE_HOLDING` if a sell exceeds the holding on that date |
| GET/PATCH/DELETE | `/api/transactions/:id` | read, edit, delete | edit/delete are refused with `400 NEGATIVE_HOLDING` if they would strand a sell |
| GET | `/api/transactions/export` | CSV download | |
| GET/POST | `/api/watchlist` | list (with quotes) / add `{ instrumentId }` | `409 DUPLICATE` |
| DELETE | `/api/watchlist/:id` | remove | |
| GET/POST | `/api/alerts` | list (with quotes) / create `{ instrumentId, condition: ABOVE|BELOW, thresholdPrice }` | |
| PATCH/DELETE | `/api/alerts/:id` | `{ condition?, thresholdPrice?, isEnabled? }` / delete | changing the rule re-arms the alert |
| GET | `/api/notifications?page=` | list + unread count | |
| PATCH | `/api/notifications/:id` | `{ isRead }` | |
| POST | `/api/notifications/read-all` | | |
| GET | `/api/market/overview` | indices, gainers/losers among supported stocks, coverage | |
| GET/PATCH/DELETE | `/api/profile` | profile, rename, delete account (ends the session) | |
| GET | `/api/live-token` | short-lived WebSocket token for the optional feed | `204` when the feed is not configured |
| POST | `/api/cron/check-alerts` | scheduled check | `Authorization: Bearer $CRON_SECRET`; optional body `{ "testQuotes": { "<instrumentId>": "123.45" } }` evaluates alerts against a test price without storing it |
| GET | `/api/internal/positions` | universe + all open positions for the feed | Bearer `CRON_SECRET` |
| POST | `/api/internal/quotes` | feed pushes quotes into `QuoteSnapshot` | Bearer `CRON_SECRET` |

`scripts/smoke.mjs` exercises all of the above against a running app and is
the executable version of the acceptance criteria in the SRS.
