-- ClickHouse schema for the optional PulseFeed mirror.
-- Apply with:  clickhouse-client --multiquery < services/pulsefeed/sql/clickhouse.sql
-- (or paste into the HTTP interface). The feed only INSERTs into quote_ticks.

CREATE DATABASE IF NOT EXISTS portfoliopulse;

-- One row per instrument per poll.
CREATE TABLE IF NOT EXISTS portfoliopulse.quote_ticks
(
    fetched_at      DateTime('UTC') CODEC(DoubleDelta, ZSTD(1)),
    quote_time      DateTime('UTC') CODEC(DoubleDelta, ZSTD(1)),
    symbol          LowCardinality(String),
    instrument_id   String,
    price           Float64 CODEC(Gorilla, ZSTD(1)),
    previous_close  Nullable(Float64) CODEC(Gorilla, ZSTD(1)),
    volume          Nullable(UInt64) CODEC(T64, ZSTD(1)),
    provider        LowCardinality(String)
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(fetched_at)
ORDER BY (symbol, fetched_at);

-- Daily open/high/low/close/volume per symbol from the ticks.
CREATE VIEW IF NOT EXISTS portfoliopulse.daily_ohlc AS
SELECT
    symbol,
    toDate(quote_time) AS day,
    argMin(price, quote_time) AS open,
    max(price)              AS high,
    min(price)              AS low,
    argMax(price, quote_time) AS close,
    max(volume)             AS volume
FROM portfoliopulse.quote_ticks
GROUP BY symbol, day;

-- Unusual volume: today's volume versus the trailing 20-day average,
-- a plainly documented comparison (FR-MKT-04 / FR-INS-02).
CREATE VIEW IF NOT EXISTS portfoliopulse.unusual_volume AS
SELECT
    symbol,
    day,
    volume,
    avg(volume) OVER (PARTITION BY symbol ORDER BY day ROWS BETWEEN 20 PRECEDING AND 1 PRECEDING) AS avg_20d,
    volume / nullIf(avg_20d, 0) AS ratio
FROM portfoliopulse.daily_ohlc;

-- 20-day realised volatility of daily log returns, per symbol.
CREATE VIEW IF NOT EXISTS portfoliopulse.volatility_20d AS
SELECT
    symbol,
    day,
    stddevSamp(ret) OVER (PARTITION BY symbol ORDER BY day ROWS BETWEEN 19 PRECEDING AND CURRENT ROW) AS vol_20d
FROM
(
    SELECT symbol, day, log(close / lagInFrame(close) OVER (PARTITION BY symbol ORDER BY day)) AS ret
    FROM portfoliopulse.daily_ohlc
);
