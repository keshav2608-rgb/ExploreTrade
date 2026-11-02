//! Optional ClickHouse mirror over its HTTP interface. Each poll's quotes
//! become rows in `quote_ticks` (schema in `services/pulsefeed/sql/clickhouse.sql`).
//! Disabled when CLICKHOUSE_URL is empty; failures are counted and never
//! affect the feed.
use crate::config::Config;
use anyhow::{anyhow, Context, Result};

pub struct ClickHouse {
    http: reqwest::Client,
    url: String,
    db: String,
}

impl ClickHouse {
    pub fn new(cfg: &Config, http: reqwest::Client) -> Self {
        Self { http, url: cfg.clickhouse_url.trim_end_matches('/').to_string(), db: cfg.clickhouse_db.clone() }
    }

    pub fn enabled(&self) -> bool { !self.url.is_empty() }

    pub async fn insert_ticks(&self, rows: &[serde_json::Value]) -> Result<()> {
        if rows.is_empty() { return Ok(()); }
        let body: String = rows.iter().map(|r| r.to_string()).collect::<Vec<_>>().join("\n");
        let query = format!("INSERT INTO {}.quote_ticks FORMAT JSONEachRow", self.db);
        let res = self.http.post(&self.url).query(&[("query", query.as_str())]).body(body).send().await.context("clickhouse unreachable")?;
        if !res.status().is_success() {
            return Err(anyhow!("clickhouse {}: {}", res.status(), res.text().await.unwrap_or_default()));
        }
        Ok(())
    }
}
