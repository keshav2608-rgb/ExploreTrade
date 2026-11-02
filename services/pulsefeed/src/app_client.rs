//! HTTP client for the app's internal endpoints (Bearer CRON_SECRET).
use crate::config::Config;
use anyhow::{anyhow, Context, Result};
use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstrumentRow {
    pub id: String,
    pub symbol: String,
    pub provider_instrument_id: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PositionRow {
    pub user_id: String,
    pub instrument_id: String,
    pub quantity: String,
    pub cost_basis: String,
}

#[derive(Debug, Deserialize)]
pub struct PositionsResponse {
    pub instruments: Vec<InstrumentRow>,
    pub positions: Vec<PositionRow>,
}

#[derive(Deserialize)]
struct Envelope<T> {
    ok: bool,
    data: Option<T>,
    error: Option<serde_json::Value>,
}

pub struct AppClient {
    http: reqwest::Client,
    base: String,
    secret: String,
}

impl AppClient {
    pub fn new(cfg: &Config, http: reqwest::Client) -> Self {
        Self { http, base: cfg.app_url.trim_end_matches('/').to_string(), secret: cfg.cron_secret.clone() }
    }

    pub async fn fetch_positions(&self) -> Result<PositionsResponse> {
        let res = self.http.get(format!("{}/api/internal/positions", self.base)).bearer_auth(&self.secret).send().await.context("app unreachable")?;
        let status = res.status();
        let env: Envelope<PositionsResponse> = res.json().await.context("bad positions json")?;
        if !env.ok { return Err(anyhow!("app returned {status}: {:?}", env.error)); }
        env.data.ok_or_else(|| anyhow!("empty positions response"))
    }

    /// Returns the number of quotes the app upserted.
    pub async fn push_quotes(&self, payload: &serde_json::Value) -> Result<usize> {
        let res = self.http.post(format!("{}/api/internal/quotes", self.base)).bearer_auth(&self.secret).json(payload).send().await.context("app unreachable")?;
        let status = res.status();
        let env: Envelope<serde_json::Value> = res.json().await.context("bad quotes json")?;
        if !env.ok { return Err(anyhow!("app returned {status}: {:?}", env.error)); }
        Ok(env.data.and_then(|d| d["upserted"].as_u64()).unwrap_or(0) as usize)
    }
}
