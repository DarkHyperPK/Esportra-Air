//! WebSocket rooms: `ws://host:port/ws?match=CODE&role=overlay|control|ingest|player[&key=…]`
//! or `?output=<alias>` for a stable output that follows its match.
//!
//! On join a client gets `{type:'snapshot', v, state}`; after that each change arrives as
//! `{type:'patch', v, patch}` with `v` incrementing by one. A client that sees a gap sends
//! `{type:'resync'}`. Overlays acknowledge drawn versions with `{type:'rendered', v}`.

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;

use axum::extract::ws::{CloseFrame, Message, WebSocket, WebSocketUpgrade};
use axum::extract::{RawQuery, State};
use axum::response::Response;
use serde_json::{json, Value};
use tokio::sync::broadcast::error::RecvError;

use crate::engine::{now_ms, Engine, Room};
use crate::http::{percent_decode, query_get};
use crate::AppState;

static NEXT_CLIENT: AtomicU64 = AtomicU64::new(1);
const PING_EVERY: Duration = Duration::from_secs(20);

pub async fn upgrade(
    State(app): State<AppState>,
    RawQuery(raw): RawQuery,
    ws: WebSocketUpgrade,
) -> Response {
    let q: Vec<(String, String)> = raw
        .unwrap_or_default()
        .split('&')
        .filter(|p| !p.is_empty())
        .map(|p| {
            let (k, v) = p.split_once('=').unwrap_or((p, ""));
            (
                percent_decode(&k.replace('+', " ")),
                percent_decode(&v.replace('+', " ")),
            )
        })
        .collect();
    ws.max_message_size(2_000_000)
        .on_upgrade(move |socket| client(app.engine.clone(), socket, q))
}

struct Subscription {
    room: Arc<Room>,
    rx: tokio::sync::broadcast::Receiver<Arc<str>>,
}

/// Subscribes and takes the snapshot under the room lock, so the first patch received follows it.
fn join(room: Arc<Room>) -> (Subscription, String) {
    let inner = room.lock();
    let rx = room.tx.subscribe();
    let snapshot =
        json!({ "type": "snapshot", "v": inner.v, "state": inner.fixes.view(&inner.state) })
            .to_string();
    drop(inner);
    (Subscription { room, rx }, snapshot)
}

async fn close(mut socket: WebSocket, reason: &'static str) {
    let _ = socket
        .send(Message::Close(Some(CloseFrame {
            code: 1008,
            reason: reason.into(),
        })))
        .await;
}

async fn client(engine: Arc<Engine>, mut socket: WebSocket, q: Vec<(String, String)>) {
    let role = query_get(&q, "role")
        .filter(|r| !r.is_empty())
        .unwrap_or_else(|| "overlay".into());
    let output_id = query_get(&q, "output").filter(|o| !o.is_empty());
    let output = output_id
        .as_deref()
        .and_then(|id| engine.resolve_output(id));
    if output_id.is_some() && (output.is_none() || role != "overlay") {
        return close(socket, "Output unavailable").await;
    }
    let code = output
        .as_ref()
        .map(|o| o.match_code.clone())
        .or_else(|| query_get(&q, "match"));
    let writer = output_id.is_none()
        && role != "overlay"
        && engine.can_write(query_get(&q, "key").as_deref());
    let id = NEXT_CLIENT.fetch_add(1, Ordering::Relaxed);
    if let Some(output) = &output_id {
        engine
            .frames
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .insert(id, (output.clone(), None));
    }
    let (mut sub, snapshot) = join(engine.room(code.as_deref()));
    let mut outputs = engine.outputs_changed.subscribe();
    let mut ping = tokio::time::interval(PING_EVERY);
    ping.tick().await;
    let mut ok = socket.send(Message::Text(snapshot.into())).await.is_ok();
    if ok && role != "overlay" && !writer {
        let message = json!({ "type": "error", "message": "Read-only: this server needs ?key= for control and ingest clients." });
        ok = socket
            .send(Message::Text(message.to_string().into()))
            .await
            .is_ok();
    }
    while ok {
        tokio::select! {
            incoming = socket.recv() => {
                let Some(Ok(message)) = incoming else { break };
                let text = match message {
                    Message::Text(t) => t.to_string(),
                    Message::Binary(b) => String::from_utf8_lossy(&b).into_owned(),
                    Message::Close(_) => break,
                    _ => continue,
                };
                let Ok(m) = serde_json::from_str::<Value>(&text) else { continue };
                if let Some(reply) = handle(&engine, &sub.room, id, &role, writer, &m) {
                    ok = socket.send(Message::Text(reply.into())).await.is_ok();
                }
            }
            broadcast = sub.rx.recv() => {
                let text = match broadcast {
                    Ok(text) => text.to_string(),
                    // Too far behind: start again from a snapshot.
                    Err(RecvError::Lagged(_)) => sub.room.snapshot(),
                    Err(RecvError::Closed) => break,
                };
                ok = socket.send(Message::Text(text.into())).await.is_ok();
            }
            changed = outputs.changed(), if output_id.is_some() => {
                if changed.is_err() { break; }
                let Some(next) = output_id.as_deref().and_then(|o| engine.resolve_output(o)) else {
                    return finish(&engine, id, close(socket, "Output removed")).await;
                };
                if !Arc::ptr_eq(&engine.room(Some(&next.match_code)), &sub.room) {
                    let (next_sub, snapshot) = join(engine.room(Some(&next.match_code)));
                    sub = next_sub;
                    if let Some(entry) = engine.frames.lock().unwrap_or_else(|p| p.into_inner()).get_mut(&id) {
                        entry.1 = None;
                    }
                    ok = socket.send(Message::Text(snapshot.into())).await.is_ok();
                }
            }
            _ = ping.tick() => {
                ok = socket.send(Message::Ping(Vec::new().into())).await.is_ok();
            }
        }
    }
    finish(&engine, id, async {}).await;
}

async fn finish(engine: &Engine, id: u64, then: impl std::future::Future<Output = ()>) {
    then.await;
    engine
        .frames
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .remove(&id);
}

/// One client message. Returns a direct reply (only `resync` has one).
fn handle(
    engine: &Engine,
    room: &Room,
    id: u64,
    role: &str,
    writer: bool,
    m: &Value,
) -> Option<String> {
    let kind = m.get("type").and_then(Value::as_str).unwrap_or("");
    if kind == "resync" {
        return Some(room.snapshot());
    }
    if role == "overlay" && kind == "rendered" {
        let current = room.lock().v;
        if m.get("v").and_then(Value::as_u64) == Some(current) {
            if let Some(entry) = engine
                .frames
                .lock()
                .unwrap_or_else(|p| p.into_inner())
                .get_mut(&id)
            {
                entry.1 = Some(now_ms());
            }
        }
        return None;
    }
    if !writer {
        return None;
    }
    match kind {
        // Only objects: the JavaScript server would replace or break the state with anything else.
        "set" if m.get("state").is_some_and(Value::is_object) => {
            let mut inner = room.lock();
            let next = air_state::merge(engine.defaults.default.clone(), &m["state"]);
            room.apply(&mut inner, next, role);
        }
        "patch" if m.get("patch").is_some_and(Value::is_object) => {
            let mut inner = room.lock();
            let next = air_state::merge(inner.state.clone(), &m["patch"]);
            room.apply(&mut inner, next, role);
        }
        "event" => {
            room.event(m.get("event").unwrap_or(&Value::Null), role);
        }
        "valorant" => {
            let age = match m.get("bufferedAgeMs") {
                None => 0.0,
                Some(v) => air_state::js::to_number(Some(v)),
            };
            if age.is_finite() && (0.0..=60_000.0).contains(&age) {
                room.ingest(
                    std::slice::from_ref(m.get("message").unwrap_or(&Value::Null)),
                    age,
                );
            }
        }
        _ => {}
    }
    None
}
