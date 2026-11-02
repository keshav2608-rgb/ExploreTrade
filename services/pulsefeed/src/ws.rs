//! WebSocket server. A browser connects to `/live?token=<userId>.<exp>.<hmac>`
//! where the token was minted by the app's `/api/live-token` with the
//! shared CRON_SECRET. Only updates for that user (plus quotes for the
//! instruments in their positions) are sent. Messages are JSON because a
//! handful of frames per minute does not justify a binary format.
use crate::config::Config;
use crate::health::Health;
use crate::state::State;
use futures_util::{SinkExt, StreamExt};
use hmac::{Hmac, Mac};
use sha2::Sha256;
use std::sync::Arc;
use tokio::net::TcpListener;
use tokio::sync::{broadcast, RwLock};
use tokio_tungstenite::tungstenite::handshake::server::{Request, Response, ErrorResponse};
use tokio_tungstenite::tungstenite::Message;
use tracing::{info, warn};

#[derive(Debug, Clone)]
pub enum Update {
    Portfolio { user_id: String, market_value: String, unrealized_pnl: String, valued: usize, total: usize, at: String, data_status: String },
    Quote { instrument_id: String, symbol: String, price: f64, previous_close: Option<f64>, at: String },
}

/// Verify `<userId>.<expiresUnix>.<hex hmac>`; returns the user id.
pub fn verify_token(secret: &str, token: &str) -> Option<String> {
    let mut parts = token.rsplitn(2, '.');
    let sig = parts.next()?;
    let payload = parts.next()?;
    let (user_id, exp) = payload.rsplit_once('.')?;
    let exp: u64 = exp.parse().ok()?;
    let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).ok()?.as_secs();
    if exp < now { return None; }
    let mut mac = Hmac::<Sha256>::new_from_slice(secret.as_bytes()).ok()?;
    mac.update(payload.as_bytes());
    let expected = hex::encode(mac.finalize().into_bytes());
    // Constant-time compare.
    if expected.len() != sig.len() { return None; }
    let mut diff = 0u8;
    for (a, b) in expected.bytes().zip(sig.bytes()) { diff |= a ^ b; }
    (diff == 0).then(|| user_id.to_string())
}

pub async fn serve(cfg: Config, tx: broadcast::Sender<Update>, state: Arc<RwLock<State>>, health: Arc<Health>) {
    let listener = match TcpListener::bind(&cfg.ws_listen).await {
        Ok(l) => l,
        Err(e) => { warn!("cannot bind websocket on {}: {e}", cfg.ws_listen); return; }
    };
    info!("websocket listening on ws://{}/live", cfg.ws_listen);
    loop {
        let Ok((stream, peer)) = listener.accept().await else { continue };
        let secret = cfg.cron_secret.clone();
        let rx = tx.subscribe();
        let state = state.clone();
        let health = health.clone();
        tokio::spawn(async move {
            // The handshake callback reads the token from the request URI.
            let user_slot: Arc<std::sync::Mutex<Option<String>>> = Arc::new(std::sync::Mutex::new(None));
            let slot = user_slot.clone();
            let cb = move |req: &Request, res: Response| -> Result<Response, ErrorResponse> {
                let uri = req.uri();
                let token = uri.query().and_then(|q| q.split('&').find_map(|kv| kv.strip_prefix("token=")));
                let ok = uri.path() == "/live" && token.and_then(|t| verify_token(&secret, &percent_decode(t))).map(|u| { *slot.lock().unwrap() = Some(u); }).is_some();
                if ok { Ok(res) } else { Err(ErrorResponse::new(Some("invalid or expired token".into()))) }
            };
            let Ok(ws) = tokio_tungstenite::accept_hdr_async(stream, cb).await else { return };
            let Some(user_id) = user_slot.lock().unwrap().clone() else { return };
            health.client_connected();
            info!(%peer, "live client connected");
            run_client(ws, rx, user_id, state).await;
            health.client_disconnected();
            info!(%peer, "live client disconnected");
        });
    }
}

async fn run_client(ws: tokio_tungstenite::WebSocketStream<tokio::net::TcpStream>, mut rx: broadcast::Receiver<Update>, user_id: String, state: Arc<RwLock<State>>) {
    let (mut sink, mut stream) = ws.split();
    // Send the current snapshot immediately so the page does not wait a poll.
    {
        let s = state.read().await;
        for (uid, snap) in s.user_snapshots("CACHED") {
            if uid == user_id {
                let _ = sink.send(Message::Text(serde_json::json!({ "type": "portfolio", "marketValue": snap.market_value, "unrealizedPnl": snap.unrealized_pnl, "valued": snap.valued, "total": snap.total, "at": crate::chrono_now(), "dataStatus": "CACHED" }).to_string().into())).await;
            }
        }
    }
    loop {
        tokio::select! {
            r = rx.recv() => match r {
                Ok(Update::Portfolio { user_id: u, market_value, unrealized_pnl, valued, total, at, data_status }) if u == user_id => {
                    let m = serde_json::json!({ "type": "portfolio", "marketValue": market_value, "unrealizedPnl": unrealized_pnl, "valued": valued, "total": total, "at": at, "dataStatus": data_status });
                    if sink.send(Message::Text(m.to_string().into())).await.is_err() { break; }
                }
                Ok(Update::Quote { instrument_id, symbol, price, previous_close, at }) => {
                    let m = serde_json::json!({ "type": "quote", "instrumentId": instrument_id, "symbol": symbol, "price": price, "previousClose": previous_close, "at": at });
                    if sink.send(Message::Text(m.to_string().into())).await.is_err() { break; }
                }
                Ok(_) => {}
                Err(broadcast::error::RecvError::Lagged(_)) => {}
                Err(broadcast::error::RecvError::Closed) => break,
            },
            m = stream.next() => match m {
                Some(Ok(Message::Ping(p))) => { let _ = sink.send(Message::Pong(p)).await; }
                Some(Ok(Message::Close(_))) | None | Some(Err(_)) => break,
                _ => {}
            }
        }
    }
}

fn percent_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() + 1 && i + 2 <= b.len() - 1 + 1 {
            if let Ok(v) = u8::from_str_radix(std::str::from_utf8(&b[i + 1..(i + 3).min(b.len())]).unwrap_or(""), 16) { out.push(v); i += 3; continue; }
        }
        out.push(b[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mint(secret: &str, user: &str, exp: u64) -> String {
        let payload = format!("{user}.{exp}");
        let mut mac = Hmac::<Sha256>::new_from_slice(secret.as_bytes()).unwrap();
        mac.update(payload.as_bytes());
        format!("{payload}.{}", hex::encode(mac.finalize().into_bytes()))
    }

    #[test]
    fn token_round_trip_and_rejections() {
        let future = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs() + 300;
        let t = mint("s3cret", "user_1", future);
        assert_eq!(verify_token("s3cret", &t).as_deref(), Some("user_1"));
        assert_eq!(verify_token("wrong", &t), None);
        assert_eq!(verify_token("s3cret", &mint("s3cret", "user_1", 1)), None); // expired
        let mut tampered = t.clone();
        tampered.replace_range(0..1, "x");
        assert_eq!(verify_token("s3cret", &tampered), None);
    }
}
