//! In-memory state in Structure-of-Arrays form.
//!
//! Instruments are indexed densely; positions hold an instrument index and
//! a user index plus contiguous `qty` / `cost` arrays. Each poll copies
//! the latest price per position into `px` (a gather) and then runs the
//! SIMD kernel over the contiguous arrays. Per-user totals are then a
//! single pass over the positions.
use crate::app_client::PositionRow;
use crate::pnl;
use crate::provider::Quote;
use std::collections::{HashMap, HashSet};

#[derive(Debug, Clone)]
pub struct Instrument {
    pub id: String,
    pub symbol: String,
    pub provider_id: Option<String>,
    pub price: Option<f64>,
    pub previous_close: Option<f64>,
    pub volume: Option<u64>,
    pub quote_time: u64,
}

#[derive(Default)]
pub struct State {
    pub instruments: Vec<Instrument>,
    instrument_index: HashMap<String, usize>,
    users: Vec<String>,
    user_index: HashMap<String, usize>,
    // ---- positions, SoA ----
    pos_user: Vec<usize>,
    pos_instrument: Vec<usize>,
    qty: Vec<f32>,
    cost: Vec<f32>,
    px: Vec<f32>,
    unrealized: Vec<f32>,
    /// true where the position's instrument has a price.
    valued: Vec<bool>,
}

#[derive(Debug, Clone)]
pub struct UserSnapshot {
    pub market_value: String,
    pub unrealized_pnl: String,
    pub valued: usize,
    pub total: usize,
    pub data_status: String,
}

impl State {
    pub fn positions_len(&self) -> usize { self.qty.len() }
    pub fn users_len(&self) -> usize { self.users.len() }

    /// Replace universe and positions, keeping prices for instruments we already know.
    pub fn load(&mut self, instruments: Vec<crate::app_client::InstrumentRow>, positions: Vec<PositionRow>) {
        let old: HashMap<String, Instrument> = self.instruments.drain(..).map(|i| (i.id.clone(), i)).collect();
        self.instrument_index.clear();
        for (i, row) in instruments.into_iter().enumerate() {
            let prev = old.get(&row.id);
            self.instruments.push(Instrument { id: row.id.clone(), symbol: row.symbol, provider_id: row.provider_instrument_id, price: prev.and_then(|p| p.price), previous_close: prev.and_then(|p| p.previous_close), volume: prev.and_then(|p| p.volume), quote_time: prev.map(|p| p.quote_time).unwrap_or(0) });
            self.instrument_index.insert(row.id, i);
        }
        self.users.clear();
        self.user_index.clear();
        self.pos_user.clear();
        self.pos_instrument.clear();
        self.qty.clear();
        self.cost.clear();
        for p in positions {
            let Some(&ii) = self.instrument_index.get(&p.instrument_id) else { continue };
            let ui = *self.user_index.entry(p.user_id.clone()).or_insert_with(|| { self.users.push(p.user_id.clone()); self.users.len() - 1 });
            self.pos_user.push(ui);
            self.pos_instrument.push(ii);
            self.qty.push(p.quantity.parse().unwrap_or(0.0));
            self.cost.push(p.cost_basis.parse().unwrap_or(0.0));
        }
        let n = self.qty.len();
        self.px = vec![0.0; n];
        self.unrealized = vec![0.0; n];
        self.valued = vec![false; n];
    }

    /// Store new quotes; returns the instrument indices whose price changed.
    pub fn apply_quotes(&mut self, quotes: &[(usize, Quote)]) -> HashSet<usize> {
        let mut changed = HashSet::new();
        for &(idx, q) in quotes {
            let ins = &mut self.instruments[idx];
            if ins.price != Some(q.price) { changed.insert(idx); }
            ins.price = Some(q.price);
            ins.previous_close = q.previous_close;
            ins.volume = q.volume;
            ins.quote_time = q.quote_time;
        }
        changed
    }

    /// Gather prices per position, then run the SIMD kernel.
    pub fn remark(&mut self) {
        for i in 0..self.qty.len() {
            match self.instruments[self.pos_instrument[i]].price {
                Some(p) => { self.px[i] = p as f32; self.valued[i] = true; }
                None => { self.px[i] = 0.0; self.valued[i] = false; }
            }
        }
        pnl::mark(&self.qty, &self.px, &self.cost, &mut self.unrealized);
    }

    /// Per-user totals. Unvalued positions are excluded and counted, never
    /// treated as worth zero.
    pub fn user_snapshots(&self, data_status: &str) -> Vec<(String, UserSnapshot)> {
        let mut mv = vec![0.0f64; self.users.len()];
        let mut un = vec![0.0f64; self.users.len()];
        let mut valued = vec![0usize; self.users.len()];
        let mut total = vec![0usize; self.users.len()];
        for i in 0..self.qty.len() {
            let u = self.pos_user[i];
            total[u] += 1;
            if self.valued[i] {
                valued[u] += 1;
                mv[u] += (self.qty[i] * self.px[i]) as f64;
                un[u] += self.unrealized[i] as f64;
            }
        }
        self.users.iter().enumerate().map(|(u, id)| (id.clone(), UserSnapshot { market_value: format!("{:.2}", mv[u]), unrealized_pnl: format!("{:.2}", un[u]), valued: valued[u], total: total[u], data_status: data_status.to_string() })).collect()
    }

    pub fn quotes_payload(&self, quotes: &[(usize, Quote)], provider: &str, status: &str) -> serde_json::Value {
        let rows: Vec<serde_json::Value> = quotes.iter().map(|&(idx, q)| serde_json::json!({
            "instrumentId": self.instruments[idx].id,
            "price": format!("{:.4}", q.price),
            "previousClose": q.previous_close.map(|p| format!("{p:.4}")),
            "volume": q.volume.map(|v| v.to_string()),
            "quoteTimestamp": rfc3339(q.quote_time),
        })).collect();
        serde_json::json!({ "provider": provider, "dataStatus": status, "quotes": rows })
    }

    pub fn clickhouse_rows(&self, quotes: &[(usize, Quote)], provider: &str) -> Vec<serde_json::Value> {
        quotes.iter().map(|&(idx, q)| serde_json::json!({
            "fetched_at": crate::chrono_now(),
            "quote_time": rfc3339(q.quote_time),
            "symbol": self.instruments[idx].symbol,
            "instrument_id": self.instruments[idx].id,
            "price": q.price,
            "previous_close": q.previous_close,
            "volume": q.volume,
            "provider": provider,
        })).collect()
    }
}

pub fn rfc3339(secs: u64) -> String {
    // Reuse main's formatter by temporarily computing from secs.
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::app_client::InstrumentRow;

    #[test]
    fn totals_exclude_unvalued_positions() {
        let mut s = State::default();
        s.load(
            vec![InstrumentRow { id: "A".into(), symbol: "A".into(), provider_instrument_id: Some("A.NS".into()) }, InstrumentRow { id: "B".into(), symbol: "B".into(), provider_instrument_id: None }],
            vec![PositionRow { user_id: "u1".into(), instrument_id: "A".into(), quantity: "10".into(), cost_basis: "1000".into() }, PositionRow { user_id: "u1".into(), instrument_id: "B".into(), quantity: "5".into(), cost_basis: "500".into() }],
        );
        s.apply_quotes(&[(0, Quote { price: 150.0, previous_close: Some(140.0), volume: None, quote_time: 0 })]);
        s.remark();
        let snaps = s.user_snapshots("DELAYED");
        assert_eq!(snaps.len(), 1);
        let (_, u) = &snaps[0];
        assert_eq!(u.market_value, "1500.00");
        assert_eq!(u.unrealized_pnl, "500.00");
        assert_eq!((u.valued, u.total), (1, 2));
    }

    #[test]
    fn rfc3339_formats() {
        assert_eq!(rfc3339(0), "1970-01-01T00:00:00Z");
        assert_eq!(rfc3339(1_700_000_000), "2023-11-14T22:13:20Z");
    }
}
