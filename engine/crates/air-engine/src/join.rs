//! Join server: lets observer and player PCs on the same network send game data into a match room.
//!
//! The main listener stays on 127.0.0.1. Only while the producer switches joining on does the engine
//! bind a second, separate listener (usually 0.0.0.0) that serves exactly two routes, both guarded
//! by a short join code the producer's Air generated:
//!   GET /join/hello?code=…                          → 200 when the code is accepted
//!   GET /join?code=…&role=observer|player&name=…   → WebSocket carrying `{type:"valorant",…}`
//! A joined PC can add game data to the room that is currently selected, and nothing else: it cannot
//! read state, change graphics, or reach the control API. A player PC may only send its own
//! player-tagged data. Wrong codes are rate limited per address.

use std::collections::HashMap;
use std::net::{IpAddr, SocketAddr};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{Duration, Instant};

use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{ConnectInfo, RawQuery, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::{Json, Router};
use serde_json::{json, Value};
use tokio::net::TcpListener;
use tokio::sync::watch;

use crate::engine::{now_ms, Engine};
use crate::http::{percent_decode, query_get};

static NEXT_PEER: AtomicU64 = AtomicU64::new(1);
const MAX_FAILURES: u32 = 5;
const FAILURE_WINDOW: Duration = Duration::from_secs(60);
const MAX_PEERS: usize = 12;
const MAX_MESSAGES_PER_SECOND: u32 = 400;
const PING_EVERY: Duration = Duration::from_secs(15);

struct Peer {
    role: String,
    name: String,
    ip: String,
    since: f64,
    last: Option<f64>,
    messages: u64,
    /// A player PC's in-game player id (from its own data), so Air can put it in its seat.
    player_id: Option<String>,
    /// Fired to drop this peer (code changed, joining switched off).
    kick: watch::Sender<bool>,
}

struct Server {
    addr: SocketAddr,
    stop: watch::Sender<bool>,
}

#[derive(Default)]
struct Inner {
    code: String,
    match_code: String,
    peers: HashMap<u64, Peer>,
    failures: HashMap<IpAddr, (u32, Instant)>,
    server: Option<Server>,
}

#[derive(Default)]
pub struct Join {
    inner: Mutex<Inner>,
}

#[derive(Clone)]
struct JoinApp {
    engine: Arc<Engine>,
}

pub fn valid_code(code: &str) -> bool {
    (6..=12).contains(&code.len())
        && code
            .bytes()
            .all(|b| b.is_ascii_uppercase() || b.is_ascii_digit())
}

fn same(a: &str, b: &str) -> bool {
    let (a, b) = (a.as_bytes(), b.as_bytes());
    !b.is_empty()
        && a.len() == b.len()
        && a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

impl Join {
    fn lock(&self) -> MutexGuard<'_, Inner> {
        self.inner.lock().unwrap_or_else(|p| p.into_inner())
    }

    /// Checks a presented code for one address. Err carries the HTTP status to answer with.
    fn check(&self, ip: IpAddr, code: Option<&str>) -> Result<(), StatusCode> {
        let mut inner = self.lock();
        if inner.server.is_none() {
            return Err(StatusCode::FORBIDDEN);
        }
        let now = Instant::now();
        inner
            .failures
            .retain(|_, (_, at)| now.duration_since(*at) < FAILURE_WINDOW);
        if inner
            .failures
            .get(&ip)
            .is_some_and(|(n, _)| *n >= MAX_FAILURES)
        {
            return Err(StatusCode::TOO_MANY_REQUESTS);
        }
        if code.is_some_and(|c| same(c, &inner.code)) {
            inner.failures.remove(&ip);
            return Ok(());
        }
        let entry = inner.failures.entry(ip).or_insert((0, now));
        entry.0 += 1;
        Err(StatusCode::UNAUTHORIZED)
    }

    pub fn match_code(&self) -> String {
        self.lock().match_code.clone()
    }

    /// `{ enabled, port, peers: [...] }` for the control API.
    pub fn status(&self) -> Value {
        let inner = self.lock();
        let now = now_ms();
        let mut peers: Vec<(&u64, &Peer)> = inner.peers.iter().collect();
        peers.sort_by_key(|(id, _)| **id);
        json!({
            "enabled": inner.server.is_some(),
            "port": inner.server.as_ref().map(|s| s.addr.port()),
            "match": inner.match_code,
            "peers": peers.iter().map(|(id, p)| json!({
                "id": id, "role": p.role, "name": p.name, "ip": p.ip, "since": p.since,
                "lastAgeMs": p.last.map(|at| (now - at).max(0.0)), "messages": p.messages, "playerId": p.player_id,
            })).collect::<Vec<_>>(),
        })
    }

    fn kick_all(inner: &mut Inner) {
        for peer in inner.peers.values() {
            let _ = peer.kick.send(true);
        }
    }
}

/// Applies `{ enabled, code?, match?, host?, port? }`. Switching on binds the listener; a new code or
/// switching off drops every joined PC.
pub async fn configure(engine: &Arc<Engine>, input: &Value) -> Result<Value, String> {
    let enabled = input
        .get("enabled")
        .and_then(Value::as_bool)
        .ok_or("Say whether joining is on.")?;
    let join = &engine.join;
    if !enabled {
        let mut inner = join.lock();
        Join::kick_all(&mut inner);
        if let Some(server) = inner.server.take() {
            let _ = server.stop.send(true);
        }
        inner.code.clear();
        drop(inner);
        return Ok(join.status());
    }
    let code = input
        .get("code")
        .and_then(Value::as_str)
        .filter(|c| valid_code(c))
        .ok_or("A join code is 6–12 capital letters and digits.")?;
    {
        let mut inner = join.lock();
        if inner.code != code {
            Join::kick_all(&mut inner);
        }
        inner.code = code.to_string();
        if let Some(m) = input.get("match").and_then(Value::as_str) {
            inner.match_code = m.to_string();
        }
        if inner.server.is_some() {
            drop(inner);
            return Ok(join.status());
        }
    }
    let host = input
        .get("host")
        .and_then(Value::as_str)
        .unwrap_or("0.0.0.0");
    let port = input
        .get("port")
        .and_then(Value::as_u64)
        .filter(|p| (1024..=65535).contains(p))
        .unwrap_or(5301) as u16;
    let listener = TcpListener::bind((host, port))
        .await
        .map_err(|e| format!("Could not open port {port} for joining: {e}"))?;
    let addr = listener.local_addr().map_err(|e| e.to_string())?;
    let (stop, mut stopped) = watch::channel(false);
    let router = Router::new()
        .route("/join", get(upgrade))
        .route("/join/hello", get(hello))
        .with_state(JoinApp {
            engine: engine.clone(),
        });
    tokio::spawn(async move {
        let serve = axum::serve(
            listener,
            router.into_make_service_with_connect_info::<SocketAddr>(),
        )
        .with_graceful_shutdown(async move {
            let _ = stopped.wait_for(|s| *s).await;
        });
        let _ = serve.await;
    });
    join.lock().server = Some(Server { addr, stop });
    Ok(join.status())
}

fn query(raw: Option<String>) -> Vec<(String, String)> {
    raw.unwrap_or_default()
        .split('&')
        .filter(|p| !p.is_empty())
        .map(|p| {
            let (k, v) = p.split_once('=').unwrap_or((p, ""));
            (
                percent_decode(&k.replace('+', " ")),
                percent_decode(&v.replace('+', " ")),
            )
        })
        .collect()
}

fn refuse(status: StatusCode) -> Response {
    let message = match status {
        StatusCode::FORBIDDEN => "Joining is switched off on the producer's Air.",
        StatusCode::UNAUTHORIZED => "That join code was not accepted.",
        _ => "Too many wrong codes. Wait a minute and try again.",
    };
    (status, Json(json!({ "error": message }))).into_response()
}

async fn hello(
    State(app): State<JoinApp>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    RawQuery(raw): RawQuery,
) -> Response {
    let q = query(raw);
    match app
        .engine
        .join
        .check(addr.ip(), query_get(&q, "code").as_deref())
    {
        Ok(()) => Json(json!({ "ok": true })).into_response(),
        Err(status) => refuse(status),
    }
}

async fn upgrade(
    State(app): State<JoinApp>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    RawQuery(raw): RawQuery,
    ws: WebSocketUpgrade,
) -> Response {
    let q = query(raw);
    if let Err(status) = app
        .engine
        .join
        .check(addr.ip(), query_get(&q, "code").as_deref())
    {
        return refuse(status);
    }
    let role = match query_get(&q, "role").as_deref() {
        Some("player") => "player",
        _ => "observer",
    };
    let name: String = query_get(&q, "name")
        .unwrap_or_default()
        .chars()
        .filter(|c| !c.is_control() && !matches!(c, '<' | '>'))
        .take(40)
        .collect();
    if app.engine.join.lock().peers.len() >= MAX_PEERS {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({ "error": "Too many PCs are already joined." })),
        )
            .into_response();
    }
    ws.max_message_size(1_000_000).on_upgrade(move |socket| {
        peer(
            app.engine.clone(),
            socket,
            role,
            name,
            addr.ip().to_string(),
        )
    })
}

/// What a joined PC may add to the match. An observer sends the match. A player PC sends only its
/// own player's data, tagged with its player id: `me` (health, abilities, ultimate) and heartbeats.
/// Anything else a player PC's game reports (its own view of the score, round, kills) is dropped,
/// so one player PC can never change the match on air.
/// What a player PC may say about its own player: the parser reads every key it is given, whatever
/// the category, so anything else (a score, a round, a scoreboard) is dropped here.
const PLAYER_KEYS: [&str; 3] = ["health", "abilities", "player_id"];

pub fn admit(role: &str, message: &Value) -> Option<Value> {
    if role != "player" {
        return Some(message.clone());
    }
    let id = message
        .get("playerId")
        .and_then(Value::as_str)
        .filter(|id| id.len() == 36)?;
    if message.get("captureHeartbeat") == Some(&Value::Bool(true)) {
        return Some(json!({ "playerId": id, "captureHeartbeat": true }));
    }
    let is_me = |v: Option<&Value>| v.and_then(Value::as_str) == Some("me");
    let keyed = is_me(message.get("feature")) || is_me(message.get("category"));
    if let Some(key) = message.get("key").and_then(Value::as_str).filter(|_| keyed) {
        if !PLAYER_KEYS.contains(&key) {
            return None;
        }
        let mut out = json!({ "feature": "me", "key": key, "playerId": id });
        for field in ["data", "value"] {
            if let Some(v) = message.get(field) {
                out[field] = v.clone();
            }
        }
        return Some(out);
    }
    let me = message
        .get("info")
        .and_then(|i| i.get("me"))
        .and_then(Value::as_object)?;
    let me: serde_json::Map<String, Value> = me
        .iter()
        .filter(|(k, _)| PLAYER_KEYS.contains(&k.as_str()))
        .map(|(k, v)| (k.clone(), v.clone()))
        .collect();
    if me.is_empty() {
        return None;
    }
    Some(json!({ "info": { "me": me }, "feature": "me", "playerId": id }))
}

async fn peer(
    engine: Arc<Engine>,
    mut socket: WebSocket,
    role: &'static str,
    name: String,
    ip: String,
) {
    let id = NEXT_PEER.fetch_add(1, Ordering::Relaxed);
    let (kick, mut kicked) = watch::channel(false);
    engine.join.lock().peers.insert(
        id,
        Peer {
            role: role.into(),
            name,
            ip,
            since: now_ms(),
            last: None,
            messages: 0,
            player_id: None,
            kick,
        },
    );
    let hello = json!({ "type": "hello", "role": role }).to_string();
    let mut ok = socket.send(Message::Text(hello.into())).await.is_ok();
    let mut ping = tokio::time::interval(PING_EVERY);
    ping.tick().await;
    let mut window = (Instant::now(), 0u32);
    while ok {
        tokio::select! {
            incoming = socket.recv() => {
                let Some(Ok(message)) = incoming else { break };
                let text = match message {
                    Message::Text(t) => t.to_string(),
                    Message::Close(_) => break,
                    _ => continue,
                };
                if window.0.elapsed() >= Duration::from_secs(1) {
                    window = (Instant::now(), 0);
                }
                window.1 += 1;
                if window.1 > MAX_MESSAGES_PER_SECOND {
                    continue;
                }
                let Ok(m) = serde_json::from_str::<Value>(&text) else { continue };
                if m.get("type").and_then(Value::as_str) != Some("valorant") {
                    continue;
                }
                let Some(payload) = admit(role, m.get("message").unwrap_or(&Value::Null)) else {
                    continue;
                };
                let age = match m.get("bufferedAgeMs") {
                    None => 0.0,
                    Some(v) => air_state::js::to_number(Some(v)),
                };
                if !age.is_finite() || !(0.0..=60_000.0).contains(&age) {
                    continue;
                }
                // The room is looked up for every message, so a peer follows the producer's current match.
                let code = engine.join.match_code();
                engine.room(Some(&code)).ingest(std::slice::from_ref(&payload), age);
                if let Some(p) = engine.join.lock().peers.get_mut(&id) {
                    p.last = Some(now_ms());
                    p.messages += 1;
                    if let Some(pid) = payload.get("playerId").and_then(Value::as_str) {
                        p.player_id = Some(pid.to_string());
                    }
                }
            }
            _ = kicked.changed() => break,
            _ = ping.tick() => {
                ok = socket.send(Message::Ping(Vec::new().into())).await.is_ok();
            }
        }
    }
    engine.join.lock().peers.remove(&id);
}

#[cfg(test)]
mod admit_tests {
    use super::admit;
    use serde_json::json;

    const ID: &str = "11111111-2222-3333-4444-555555555555";

    #[test]
    fn a_player_pc_sends_only_its_own_player() {
        let full = json!({ "info": { "me": { "health": "64" }, "match_info": { "match_score": "{}", "round_number": "9" } }, "playerId": ID });
        assert_eq!(
            admit("player", &full),
            Some(json!({ "info": { "me": { "health": "64" } }, "feature": "me", "playerId": ID }))
        );
        let key = json!({ "feature": "me", "key": "health", "data": "80", "playerId": ID });
        assert_eq!(admit("player", &key), Some(key.clone()));
        assert_eq!(
            admit(
                "player",
                &json!({ "playerId": ID, "captureHeartbeat": true })
            ),
            Some(json!({ "playerId": ID, "captureHeartbeat": true }))
        );
        assert_eq!(
            admit(
                "player",
                &json!({ "info": { "match_info": { "round_number": "9" } }, "playerId": ID })
            ),
            None
        );
        assert_eq!(
            admit(
                "player",
                &json!({ "events": [{ "name": "kill_feed", "data": "{}" }], "playerId": ID })
            ),
            None
        );
        assert_eq!(
            admit(
                "player",
                &json!({ "feature": "me", "key": "health", "data": "80" })
            ),
            None,
            "untagged"
        );
        // Even under `me`, only the player's own health, abilities and id get through.
        assert_eq!(
            admit(
                "player",
                &json!({ "feature": "me", "key": "match_score", "data": "{}", "playerId": ID })
            ),
            None
        );
        let sneaky = json!({ "feature": "me", "info": { "me": { "health": "50", "match_score": "{\"team_0\":12}", "scoreboard_0": "{}" }, "match_info": { "round_number": "9" } }, "events": [{ "name": "kill_feed", "data": "{}" }], "playerId": ID });
        assert_eq!(
            admit("player", &sneaky),
            Some(json!({ "info": { "me": { "health": "50" } }, "feature": "me", "playerId": ID }))
        );
        assert_eq!(
            admit(
                "player",
                &json!({ "info": { "me": { "round_number": "3" } }, "playerId": ID })
            ),
            None
        );
        let observer = json!({ "info": { "match_info": { "round_number": "9" } } });
        assert_eq!(admit("observer", &observer), Some(observer.clone()));
    }
}
