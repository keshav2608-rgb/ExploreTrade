//! Market-data providers for the feed.
//!
//! * `YahooProvider` uses Yahoo Finance's public v8 chart endpoint, which
//!   answers without the login cookie the v7 quote endpoint now requires
//!   (checked on 2026-11-03). One request per symbol, bounded concurrency.
//!   Quotes are labelled DELAYED: Yahoo's NSE data is not real time.
//! * `DemoProvider` is a deterministic random walk, labelled DEMO, for
//!   running without network access.
use crate::config::Config;
use futures_util::stream::{self, StreamExt};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Copy)]
pub struct Quote {
    pub price: f64,
    pub previous_close: Option<f64>,
    pub volume: Option<u64>,
    /// Unix seconds of the provider's quote time.
    pub quote_time: u64,
}

#[derive(Debug)]
pub enum ProviderError {
    RateLimited,
    Other(String),
}

impl std::fmt::Display for ProviderError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ProviderError::RateLimited => write!(f, "rate limited (HTTP 429)"),
            ProviderError::Other(s) => write!(f, "{s}"),
        }
    }
}

pub trait Provider: Send + Sync {
    fn name(&self) -> &'static str;
    fn data_status(&self) -> String;
    fn fetch_one<'a>(&'a self, provider_id: &'a str) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<Quote, ProviderError>> + Send + 'a>>;
}

/// Shared helper: fetch many symbols with bounded concurrency, preserving order.
pub struct Dyn(pub Arc<dyn Provider>);

impl Dyn {
    pub fn name(&self) -> &'static str { self.0.name() }
    pub fn data_status(&self) -> String { self.0.data_status() }
    pub async fn fetch_many(&self, ids: Vec<String>, concurrency: usize) -> Vec<Result<Quote, ProviderError>> {
        let p = self.0.clone();
        stream::iter(ids.into_iter())
            .map(|id| { let p = p.clone(); async move { p.fetch_one(&id).await } })
            .buffered(concurrency.max(1))
            .collect()
            .await
    }
}

pub fn make(cfg: &Config, http: reqwest::Client) -> Dyn {
    match cfg.provider.to_lowercase().as_str() {
        "demo" => Dyn(Arc::new(DemoProvider)),
        _ => Dyn(Arc::new(YahooProvider { http })),
    }
}

// ---------------------------------------------------------------------------

pub struct YahooProvider {
    http: reqwest::Client,
}

impl Provider for YahooProvider {
    fn name(&self) -> &'static str { "pulsefeed/yahoo" }
    fn data_status(&self) -> String { "DELAYED".into() }

    fn fetch_one<'a>(&'a self, id: &'a str) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<Quote, ProviderError>> + Send + 'a>> {
        Box::pin(async move {
            let url = format!("https://query1.finance.yahoo.com/v8/finance/chart/{}?range=1d&interval=1d", urlencode(id));
            let res = self.http.get(&url).send().await.map_err(|e| ProviderError::Other(e.to_string()))?;
            if res.status().as_u16() == 429 { return Err(ProviderError::RateLimited); }
            if !res.status().is_success() { return Err(ProviderError::Other(format!("HTTP {}", res.status()))); }
            let v: serde_json::Value = res.json().await.map_err(|e| ProviderError::Other(e.to_string()))?;
            let meta = &v["chart"]["result"][0]["meta"];
            let price = meta["regularMarketPrice"].as_f64().ok_or_else(|| ProviderError::Other("no regularMarketPrice".into()))?;
            // chartPreviousClose is the prior session's close for a 1d range.
            let previous_close = meta["chartPreviousClose"].as_f64().or_else(|| meta["previousClose"].as_f64());
            let volume = meta["regularMarketVolume"].as_u64();
            let quote_time = meta["regularMarketTime"].as_u64().unwrap_or_else(now_secs);
            Ok(Quote { price, previous_close, volume, quote_time })
        })
    }
}

fn urlencode(s: &str) -> String {
    // Only '&' appears in supported symbols (e.g. "M&M.NS").
    s.replace('&', "%26")
}

fn now_secs() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

// ---------------------------------------------------------------------------

/// Deterministic per-symbol random walk; the same minute gives the same price.
pub struct DemoProvider;

impl Provider for DemoProvider {
    fn name(&self) -> &'static str { "pulsefeed/demo" }
    fn data_status(&self) -> String { "DEMO".into() }

    fn fetch_one<'a>(&'a self, id: &'a str) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<Quote, ProviderError>> + Send + 'a>> {
        Box::pin(async move {
            let mut h: u64 = 1469598103934665603;
            for b in id.bytes() { h ^= b as u64; h = h.wrapping_mul(1099511628211); }
            let base = 100.0 + (h % 5000) as f64;
            let minute = now_secs() / 60;
            let step = |m: u64| { let x = (h ^ m.wrapping_mul(0x9E3779B97F4A7C15)).wrapping_mul(0xBF58476D1CE4E5B9); ((x >> 33) as f64 / (1u64 << 31) as f64 - 0.5) * 0.01 };
            let mut price = base;
            let mut prev = base;
            for m in (minute.saturating_sub(390))..=minute { prev = price; price *= 1.0 + step(m); }
            Ok(Quote { price: (price * 100.0).round() / 100.0, previous_close: Some((prev * 100.0).round() / 100.0), volume: Some(100_000 + h % 1_000_000), quote_time: minute * 60 })
        })
    }
}
