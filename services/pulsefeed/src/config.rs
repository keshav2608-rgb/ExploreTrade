//! Configuration. Every value can come from the command line or the
//! environment (the same `.env` names as the app where they overlap).
use clap::Parser;

#[derive(Debug, Clone, Parser)]
#[command(name = "pulsefeed", about = "Live quote feed for PortfolioPulse")]
pub struct Config {
    /// Base URL of the PortfolioPulse app.
    #[arg(long, default_value = "http://localhost:3000", env = "APP_URL")]
    pub app_url: String,

    /// Shared secret (same CRON_SECRET as the app) for internal endpoints and WebSocket tokens.
    #[arg(long, env = "CRON_SECRET")]
    pub cron_secret: String,

    /// Market-data provider: "yahoo" (delayed real quotes) or "demo" (synthetic, labelled DEMO).
    #[arg(long, default_value = "yahoo", env = "PULSEFEED_PROVIDER")]
    pub provider: String,

    /// Seconds between polls. 60 is polite to a free provider for ~50 symbols.
    #[arg(long, default_value_t = 60, env = "PULSEFEED_POLL_SECONDS")]
    pub poll_seconds: u64,

    /// Concurrent provider requests per poll.
    #[arg(long, default_value_t = 6)]
    pub concurrency: usize,

    /// WebSocket listen address (the app's PULSEFEED_WS_URL must point here).
    #[arg(long, default_value = "127.0.0.1:8790", env = "PULSEFEED_WS_LISTEN")]
    pub ws_listen: String,

    /// Health endpoint listen address (GET /health returns JSON).
    #[arg(long, default_value = "127.0.0.1:8791", env = "PULSEFEED_HEALTH_LISTEN")]
    pub health_listen: String,

    /// ClickHouse HTTP URL, e.g. http://127.0.0.1:8123. Empty disables mirroring.
    #[arg(long, default_value = "", env = "CLICKHOUSE_URL")]
    pub clickhouse_url: String,

    #[arg(long, default_value = "portfoliopulse", env = "CLICKHOUSE_DB")]
    pub clickhouse_db: String,

    /// Run one poll, print the result, exit (used by the verification script).
    #[arg(long, default_value_t = false)]
    pub once: bool,
}
