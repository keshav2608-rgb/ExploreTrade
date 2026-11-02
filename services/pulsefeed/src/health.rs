//! Health counters and a minimal HTTP endpoint (`GET /health` → JSON).
//! Everything here is measured by the service itself at runtime.
use crate::config::Config;
use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
use tracing::{info, warn};

#[derive(Default)]
pub struct Health {
    started: Mutex<Option<Instant>>,
    polls: AtomicU64,
    quotes_ok: AtomicU64,
    quotes_failed: AtomicU64,
    last_poll_ms: AtomicU64,
    last_mtm_ns: AtomicU64,
    consecutive_failed_polls: AtomicU64,
    last_success_at: Mutex<Option<Instant>>,
    app_pushes: AtomicU64,
    app_failures: AtomicU64,
    last_app_error: Mutex<Option<String>>,
    clickhouse_rows: AtomicU64,
    clickhouse_failures: AtomicU64,
    last_clickhouse_error: Mutex<Option<String>>,
    paused_until: Mutex<Option<Instant>>,
    ws_clients: AtomicUsize,
    positions: AtomicUsize,
    instruments: AtomicUsize,
    users: AtomicUsize,
}

impl Health {
    pub fn record_poll(&self, ok: usize, failed: usize, mtm_ns: u64, took: Duration) {
        self.started.lock().unwrap().get_or_insert_with(Instant::now);
        self.polls.fetch_add(1, Ordering::Relaxed);
        self.quotes_ok.fetch_add(ok as u64, Ordering::Relaxed);
        self.quotes_failed.fetch_add(failed as u64, Ordering::Relaxed);
        self.last_poll_ms.store(took.as_millis() as u64, Ordering::Relaxed);
        self.last_mtm_ns.store(mtm_ns, Ordering::Relaxed);
        if ok > 0 { self.consecutive_failed_polls.store(0, Ordering::Relaxed); *self.last_success_at.lock().unwrap() = Some(Instant::now()); }
        else if failed > 0 { self.consecutive_failed_polls.fetch_add(1, Ordering::Relaxed); }
    }
    pub fn record_app_push(&self, _n: usize) { self.app_pushes.fetch_add(1, Ordering::Relaxed); }
    pub fn record_app_failure(&self, e: &str) { self.app_failures.fetch_add(1, Ordering::Relaxed); *self.last_app_error.lock().unwrap() = Some(e.to_string()); }
    pub fn record_clickhouse_rows(&self, n: usize) { self.clickhouse_rows.fetch_add(n as u64, Ordering::Relaxed); }
    pub fn record_clickhouse_failure(&self, e: &str) { self.clickhouse_failures.fetch_add(1, Ordering::Relaxed); *self.last_clickhouse_error.lock().unwrap() = Some(e.to_string()); }
    pub fn set_paused_until(&self, t: Instant) { *self.paused_until.lock().unwrap() = Some(t); }
    pub fn client_connected(&self) { self.ws_clients.fetch_add(1, Ordering::Relaxed); }
    pub fn client_disconnected(&self) { self.ws_clients.fetch_sub(1, Ordering::Relaxed); }
    pub fn ws_clients(&self) -> usize { self.ws_clients.load(Ordering::Relaxed) }
    pub fn set_positions(&self, p: usize, i: usize, u: usize) { self.positions.store(p, Ordering::Relaxed); self.instruments.store(i, Ordering::Relaxed); self.users.store(u, Ordering::Relaxed); }

    pub fn json(&self) -> serde_json::Value {
        let now = Instant::now();
        let last_ok = self.last_success_at.lock().unwrap().map(|t| now.duration_since(t).as_secs());
        let paused = self.paused_until.lock().unwrap().filter(|t| *t > now).map(|t| t.duration_since(now).as_secs());
        let status = if self.polls.load(Ordering::Relaxed) == 0 { "starting" } else if paused.is_some() { "paused" } else if self.consecutive_failed_polls.load(Ordering::Relaxed) > 0 { "degraded" } else { "healthy" };
        serde_json::json!({
            "status": status,
            "uptime_s": self.started.lock().unwrap().map(|t| now.duration_since(t).as_secs()).unwrap_or(0),
            "polls": self.polls.load(Ordering::Relaxed),
            "quotes_ok": self.quotes_ok.load(Ordering::Relaxed),
            "quotes_failed": self.quotes_failed.load(Ordering::Relaxed),
            "consecutive_failed_polls": self.consecutive_failed_polls.load(Ordering::Relaxed),
            "seconds_since_last_success": last_ok,
            "last_poll_ms": self.last_poll_ms.load(Ordering::Relaxed),
            "last_mark_to_market_ns": self.last_mtm_ns.load(Ordering::Relaxed),
            "simd": if crate::pnl::avx2_available() { "avx2+fma" } else { "scalar" },
            "positions": self.positions.load(Ordering::Relaxed),
            "instruments": self.instruments.load(Ordering::Relaxed),
            "users": self.users.load(Ordering::Relaxed),
            "app_pushes": self.app_pushes.load(Ordering::Relaxed),
            "app_failures": self.app_failures.load(Ordering::Relaxed),
            "last_app_error": *self.last_app_error.lock().unwrap(),
            "clickhouse_rows": self.clickhouse_rows.load(Ordering::Relaxed),
            "clickhouse_failures": self.clickhouse_failures.load(Ordering::Relaxed),
            "last_clickhouse_error": *self.last_clickhouse_error.lock().unwrap(),
            "paused_for_s": paused,
            "ws_clients": self.ws_clients(),
        })
    }
}

/// Tiny HTTP/1.1 responder: enough for `curl http://127.0.0.1:8791/health`.
pub async fn serve(cfg: Config, health: std::sync::Arc<Health>) {
    let listener = match TcpListener::bind(&cfg.health_listen).await {
        Ok(l) => l,
        Err(e) => { warn!("cannot bind health endpoint on {}: {e}", cfg.health_listen); return; }
    };
    info!("health endpoint on http://{}/health", cfg.health_listen);
    loop {
        let Ok((mut stream, _)) = listener.accept().await else { continue };
        let health = health.clone();
        tokio::spawn(async move {
            let mut buf = [0u8; 1024];
            let _ = stream.read(&mut buf).await;
            let body = health.json().to_string();
            let resp = format!("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", body.len(), body);
            let _ = stream.write_all(resp.as_bytes()).await;
        });
    }
}
