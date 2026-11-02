//! PulseFeed: the optional live-quote service for PortfolioPulse.
//!
//! The web app works without it (it polls the provider on demand). With
//! PulseFeed running, the app gets:
//!
//! * **Async ingestion** – one Tokio task polls the provider for the whole
//!   supported universe every `--poll-seconds`, with bounded concurrency,
//!   and pushes the quotes to the app's `/api/internal/quotes` endpoint so
//!   every page is fresh without the web process polling.
//! * **Self-healing** – exponential back-off on provider or app failures,
//!   a global pause on HTTP 429, and a `/health` endpoint that reports the
//!   last successful poll, consecutive failures and connected clients.
//! * **P&L** – every user's open positions are held in Structure-of-Arrays
//!   form and re-marked on each poll with an AVX2 kernel (scalar fallback,
//!   both tested against each other).
//! * **WebSocket streaming** – browsers connect with a short-lived HMAC
//!   token minted by the app and receive their own portfolio totals and
//!   the quotes behind them as soon as a poll finishes.
//! * **ClickHouse** (optional) – every poll's quotes are appended to a
//!   `quote_ticks` table for historical analytics (`sql/clickhouse.sql`).
//!
//! Data flow:
//!
//! ```text
//!   app /api/internal/positions ──► universe + positions (every N polls)
//!   provider (Yahoo v8 chart / demo) ──► poll task ──► State (SoA) ──► P&L (AVX2)
//!                                            │                  │
//!                                            ├──► app /api/internal/quotes
//!                                            ├──► ClickHouse quote_ticks (optional)
//!                                            └──► broadcast ──► WebSocket clients (per user)
//! ```

mod app_client;
mod clickhouse;
mod config;
mod health;
mod pnl;
mod provider;
mod state;
mod ws;

use clap::Parser;
use config::Config;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::{broadcast, RwLock};
use tracing::{info, warn};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let _ = rustls::crypto::ring::default_provider().install_default();
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .with_target(false)
        .init();
    let cfg = Config::parse();
    info!(provider = %cfg.provider, app = %cfg.app_url, poll_seconds = cfg.poll_seconds, "pulsefeed starting");

    let http = reqwest::Client::builder().user_agent("PortfolioPulse-PulseFeed/0.1 (student project)").timeout(Duration::from_secs(20)).build()?;
    let state = Arc::new(RwLock::new(state::State::default()));
    let health = Arc::new(health::Health::default());
    let (tx, _) = broadcast::channel::<ws::Update>(1024);

    // WebSocket + health servers.
    tokio::spawn(ws::serve(cfg.clone(), tx.clone(), state.clone(), health.clone()));
    tokio::spawn(health::serve(cfg.clone(), health.clone()));

    // The poll loop is the heart of the service. It never exits on error:
    // each failure is counted, logged and retried with back-off.
    let app = app_client::AppClient::new(&cfg, http.clone());
    let prov = provider::make(&cfg, http.clone());
    let ch = clickhouse::ClickHouse::new(&cfg, http.clone());
    let mut backoff = Duration::from_secs(cfg.poll_seconds);
    let mut polls: u64 = 0;

    loop {
        let started = Instant::now();
        polls += 1;

        // 1. Refresh universe + positions from the app every 5 polls (or on failure).
        if polls % 5 == 1 || state.read().await.instruments.is_empty() {
            match app.fetch_positions().await {
                Ok(p) => {
                    let mut s = state.write().await;
                    s.load(p.instruments, p.positions);
                    health.set_positions(s.positions_len(), s.instruments.len(), s.users_len());
                }
                Err(e) => {
                    warn!("app positions fetch failed: {e:#}");
                    health.record_app_failure(&e.to_string());
                }
            }
        }

        // 2. Poll the provider for every instrument with a provider id.
        let ids: Vec<(usize, String)> = {
            let s = state.read().await;
            s.instruments.iter().enumerate().filter_map(|(i, ins)| ins.provider_id.clone().map(|p| (i, p))).collect()
        };
        let mut ok_quotes = Vec::new();
        let mut failed = 0usize;
        let mut rate_limited = false;
        if !ids.is_empty() {
            let results = prov.fetch_many(ids.iter().map(|(_, p)| p.clone()).collect(), cfg.concurrency).await;
            for ((idx, _), r) in ids.iter().zip(results) {
                match r {
                    Ok(q) => ok_quotes.push((*idx, q)),
                    Err(provider::ProviderError::RateLimited) => { rate_limited = true; failed += 1; }
                    Err(_) => failed += 1,
                }
            }
        }

        // 3. Apply quotes, re-mark P&L (timed), publish.
        let (changed, mtm_ns, snapshot_users) = {
            let mut s = state.write().await;
            let changed = s.apply_quotes(&ok_quotes);
            let t0 = Instant::now();
            s.remark();
            let ns = t0.elapsed().as_nanos() as u64;
            (changed, ns, s.user_snapshots(&prov.data_status()))
        };
        health.record_poll(ok_quotes.len(), failed, mtm_ns, started.elapsed());

        if !ok_quotes.is_empty() {
            // 3a. Push to the app so every page reflects the feed.
            let payload = { let s = state.read().await; s.quotes_payload(&ok_quotes, prov.name(), &prov.data_status()) };
            match app.push_quotes(&payload).await {
                Ok(n) => health.record_app_push(n),
                Err(e) => { warn!("app quote push failed: {e:#}"); health.record_app_failure(&e.to_string()); }
            }
            // 3b. Mirror ticks into ClickHouse if configured.
            if ch.enabled() {
                let rows = { let s = state.read().await; s.clickhouse_rows(&ok_quotes, prov.name()) };
                if let Err(e) = ch.insert_ticks(&rows).await { warn!("clickhouse insert failed: {e:#}"); health.record_clickhouse_failure(&e.to_string()); } else { health.record_clickhouse_rows(rows.len()); }
            }
            // 3c. Stream to connected browsers.
            let at = chrono_now();
            for (user_id, snap) in snapshot_users {
                let _ = tx.send(ws::Update::Portfolio { user_id, market_value: snap.market_value, unrealized_pnl: snap.unrealized_pnl, valued: snap.valued, total: snap.total, at: at.clone(), data_status: snap.data_status });
            }
            for &(idx, ref q) in ok_quotes.iter().filter(|(i, _)| changed.contains(i)) {
                let s = state.read().await;
                let _ = tx.send(ws::Update::Quote { instrument_id: s.instruments[idx].id.clone(), symbol: s.instruments[idx].symbol.clone(), price: q.price, previous_close: q.previous_close, at: at.clone() });
            }
        }

        info!(quotes = ok_quotes.len(), failed, changed = changed.len(), mtm_us = mtm_ns / 1000, clients = health.ws_clients(), took_ms = started.elapsed().as_millis(), "poll done");

        // 4. Sleep: normal interval, or back off after failures / rate limits.
        let all_failed = !ids.is_empty() && ok_quotes.is_empty();
        if rate_limited {
            backoff = (backoff * 2).min(Duration::from_secs(900));
            warn!(?backoff, "provider rate limit: backing off");
            health.set_paused_until(Instant::now() + backoff);
        } else if all_failed {
            backoff = (backoff * 2).min(Duration::from_secs(600));
            warn!(?backoff, "every quote failed: backing off");
        } else {
            backoff = Duration::from_secs(cfg.poll_seconds);
        }
        if cfg.once { break; }
        tokio::time::sleep(backoff.saturating_sub(started.elapsed())).await;
    }
    Ok(())
}

/// RFC 3339 UTC timestamp without pulling in the chrono crate.
pub fn chrono_now() -> String {
    let secs = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    // Civil-from-days (Howard Hinnant), good for any date after 1970.
    let days = secs / 86_400;
    let (h, m, s) = ((secs % 86_400) / 3600, (secs % 3600) / 60, secs % 60);
    let z = days as i64 + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let mo = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if mo <= 2 { y + 1 } else { y };
    format!("{y:04}-{mo:02}-{d:02}T{h:02}:{m:02}:{s:02}Z")
}
