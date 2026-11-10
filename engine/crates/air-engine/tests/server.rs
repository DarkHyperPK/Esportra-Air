//! End-to-end checks against a running engine on a random port, using the real HUD files.

use std::path::PathBuf;
use std::time::Duration;

use air_engine::{start, Config, Running};
use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio_tungstenite::tungstenite::Message;

const KEY: &str = "test-key-0123456789abcdef";

fn hud_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../../esportra-valorant-hud")
        .canonicalize()
        .unwrap()
}

fn temp_dir() -> PathBuf {
    let dir = std::env::temp_dir().join(format!("air-engine-test-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

async fn engine(data: PathBuf) -> Running {
    let config = Config {
        root: hud_root(),
        data,
        key: KEY.into(),
        host: "127.0.0.1".into(),
        port: 0,
        feed_stale_ms: Some(1500.0),
    };
    start(config).await.unwrap()
}

struct Reply {
    status: u16,
    headers: String,
    body: String,
}

impl Reply {
    fn json(&self) -> Value {
        serde_json::from_str(&self.body).unwrap_or_else(|e| panic!("{e}: {}", self.body))
    }
}

/// Minimal HTTP/1.1 client: one request per connection.
async fn request(r: &Running, method: &str, path: &str, body: Option<&Value>, key: bool) -> Reply {
    let mut stream = TcpStream::connect(r.addr).await.unwrap();
    let payload = body.map(|b| b.to_string()).unwrap_or_default();
    let auth = if key {
        format!("X-Esportra-Key: {KEY}\r\n")
    } else {
        String::new()
    };
    let head = format!(
        "{method} {path} HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n{auth}Content-Type: application/json\r\nContent-Length: {}\r\n\r\n",
        payload.len()
    );
    stream.write_all(head.as_bytes()).await.unwrap();
    stream.write_all(payload.as_bytes()).await.unwrap();
    let mut raw = Vec::new();
    stream.read_to_end(&mut raw).await.unwrap();
    let text = String::from_utf8_lossy(&raw).into_owned();
    let (headers, body) = text.split_once("\r\n\r\n").unwrap();
    let status = headers.split(' ').nth(1).unwrap().parse().unwrap();
    let body = if headers
        .to_ascii_lowercase()
        .contains("transfer-encoding: chunked")
    {
        dechunk(body)
    } else {
        body.to_string()
    };
    Reply {
        status,
        headers: headers.to_string(),
        body,
    }
}

fn dechunk(body: &str) -> String {
    let mut out = String::new();
    let mut rest = body;
    while let Some((size, tail)) = rest.split_once("\r\n") {
        let n = usize::from_str_radix(size.trim(), 16).unwrap_or(0);
        if n == 0 {
            break;
        }
        out.push_str(&tail[..n]);
        rest = &tail[n + 2..];
    }
    out
}

type Ws = tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<TcpStream>>;

async fn ws(r: &Running, query: &str) -> Ws {
    tokio_tungstenite::connect_async(format!("ws://{}/ws?{query}", r.addr))
        .await
        .unwrap()
        .0
}

async fn next_json(socket: &mut Ws) -> Value {
    loop {
        let message = tokio::time::timeout(Duration::from_secs(5), socket.next())
            .await
            .expect("message within 5 s")
            .unwrap()
            .unwrap();
        if let Message::Text(text) = message {
            return serde_json::from_str(&text).unwrap();
        }
    }
}

#[tokio::test]
async fn serves_overlays_and_guards_paths_and_writes() {
    let r = engine(temp_dir()).await;
    let health = request(&r, "GET", "/health", None, false).await;
    assert_eq!(health.status, 200);
    assert_eq!(health.json()["ok"], json!(true));
    let overlay = request(&r, "GET", "/overlays/scorebug.html", None, false).await;
    assert_eq!(overlay.status, 200);
    assert!(overlay.headers.to_ascii_lowercase().contains("text/html"));
    assert_eq!(
        request(&r, "GET", "/server/server.js", None, false)
            .await
            .status,
        403
    );
    assert_eq!(
        request(&r, "GET", "/%2e%2e/%2e%2e/etc/passwd", None, false)
            .await
            .status,
        403
    );
    assert_eq!(
        request(&r, "GET", "/nope.html", None, false).await.status,
        404
    );
    assert_eq!(
        request(
            &r,
            "PATCH",
            "/api/T1",
            Some(&json!({ "toast": { "text": "x" } })),
            false
        )
        .await
        .status,
        401
    );
    assert_eq!(
        request(&r, "GET", "/control/status", None, false)
            .await
            .status,
        401
    );
    let state = request(&r, "GET", "/api/t1", None, false).await.json();
    assert_eq!(state["match"], json!("T1"));
    assert_eq!(state["state"]["firstSide"], json!(["ATK", "DEF"]));
    let bad = request(&r, "POST", "/api/T1/event", None, true).await;
    assert_eq!(bad.status, 200, "empty body is an empty event");
}

#[tokio::test]
async fn websocket_snapshot_patch_resync_and_writers() {
    let r = engine(temp_dir()).await;
    let mut overlay = ws(&r, "match=ws1").await;
    let snapshot = next_json(&mut overlay).await;
    assert_eq!(snapshot["type"], json!("snapshot"));
    assert_eq!(snapshot["v"], json!(0));

    let reply = request(
        &r,
        "PATCH",
        "/api/WS1",
        Some(&json!({ "toast": { "text": "hello" } })),
        true,
    )
    .await;
    assert_eq!(reply.json()["v"], json!(1));
    let patch = next_json(&mut overlay).await;
    assert_eq!(
        patch,
        json!({ "type": "patch", "v": 1, "patch": { "toast": { "text": "hello" } } })
    );

    overlay
        .send(Message::Text(
            json!({ "type": "resync" }).to_string().into(),
        ))
        .await
        .unwrap();
    let again = next_json(&mut overlay).await;
    assert_eq!(again["type"], json!("snapshot"));
    assert_eq!(again["state"]["toast"]["text"], json!("hello"));

    // A control client without the key is told it is read-only and cannot write.
    let mut reader = ws(&r, "match=WS1&role=control").await;
    next_json(&mut reader).await;
    assert_eq!(next_json(&mut reader).await["type"], json!("error"));
    reader
        .send(Message::Text(
            json!({ "type": "patch", "patch": { "stinger": 9 } })
                .to_string()
                .into(),
        ))
        .await
        .unwrap();

    let mut writer = ws(&r, &format!("match=WS1&role=control&key={KEY}")).await;
    next_json(&mut writer).await;
    writer
        .send(Message::Text(
            json!({ "type": "patch", "patch": { "stinger": 2 } })
                .to_string()
                .into(),
        ))
        .await
        .unwrap();
    let change = next_json(&mut overlay).await;
    assert_eq!(change["v"], json!(2), "the read-only write was ignored");
    assert_eq!(change["patch"], json!({ "stinger": 2 }));

    writer
        .send(Message::Text(
            json!({ "type": "event", "event": { "kind": "flash" } })
                .to_string()
                .into(),
        ))
        .await
        .unwrap();
    let event = next_json(&mut overlay).await;
    assert_eq!(event["type"], json!("event"));
    assert_eq!(event["event"]["kind"], json!("flash"));
}

#[tokio::test]
async fn ingests_a_full_simulated_match() {
    let r = engine(temp_dir()).await;
    let fixture = std::fs::read_to_string(
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../fixtures/simulated-match.ndjson"),
    )
    .unwrap();
    let mut overlay = ws(&r, "match=SIM").await;
    next_json(&mut overlay).await;
    let mut last = Value::Null;
    for line in fixture.lines().skip(1) {
        let step: Value = serde_json::from_str(line).unwrap();
        let reply = match step["kind"].as_str().unwrap() {
            "ingest" => {
                request(
                    &r,
                    "POST",
                    "/api/SIM/ingest/valorant",
                    Some(&step["input"]),
                    true,
                )
                .await
            }
            _ => request(&r, "PATCH", "/api/SIM", Some(&step["input"]), true).await,
        };
        assert_eq!(reply.status, 200, "{}", reply.body);
        last = step["state"].clone();
    }
    let state = request(&r, "GET", "/api/SIM", None, false).await.json()["state"].clone();
    assert_eq!(state["teams"][0]["score"], last["teams"][0]["score"]);
    assert_eq!(state["teams"][1]["score"], last["teams"][1]["score"]);
    assert_eq!(state["rounds"], last["rounds"]);
    assert_eq!(state["players"][0][0]["k"], last["players"][0][0]["k"]);
    assert_eq!(state["teamStats"], last["teamStats"]);
    // The overlay saw a continuous run of versions.
    let mut v = 0;
    while let Ok(Some(Ok(Message::Text(text)))) =
        tokio::time::timeout(Duration::from_millis(300), overlay.next()).await
    {
        let m: Value = serde_json::from_str(&text).unwrap();
        if m["type"] == json!("patch") {
            assert_eq!(m["v"].as_u64().unwrap(), v + 1, "no gap in patch versions");
            v += 1;
        }
    }
    assert!(v > 100, "received {v} patches");
}

#[tokio::test]
async fn display_fixes_change_only_what_viewers_see() {
    let r = engine(temp_dir()).await;
    request(
        &r,
        "PATCH",
        "/api/FIX",
        Some(&json!({ "teams": [{ "score": 3 }, { "score": 5 }] })),
        true,
    )
    .await;
    let set = json!({ "action": "set", "field": "scores", "value": [4, 5], "until": "cleared", "reason": "Missed round" });
    let reply = request(&r, "POST", "/api/FIX/display-fixes", Some(&set), true).await;
    assert_eq!(reply.status, 200, "{}", reply.body);
    assert_eq!(reply.json()["teams"][0]["sourceScore"], json!(3));
    assert_eq!(
        request(&r, "GET", "/api/FIX", None, false).await.json()["state"]["teams"][0]["score"],
        json!(4)
    );
    let invalid = json!({ "action": "set", "field": "scores", "value": [-1, 5], "until": "cleared", "reason": "x" });
    assert_eq!(
        request(&r, "POST", "/api/FIX/display-fixes", Some(&invalid), true)
            .await
            .status,
        400
    );
    request(
        &r,
        "POST",
        "/api/FIX/display-fixes",
        Some(&json!({ "action": "clear" })),
        true,
    )
    .await;
    assert_eq!(
        request(&r, "GET", "/api/FIX", None, false).await.json()["state"]["teams"][0]["score"],
        json!(3)
    );
    let map = request(
        &r,
        "POST",
        "/api/FIX/map-result",
        Some(&json!({ "mapIndex": 1, "teamAScore": 13, "teamBScore": 7 })),
        true,
    )
    .await;
    assert_eq!(map.json()["patch"]["series"][0]["winner"], json!(0));
}

#[tokio::test]
async fn output_aliases_follow_their_match() {
    let r = engine(temp_dir()).await;
    let outputs =
        json!({ "outputs": [{ "id": "main-hud", "overlay": "scorebug", "matchCode": "a1" }] });
    assert_eq!(
        request(&r, "PUT", "/control/outputs", Some(&outputs), true)
            .await
            .status,
        200
    );
    let page = request(&r, "GET", "/o/main-hud", None, false).await;
    assert_eq!(page.status, 200);
    assert!(page.body.contains("<base href=\"/overlays/\">"));
    assert_eq!(
        request(&r, "GET", "/o/missing", None, false).await.status,
        404
    );

    request(
        &r,
        "PATCH",
        "/api/B2",
        Some(&json!({ "toast": { "text": "match B" } })),
        true,
    )
    .await;
    let mut out = ws(&r, "output=main-hud").await;
    assert_eq!(
        next_json(&mut out).await["state"]["toast"]["text"],
        json!("")
    );
    out.send(Message::Text(
        json!({ "type": "rendered", "v": 0 }).to_string().into(),
    ))
    .await
    .unwrap();
    tokio::time::sleep(Duration::from_millis(100)).await;
    let status = request(&r, "GET", "/control/status", None, true)
        .await
        .json();
    assert_eq!(status["outputs"][0]["connections"], json!(1));
    assert!(status["outputs"][0]["lastFrameAt"].is_number());

    let moved =
        json!({ "outputs": [{ "id": "main-hud", "overlay": "scorebug", "matchCode": "B2" }] });
    request(&r, "PUT", "/control/outputs", Some(&moved), true).await;
    let snapshot = next_json(&mut out).await;
    assert_eq!(snapshot["type"], json!("snapshot"));
    assert_eq!(snapshot["state"]["toast"]["text"], json!("match B"));
}

#[tokio::test]
async fn state_survives_an_engine_restart() {
    let data = temp_dir();
    let first = engine(data.clone()).await;
    request(&first, "PATCH", "/api/KEEP", Some(&json!({ "teams": [{ "name": "Alpha" }, { "name": "Bravo" }], "airPause": { "id": "x" } })), true).await;
    tokio::time::sleep(Duration::from_millis(700)).await;
    request(&first, "POST", "/control/shutdown", None, true).await;
    first.task.await.unwrap();
    let second = engine(data).await;
    let state = request(&second, "GET", "/api/KEEP", None, false)
        .await
        .json()["state"]
        .clone();
    assert_eq!(state["teams"][0]["name"], json!("Alpha"));
    assert!(
        state.get("airPause").is_none(),
        "live pause panels are not restored"
    );
}

#[tokio::test]
async fn feed_paused_only_after_game_data_stops() {
    let r = engine(temp_dir()).await;
    let mut overlay = ws(&r, "match=FEED").await;
    next_json(&mut overlay).await;
    // A live round run by hand (no game data yet) is never tagged.
    request(
        &r,
        "PATCH",
        "/api/FEED",
        Some(&json!({ "round": { "phase": "live" } })),
        true,
    )
    .await;
    next_json(&mut overlay).await;
    tokio::time::sleep(Duration::from_millis(2200)).await;
    let state = request(&r, "GET", "/api/FEED", None, false).await.json()["state"].clone();
    assert!(
        state.get("airDiagnostics").is_none(),
        "no tag without a feed: {}",
        state["airDiagnostics"]
    );

    // Game data arrives, then stops: the tag appears, and clears on the next data.
    let message =
        json!([{ "info": { "match_info": { "round_number": "2" } }, "feature": "match_info" }]);
    request(
        &r,
        "POST",
        "/api/FEED/ingest/valorant",
        Some(&message),
        true,
    )
    .await;
    let mut paused = false;
    for _ in 0..8 {
        let m = next_json(&mut overlay).await;
        if m["patch"]["airDiagnostics"]["feedPaused"] == json!(true) {
            paused = true;
            break;
        }
    }
    assert!(paused, "stopped feed shows the tag");
    let message =
        json!([{ "info": { "match_info": { "round_number": "3" } }, "feature": "match_info" }]);
    request(
        &r,
        "POST",
        "/api/FEED/ingest/valorant",
        Some(&message),
        true,
    )
    .await;
    let mut resumed = false;
    for _ in 0..6 {
        let m = next_json(&mut overlay).await;
        if m["patch"]["airDiagnostics"]["feedPaused"] == json!(false) {
            resumed = true;
            break;
        }
    }
    assert!(resumed, "fresh game data clears the tag");
}
