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

#[tokio::test]
async fn test_round_plays_sample_data_and_restores_the_match() {
    let data = temp_dir();
    let r = engine(data.clone()).await;
    let own = json!({ "teams": [{ "name": "Alpha", "tag": "ALP" }, { "name": "Bravo", "tag": "BRV" }], "map": { "name": "BIND" } });
    request(&r, "PATCH", "/api/TR", Some(&own), true).await;
    let before = request(&r, "GET", "/api/TR", None, false).await.json()["state"].clone();
    let start = request(
        &r,
        "POST",
        "/control/test-round",
        Some(&json!({ "match": "TR", "action": "start" })),
        true,
    )
    .await;
    assert_eq!(start.status, 200, "{}", start.body);
    assert_eq!(
        request(
            &r,
            "POST",
            "/control/test-round",
            Some(&json!({ "match": "TR", "action": "start" })),
            true
        )
        .await
        .status,
        409
    );
    tokio::time::sleep(Duration::from_millis(1500)).await;
    let playing = request(&r, "GET", "/api/TR", None, false).await.json()["state"].clone();
    assert_eq!(
        playing["airContext"]["simulation"],
        json!(true),
        "HUD shows the rehearsal tag"
    );
    assert_eq!(
        playing["teams"][0]["name"],
        json!("Alpha"),
        "the producer's own teams are kept"
    );
    assert_eq!(
        playing["players"][0][0]["name"],
        json!("JUNO"),
        "sample players come through the real parser"
    );
    let fix = json!({ "action": "set", "field": "scores", "value": [1, 1], "until": "cleared", "reason": "x" });
    assert_eq!(
        request(&r, "POST", "/api/TR/display-fixes", Some(&fix), true)
            .await
            .status,
        400,
        "no corrections during a test round"
    );
    let status = request(&r, "GET", "/control/status", None, true)
        .await
        .json();
    assert_eq!(
        status["rooms"]
            .as_array()
            .unwrap()
            .iter()
            .find(|room| room["match"] == json!("TR"))
            .unwrap()["testRound"]["running"],
        json!(true)
    );

    request(
        &r,
        "POST",
        "/control/test-round",
        Some(&json!({ "match": "TR", "action": "stop" })),
        true,
    )
    .await;
    let after = request(&r, "GET", "/api/TR", None, false).await.json()["state"].clone();
    assert_eq!(after, before, "the match is exactly as it was");
    let log = std::fs::read_to_string(data.join("TR.ndjson")).unwrap_or_default();
    assert!(
        !log.contains("air:test-round"),
        "test rounds are not logged"
    );

    // Real game data stops a running test round and takes over.
    request(
        &r,
        "POST",
        "/control/test-round",
        Some(&json!({ "match": "TR", "action": "start" })),
        true,
    )
    .await;
    tokio::time::sleep(Duration::from_millis(300)).await;
    let real =
        json!([{ "info": { "match_info": { "round_number": "7" } }, "feature": "match_info" }]);
    request(&r, "POST", "/api/TR/ingest/valorant", Some(&real), true).await;
    let state = request(&r, "GET", "/api/TR", None, false).await.json()["state"].clone();
    assert_eq!(state["round"]["number"], json!(7));
    assert!(
        state["airContext"].get("simulation").is_none(),
        "no rehearsal tag on real data"
    );
    assert_eq!(state["teams"][0]["name"], json!("Alpha"));
}

async fn action(r: &Running, matchc: &str, name: &str, args: Value) -> Reply {
    request(
        r,
        "POST",
        "/control/action",
        Some(&json!({ "match": matchc, "name": name, "args": args })),
        true,
    )
    .await
}

async fn show(r: &Running, matchc: &str) -> Value {
    request(r, "GET", &format!("/api/{matchc}"), None, false)
        .await
        .json()["state"]
        .clone()
}

#[tokio::test]
async fn layers_follow_their_modes_and_overrides_win() {
    let r = engine(temp_dir()).await;
    let s = show(&r, "LY").await;
    assert_eq!(s["show"]["scorebug"], json!(true));
    assert_eq!(s["show"]["scoreboard"], json!(false));
    assert_eq!(s["show"]["economy"], json!("auto"));
    assert_eq!(s["airLayers"]["economy"], json!("auto"));

    assert_eq!(
        action(
            &r,
            "LY",
            "layer.set",
            json!({ "layer": "scoreboard", "mode": "on" })
        )
        .await
        .status,
        200
    );
    assert_eq!(show(&r, "LY").await["show"]["scoreboard"], json!(true));
    // A manual choice on an automatic layer holds until it is set back to Auto.
    action(
        &r,
        "LY",
        "layer.set",
        json!({ "layer": "economy", "mode": "off" }),
    )
    .await;
    assert_eq!(show(&r, "LY").await["show"]["economy"], json!(false));
    action(
        &r,
        "LY",
        "layer.set",
        json!({ "layer": "economy", "mode": "auto" }),
    )
    .await;
    assert_eq!(show(&r, "LY").await["show"]["economy"], json!("auto"));

    assert_eq!(
        action(
            &r,
            "LY",
            "layer.set",
            json!({ "layer": "scorebug", "mode": "auto" })
        )
        .await
        .status,
        400,
        "no automatic mode there"
    );
    assert_eq!(
        action(
            &r,
            "LY",
            "layer.set",
            json!({ "layer": "bogus", "mode": "on" })
        )
        .await
        .status,
        400
    );
    assert_eq!(action(&r, "LY", "nonsense", json!({})).await.status, 400);
    let unauthorised = request(
        &r,
        "POST",
        "/control/action",
        Some(&json!({ "match": "LY", "name": "layer.set", "args": {} })),
        false,
    )
    .await;
    assert_eq!(unauthorised.status, 401);

    // An older control panel writing a show flag is kept as a manual choice, not reverted.
    request(
        &r,
        "PATCH",
        "/api/LY",
        Some(&json!({ "show": { "duel": true } })),
        true,
    )
    .await;
    let s = show(&r, "LY").await;
    assert_eq!(s["show"]["duel"], json!(true));
    assert_eq!(s["airLayers"]["duel"], json!("on"));

    // Modes are saved with the match.
}

#[tokio::test]
async fn layer_modes_survive_a_restart_and_init_applies_once() {
    let data = temp_dir();
    let first = engine(data.clone()).await;
    action(
        &first,
        "KEEP",
        "layers.init",
        json!({ "modes": { "minimap": "on", "ticker": "off" } }),
    )
    .await;
    action(
        &first,
        "KEEP",
        "layers.init",
        json!({ "modes": { "minimap": "off" } }),
    )
    .await;
    assert_eq!(
        show(&first, "KEEP").await["airLayers"]["minimap"],
        json!("on"),
        "init does not reset a running show"
    );
    action(
        &first,
        "KEEP",
        "layer.set",
        json!({ "layer": "poll", "mode": "on" }),
    )
    .await;
    tokio::time::sleep(Duration::from_millis(700)).await;
    request(&first, "POST", "/control/shutdown", None, true).await;
    first.task.await.unwrap();
    let second = engine(data).await;
    let s = show(&second, "KEEP").await;
    assert_eq!(s["airLayers"]["poll"], json!("on"));
    assert_eq!(s["airLayers"]["ticker"], json!("off"));
    assert_eq!(s["show"]["minimap"], json!(true));
}

#[tokio::test]
async fn actions_validate_and_change_the_graphics() {
    let r = engine(temp_dir()).await;
    let mut overlay = ws(&r, "match=AC").await;
    next_json(&mut overlay).await;

    assert_eq!(
        action(&r, "AC", "toast.show", json!({ "text": "<b>hi</b>" }))
            .await
            .status,
        400
    );
    assert_eq!(
        action(
            &r,
            "AC",
            "toast.show",
            json!({ "text": "Map 2 starts soon" })
        )
        .await
        .status,
        200
    );
    assert_eq!(
        show(&r, "AC").await["toast"]["text"],
        json!("Map 2 starts soon")
    );

    let poll =
        json!({ "question": "Who wins?", "options": ["Alpha", "Bravo"], "firstPercent": 60 });
    assert_eq!(action(&r, "AC", "poll.show", poll).await.status, 200);
    let s = show(&r, "AC").await;
    assert_eq!(s["poll"]["options"][1]["pct"], json!(40));
    assert_eq!(s["show"]["poll"], json!(true));
    assert_eq!(
        action(
            &r,
            "AC",
            "poll.show",
            json!({ "question": "Q", "options": ["Same", "same"], "firstPercent": 50 })
        )
        .await
        .status,
        400
    );
    assert_eq!(
        action(
            &r,
            "AC",
            "poll.show",
            json!({ "question": "Q", "options": ["A", "B"], "firstPercent": 101 })
        )
        .await
        .status,
        400
    );
    action(&r, "AC", "poll.hide", json!({})).await;
    assert_eq!(show(&r, "AC").await["show"]["poll"], json!(false));

    action(
        &r,
        "AC",
        "lowerthird.generic",
        json!({ "title": "Sara Malik", "sub": "Caster · play-by-play" }),
    )
    .await;
    let s = show(&r, "AC").await;
    assert_eq!(s["lowerThird"]["title"], json!("Sara Malik"));
    assert_eq!(s["show"]["lowerThird"], json!(true));
    action(&r, "AC", "lowerthird.hide", json!({})).await;
    let s = show(&r, "AC").await;
    assert_eq!(s["show"]["lowerThird"], json!(false));
    assert_eq!(s["airLayers"]["lowerThird"], json!("auto"));
    assert_eq!(
        action(
            &r,
            "AC",
            "lowerthird.player",
            json!({ "team": 0, "player": 7 })
        )
        .await
        .status,
        400
    );
    assert_eq!(
        action(
            &r,
            "AC",
            "lowerthird.player",
            json!({ "team": 1, "player": 2 })
        )
        .await
        .status,
        200
    );
    assert_eq!(show(&r, "AC").await["lowerThird"]["kind"], json!("player"));
    assert_eq!(
        action(&r, "AC", "spotlight.set", json!({ "team": 1, "player": 2 }))
            .await
            .status,
        200
    );
    assert_eq!(show(&r, "AC").await["spotlight"]["player"], json!(2));
    action(&r, "AC", "stinger.play", json!({})).await;
    assert!(show(&r, "AC").await["stinger"].as_f64().unwrap() > 1.0e12);

    // Every change reached the overlay as an ordinary patch.
    let mut patches = 0;
    while let Ok(Some(Ok(Message::Text(text)))) =
        tokio::time::timeout(Duration::from_millis(300), overlay.next()).await
    {
        if serde_json::from_str::<Value>(&text).unwrap()["type"] == json!("patch") {
            patches += 1;
        }
    }
    assert!(patches >= 8, "{patches} patches");
}

fn scoreboard(i: usize) -> Value {
    json!({ "feature": "match_info", "key": format!("scoreboard_{i}"), "data": json!({
        "player_id": format!("pid-{i}"), "name": format!("P{i} #T"), "character": "Clay", "team": if i < 5 { 0 } else { 1 },
        "alive": true, "ult_points": 1, "ult_max": 7, "kills": 0, "deaths": 0, "assists": 0, "money": 3900, "weapon": "TX_Hud_Rifles_Volcano", "shield": 2,
    }).to_string() })
}

fn kill(attacker: usize, victim: usize) -> Value {
    json!({ "events": [{ "name": "kill_feed", "data": json!({ "attacker": format!("P{attacker} #T"), "victim": format!("P{victim} #T"), "weapon": "TX_Hud_Rifles_Volcano", "headshot": false }).to_string() }] })
}

#[tokio::test]
async fn a_triple_kill_shows_a_callout_that_clears_itself() {
    let r = engine(temp_dir()).await;
    let roster: Vec<Value> = (0..10).map(scoreboard).collect();
    request(
        &r,
        "POST",
        "/api/MK/ingest/valorant",
        Some(&Value::Array(roster)),
        true,
    )
    .await;
    request(
        &r,
        "POST",
        "/api/MK/ingest/valorant",
        Some(&json!([kill(0, 5), kill(0, 6)])),
        true,
    )
    .await;
    assert_eq!(
        show(&r, "MK").await["show"]["lowerThird"],
        json!(false),
        "two kills is not a callout"
    );
    request(
        &r,
        "POST",
        "/api/MK/ingest/valorant",
        Some(&json!([kill(0, 7)])),
        true,
    )
    .await;
    let s = show(&r, "MK").await;
    assert_eq!(s["lowerThird"]["title"], json!("3 KILLS"));
    assert_eq!(s["show"]["lowerThird"], json!(true));
    assert_eq!(
        s["airLayers"]["lowerThird"],
        json!("auto"),
        "a rule, not a manual choice"
    );
    tokio::time::sleep(Duration::from_millis(5600)).await;
    assert_eq!(
        show(&r, "MK").await["show"]["lowerThird"],
        json!(false),
        "clears after five seconds"
    );

    // With the layer switched Off the producer wins: no callout.
    action(
        &r,
        "MK",
        "layer.set",
        json!({ "layer": "lowerThird", "mode": "off" }),
    )
    .await;
    request(
        &r,
        "POST",
        "/api/MK/ingest/valorant",
        Some(&json!([kill(1, 5), kill(1, 6), kill(1, 7)])),
        true,
    )
    .await;
    assert_eq!(show(&r, "MK").await["show"]["lowerThird"], json!(false));
}

#[tokio::test]
async fn a_new_match_returns_manual_overrides_to_auto() {
    let r = engine(temp_dir()).await;
    action(
        &r,
        "NM",
        "layer.set",
        json!({ "layer": "economy", "mode": "off" }),
    )
    .await;
    action(
        &r,
        "NM",
        "layer.set",
        json!({ "layer": "poll", "mode": "on" }),
    )
    .await;
    request(
        &r,
        "POST",
        "/api/NM/ingest/valorant",
        Some(&json!([{ "events": [{ "name": "match_start", "data": "" }] }])),
        true,
    )
    .await;
    let s = show(&r, "NM").await;
    assert_eq!(s["airLayers"]["economy"], json!("auto"));
    assert_eq!(
        s["airLayers"]["poll"],
        json!("on"),
        "manual-only layers are not auto layers"
    );
}

#[tokio::test]
async fn observers_receive_events_but_are_not_counted_as_viewers() {
    let r = engine(temp_dir()).await;
    let mut viewer = ws(&r, "match=OB").await;
    next_json(&mut viewer).await;
    let mut observer = ws(&r, "match=OB&role=observe").await;
    next_json(&mut observer).await;
    tokio::time::sleep(Duration::from_millis(100)).await;
    let rooms = request(&r, "GET", "/control/status", None, true)
        .await
        .json()["rooms"]
        .clone();
    let room = rooms
        .as_array()
        .unwrap()
        .iter()
        .find(|x| x["match"] == json!("OB"))
        .unwrap()
        .clone();
    assert_eq!(room["clients"], json!(1), "only the overlay counts");
    action(&r, "OB", "toast.show", json!({ "text": "hello" })).await;
    request(
        &r,
        "POST",
        "/api/OB/event",
        Some(&json!({ "type": "ping" })),
        true,
    )
    .await;
    let mut got_event = false;
    for _ in 0..4 {
        if next_json(&mut observer).await["type"] == json!("event") {
            got_event = true;
            break;
        }
    }
    assert!(got_event, "the observer sees events");
    drop(viewer);
    tokio::time::sleep(Duration::from_millis(150)).await;
    let rooms = request(&r, "GET", "/control/status", None, true)
        .await
        .json()["rooms"]
        .clone();
    let room = rooms
        .as_array()
        .unwrap()
        .iter()
        .find(|x| x["match"] == json!("OB"))
        .unwrap()
        .clone();
    assert_eq!(room["clients"], json!(0));
}

#[tokio::test]
async fn test_round_can_start_late_and_fast_then_restore() {
    let r = engine(temp_dir()).await;
    let before = request(&r, "GET", "/api/SK", None, false).await.json()["state"].clone();
    let post = |body: Value| {
        let r = &r;
        async move { request(r, "POST", "/control/test-round", Some(&body), true).await }
    };
    let start = post(json!({ "match": "SK", "action": "start", "speed": 8.0, "from": 37000.0 })).await;
    assert_eq!(start.status, 200, "{}", start.body);
    let status = start.json();
    assert_eq!((status["speed"].as_f64(), status["fromMs"].as_f64()), (Some(8.0), Some(37000.0)));
    // Speed and position are bounded.
    post(json!({ "match": "SK", "action": "stop" })).await;
    let wild = post(json!({ "match": "SK", "action": "start", "speed": 500.0, "from": 99999999.0 })).await.json();
    assert_eq!(wild["speed"].as_f64(), Some(8.0));
    assert_eq!(wild["fromMs"].as_f64(), Some(38140.0));
    // Seeking restarts from a new position without a 409.
    let seek = post(json!({ "match": "SK", "action": "seek", "from": 10000.0, "speed": 2.0 })).await;
    assert_eq!(seek.status, 200, "{}", seek.body);
    assert_eq!(seek.json()["fromMs"].as_f64(), Some(10000.0));
    // Earlier steps were applied at once, so the HUD already shows a played state.
    tokio::time::sleep(Duration::from_millis(300)).await;
    let playing = request(&r, "GET", "/api/SK", None, false).await.json()["state"].clone();
    assert_eq!(playing["airContext"]["simulation"], json!(true));
    post(json!({ "match": "SK", "action": "stop" })).await;
    let after = request(&r, "GET", "/api/SK", None, false).await.json()["state"].clone();
    assert_eq!(after, before, "the match is exactly as it was");
}

#[tokio::test]
async fn player_cameras_are_validated_and_report_connection() {
    let r = engine(temp_dir()).await;
    let ids = |a: &str| json!([[a, null, null, null, null], [null, null, null, null, "bravo-five"]]);
    let ok = action(&r, "CM", "cams.set", json!({ "layout": "grid10", "delayMs": 1500, "slots": ids("alpha-one") })).await;
    assert_eq!(ok.status, 200, "{}", ok.body);
    let cams = show(&r, "CM").await["airCams"].clone();
    assert_eq!(cams["layout"], json!("grid10"));
    assert_eq!(cams["delayMs"], json!(1500));
    assert_eq!(cams["slots"][1][4], json!("bravo-five"));
    for bad in [
        json!({ "layout": "wall" }),
        json!({ "delayMs": 20000 }),
        json!({ "delayMs": 1.5 }),
        json!({ "slots": ids("bad id!") }),
        json!({ "slots": ids("x") }),
        json!({ "slots": [[null]] }),
    ] {
        assert_eq!(action(&r, "CM", "cams.set", bad.clone()).await.status, 400, "{bad}");
    }
    // Partial updates keep the rest.
    action(&r, "CM", "cams.set", json!({ "layout": "ingame" })).await;
    let cams = show(&r, "CM").await["airCams"].clone();
    assert_eq!((cams["layout"].clone(), cams["slots"][0][0].clone()), (json!("ingame"), json!("alpha-one")));

    // An overlay page reports which cameras are connected; the control status shows it, and it lapses with the page.
    let outputs = json!({ "outputs": [{ "id": "cams-page", "overlay": "player-cams", "matchCode": "CM" }] });
    request(&r, "PUT", "/control/outputs", Some(&outputs), true).await;
    let mut page = ws(&r, "output=cams-page").await;
    next_json(&mut page).await;
    page.send(Message::Text(json!({ "type": "cam", "team": 0, "slot": 0, "connected": true }).to_string().into())).await.unwrap();
    page.send(Message::Text(json!({ "type": "cam", "team": 3, "slot": 9, "connected": true }).to_string().into())).await.unwrap();
    tokio::time::sleep(Duration::from_millis(150)).await;
    let status = request(&r, "GET", "/control/status", None, true).await.json();
    let room = status["rooms"].as_array().unwrap().iter().find(|x| x["match"] == "CM").unwrap();
    assert_eq!(room["cams"][0][0], json!(true));
    assert_eq!(room["cams"][1][4], json!(false));
    drop(page);
    tokio::time::sleep(Duration::from_millis(200)).await;
    let status = request(&r, "GET", "/control/status", None, true).await.json();
    let room = status["rooms"].as_array().unwrap().iter().find(|x| x["match"] == "CM").unwrap();
    assert_eq!(room["cams"][0][0], json!(false), "a closed page no longer reports connected cameras");
}

fn free_port() -> u16 {
    std::net::TcpListener::bind("127.0.0.1:0").unwrap().local_addr().unwrap().port()
}

async fn join_get(port: u16, path: &str) -> u16 {
    let mut stream = TcpStream::connect(("127.0.0.1", port)).await.unwrap();
    stream
        .write_all(format!("GET {path} HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n").as_bytes())
        .await
        .unwrap();
    let mut raw = Vec::new();
    stream.read_to_end(&mut raw).await.unwrap();
    String::from_utf8_lossy(&raw).split(' ').nth(1).unwrap().parse().unwrap()
}

async fn join_ws(port: u16, query: &str) -> Result<Ws, u16> {
    match tokio_tungstenite::connect_async(format!("ws://127.0.0.1:{port}/join?{query}")).await {
        Ok((socket, _)) => Ok(socket),
        Err(tokio_tungstenite::tungstenite::Error::Http(res)) => Err(res.status().as_u16()),
        Err(e) => panic!("{e}"),
    }
}

fn data(message: Value) -> Message {
    Message::Text(json!({ "type": "valorant", "message": message, "bufferedAgeMs": 0 }).to_string().into())
}

async fn join_status(r: &Running) -> Value {
    request(r, "GET", "/control/join", None, true).await.json()
}

#[tokio::test]
async fn joined_pcs_need_the_code_and_can_only_add_game_data() {
    let r = engine(temp_dir()).await;
    let port = free_port();
    // Off by default: nothing listens.
    assert!(TcpStream::connect(("127.0.0.1", port)).await.is_err());
    assert_eq!(request(&r, "PUT", "/control/join", Some(&json!({ "enabled": true, "code": "bad" })), true).await.status, 400);
    assert_eq!(request(&r, "PUT", "/control/join", Some(&json!({ "enabled": true, "code": "K7M4QX" })), false).await.status, 401, "the control API still needs the key");
    let on = request(&r, "PUT", "/control/join", Some(&json!({ "enabled": true, "code": "K7M4QX", "match": "JM", "host": "127.0.0.1", "port": port })), true).await;
    assert_eq!(on.status, 200, "{}", on.body);
    assert_eq!(on.json()["port"], json!(port));

    // The right code gets in; wrong ones are refused, and five wrong ones lock the address out.
    assert_eq!(join_get(port, "/join/hello?code=K7M4QX").await, 200);
    assert_eq!(join_get(port, "/state").await, 404, "only the join routes exist");
    assert_eq!(join_ws(port, "code=WRONG1").await.err(), Some(401));
    for _ in 0..2 {
        assert_eq!(join_get(port, "/join/hello?code=NOPE22").await, 401);
    }
    assert_eq!(join_ws(port, "").await.err(), Some(401));
    assert_eq!(join_get(port, "/join/hello?code=K7M4QX").await, 200, "a right code before the limit clears the count");
    for _ in 0..5 {
        join_get(port, "/join/hello?code=NOPE22").await;
    }
    assert_eq!(join_get(port, "/join/hello?code=K7M4QX").await, 429, "locked out even with the right code");
}

#[tokio::test]
async fn joined_observers_feed_the_current_match_and_players_only_their_own_data() {
    let r = engine(temp_dir()).await;
    let port = free_port();
    let on = |m: &str| json!({ "enabled": true, "code": "K7M4QX", "match": m, "host": "127.0.0.1", "port": port });
    request(&r, "PUT", "/control/join", Some(&on("JA")), true).await;
    let mut observer = join_ws(port, "code=K7M4QX&role=observer&name=Observer%20PC").await.unwrap();
    assert_eq!(next_json(&mut observer).await["type"], json!("hello"));
    observer.send(data(scoreboard(0))).await.unwrap();
    // A message that is not game data, and one with a bad age, change nothing.
    observer.send(Message::Text(json!({ "type": "patch", "patch": { "toast": { "text": "hacked" } } }).to_string().into())).await.unwrap();
    observer.send(Message::Text(json!({ "type": "valorant", "message": scoreboard(1), "bufferedAgeMs": 999999 }).to_string().into())).await.unwrap();
    tokio::time::sleep(Duration::from_millis(300)).await;
    let state = show(&r, "JA").await;
    assert_eq!(state["players"][0][0]["name"], json!("P0"));
    assert_ne!(state["toast"]["text"], json!("hacked"));
    assert_eq!(state["players"][0][1]["name"], json!(""), "the too-old message was dropped");
    let status = join_status(&r).await;
    let peer = &status["peers"][0];
    assert_eq!((peer["role"].clone(), peer["name"].clone(), peer["messages"].clone()), (json!("observer"), json!("Observer PC"), json!(1)));

    // The producer changes match: the same connection now feeds the new room.
    request(&r, "PUT", "/control/join", Some(&on("JB")), true).await;
    observer.send(data(scoreboard(2))).await.unwrap();
    tokio::time::sleep(Duration::from_millis(300)).await;
    assert_eq!(show(&r, "JB").await["players"][0][0]["name"], json!("P2"), "the first player seen in the new room takes its first slot");
    assert_eq!(show(&r, "JA").await["players"][0][2]["name"], json!(""));

    // A player PC cannot send observer data: only messages tagged with its own player id count.
    let mut player = join_ws(port, "code=K7M4QX&role=player&name=Player").await.unwrap();
    next_json(&mut player).await;
    player.send(data(scoreboard(3))).await.unwrap();
    player.send(data(json!({ "feature": "me", "key": "health", "data": "80", "playerId": "11111111-2222-3333-4444-555555555555" }))).await.unwrap();
    // The Player app's refresh carries the player's own view of the match next to `me`: only `me` counts.
    let before = show(&r, "JB").await;
    player.send(data(json!({ "info": { "me": { "health": "64" }, "match_info": { "match_score": "{\"won\":5,\"lost\":2}", "round_phase": "end", "round_number": "9" } }, "playerId": "11111111-2222-3333-4444-555555555555" }))).await.unwrap();
    player.send(data(json!({ "events": [{ "name": "kill_feed", "data": "{}" }], "playerId": "11111111-2222-3333-4444-555555555555" }))).await.unwrap();
    tokio::time::sleep(Duration::from_millis(150)).await;
    let after = show(&r, "JB").await;
    assert_eq!(after["teams"], before["teams"], "a player PC cannot change the score");
    assert_eq!(after["round"]["number"], before["round"]["number"], "a player PC cannot change the round");
    assert_eq!(after["round"]["phase"], before["round"]["phase"]);
    tokio::time::sleep(Duration::from_millis(300)).await;
    assert_eq!(show(&r, "JB").await["players"][0][1]["name"], json!(""), "an untagged scoreboard from a player PC is ignored");
    let status = join_status(&r).await;
    let counts: Vec<(String, u64)> = status["peers"].as_array().unwrap().iter().map(|p| (p["role"].as_str().unwrap().to_string(), p["messages"].as_u64().unwrap())).collect();
    assert!(counts.contains(&("player".into(), 2)), "two `me` messages admitted (scoreboard and kill feed dropped): {counts:?}");
    let pc = status["peers"].as_array().unwrap().iter().find(|p| p["role"] == "player").unwrap();
    assert_eq!(pc["playerId"], json!("11111111-2222-3333-4444-555555555555"), "a player PC says which player it is, so Air can seat it");
    let observer = status["peers"].as_array().unwrap().iter().find(|p| p["role"] == "observer").unwrap();
    assert_eq!(observer["playerId"], Value::Null);

    // A new code drops everyone; switching off closes the port.
    request(&r, "PUT", "/control/join", Some(&json!({ "enabled": true, "code": "NEWCODE2", "match": "JB", "host": "127.0.0.1", "port": port })), true).await;
    tokio::time::sleep(Duration::from_millis(300)).await;
    assert_eq!(join_status(&r).await["peers"].as_array().unwrap().len(), 0);
    assert_eq!(join_ws(port, "code=K7M4QX").await.err(), Some(401), "the old code no longer works");
    request(&r, "PUT", "/control/join", Some(&json!({ "enabled": false })), true).await;
    tokio::time::sleep(Duration::from_millis(300)).await;
    assert!(TcpStream::connect(("127.0.0.1", port)).await.is_err());
    assert_eq!(join_status(&r).await["enabled"], json!(false));
}

#[tokio::test]
async fn the_fullscreen_host_shows_one_named_graphic() {
    let r = engine(temp_dir()).await;
    assert_eq!(action(&r, "FS", "fullscreen.show", json!({ "screen": "map-result" })).await.status, 200);
    assert_eq!(show(&r, "FS").await["airFullscreen"], json!("map-result"));
    assert_eq!(action(&r, "FS", "fullscreen.show", json!({ "screen": "not-a-graphic" })).await.status, 400);
    assert_eq!(action(&r, "FS", "fullscreen.show", json!({ "screen": null })).await.status, 200);
    assert_eq!(show(&r, "FS").await["airFullscreen"], json!(null));
    // Over the game: the same graphic as a band over the game feed or camera.
    assert_eq!(action(&r, "FS", "fullscreen.show", json!({ "screen": "map-veto", "style": "band" })).await.status, 200);
    assert_eq!(show(&r, "FS").await["airFullscreenStyle"], json!("band"));
    assert_eq!(action(&r, "FS", "fullscreen.show", json!({ "screen": "map-veto" })).await.status, 200);
    assert_eq!(show(&r, "FS").await["airFullscreenStyle"], json!("full"), "no style is full screen");
    assert_eq!(action(&r, "FS", "fullscreen.show", json!({ "screen": "map-veto", "style": "sideways" })).await.status, 400);
    // A saved template is named by id; anything that is not a plain id is refused.
    assert_eq!(action(&r, "FS", "fullscreen.show", json!({ "screen": "map-veto", "style": "band", "template": "tpl-gold_1" })).await.status, 200);
    assert_eq!(show(&r, "FS").await["airFullscreenTemplate"], json!("tpl-gold_1"));
    assert_eq!(action(&r, "FS", "fullscreen.show", json!({ "screen": "map-veto" })).await.status, 200);
    assert_eq!(show(&r, "FS").await["airFullscreenTemplate"], Value::Null, "no template is the default look");
    assert_eq!(action(&r, "FS", "fullscreen.show", json!({ "screen": "map-veto", "template": "<b>x</b>" })).await.status, 400);
    let page = request(&r, "GET", "/overlays/fullscreen.html", None, false).await;
    assert_eq!(page.status, 200);
    assert!(page.body.contains("data-modules=\"fullscreen\""));
}

#[tokio::test]
async fn art_on_this_pc_is_served_and_the_catalogue_points_at_it() {
    let data = temp_dir();
    let id = "41fb69c1-4189-7b37-f117-bcaf1e96f1bf";
    let dir = data.join("art").join("agents").join(id);
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(dir.join("displayicon.png"), b"\x89PNG\r\n\x1a\nfake").unwrap();
    let r = engine(data).await;
    let hit = request(
        &r,
        "GET",
        &format!("/art/agents/{id}/displayicon.png"),
        None,
        false,
    )
    .await;
    assert_eq!(hit.status, 200);
    assert!(hit
        .headers
        .to_ascii_lowercase()
        .contains("content-type: image/png"));
    assert_eq!(
        request(
            &r,
            "GET",
            &format!("/art/agents/{id}/fullportrait.png"),
            None,
            false
        )
        .await
        .status,
        404,
        "not downloaded yet"
    );
    assert_eq!(
        request(
            &r,
            "GET",
            &format!("/art/agents/{id}/..%2F..%2Fx.png"),
            None,
            false
        )
        .await
        .status,
        404
    );
    assert_eq!(
        request(&r, "GET", "/art/secrets/x/y.png", None, false)
            .await
            .status,
        404
    );
    let catalogue = request(&r, "GET", "/core/catalog.js", None, false).await;
    assert_eq!(catalogue.status, 200);
    assert!(
        !catalogue.body.contains("media.valorant-api.com"),
        "remote art is rewritten"
    );
    assert!(catalogue
        .body
        .contains(&format!("/art/agents/{id}/displayicon.png")));
}

#[tokio::test]
async fn sample_rooms_change_graphics_during_a_test_round_and_keep_them_after() {
    let r = engine(temp_dir()).await;
    // A match room's test round hands back exactly what was on air: graphics wait.
    let body = json!({ "match": "LIVE", "action": "start", "speed": 1.0 });
    assert_eq!(request(&r, "POST", "/control/test-round", Some(&body), true).await.status, 200);
    let refused = action(&r, "LIVE", "fullscreen.show", json!({ "screen": "halftime" })).await;
    assert_eq!(refused.status, 400, "{}", refused.body);
    // A sample room (rehearsal) may change them, and the change survives the round's end.
    let room = "__ESA_SIM_REH_T1";
    let body = json!({ "match": room, "action": "start", "speed": 1.0 });
    assert_eq!(request(&r, "POST", "/control/test-round", Some(&body), true).await.status, 200);
    let ok = action(&r, room, "fullscreen.show", json!({ "screen": "halftime" })).await;
    assert_eq!(ok.status, 200, "{}", ok.body);
    assert_eq!(show(&r, room).await["airFullscreen"], "halftime");
    let stop = request(&r, "POST", "/control/test-round", Some(&json!({ "match": room, "action": "stop" })), true).await;
    assert_eq!(stop.status, 200);
    assert_eq!(show(&r, room).await["airFullscreen"], "halftime");
}

/// The ingest batches of the embedded test round (three recorded rounds).
fn recorded_batches() -> Vec<Value> {
    let all: Value = serde_json::from_str(include_str!("../test-round.json")).unwrap();
    all["steps"].as_array().unwrap().iter().filter(|s| s["kind"] == "ingest").map(|s| s["body"].clone()).collect()
}

fn summary(state: &Value) -> Value {
    let players: Vec<String> = state["players"].as_array().unwrap().iter().flat_map(|t| t.as_array().unwrap().iter().map(|p| format!("{}|{}|{}", p["name"], p["k"], p["d"]))).collect();
    json!({ "score": [state["teams"][0]["score"], state["teams"][1]["score"]], "rounds": state["rounds"].as_array().map_or(0, |r| r.len()), "players": players })
}

fn logged_events(data: &std::path::Path, code: &str) -> Vec<String> {
    std::fs::read_to_string(data.join(format!("{code}.ndjson"))).unwrap_or_default().lines()
        .filter_map(|l| serde_json::from_str::<Value>(l).ok())
        .filter_map(|l| l["event"]["type"].as_str().map(|t| if t == "round.won" { format!("round.won#{}", l["event"]["round"]) } else { t.to_string() }))
        .filter(|t| t != "round.phase")
        .collect()
}

#[tokio::test]
async fn an_engine_restart_mid_match_continues_the_match() {
    let batches = recorded_batches();
    let (first, second) = batches.split_at(14);
    // Control: the whole recording without interruption.
    let control_dir = temp_dir();
    let control = engine(control_dir.clone()).await;
    for b in &batches { request(&control, "POST", "/api/RC/ingest/valorant", Some(b), true).await; }
    let control_end = summary(&show(&control, "RC").await);
    let control_events = logged_events(&control_dir, "RC");

    // Same recording, with the engine stopped and started again in the middle of round 2.
    let dir = temp_dir();
    let a = engine(dir.clone()).await;
    for b in first { request(&a, "POST", "/api/RC/ingest/valorant", Some(b), true).await; }
    tokio::time::sleep(Duration::from_millis(700)).await; // the saver writes every 300 ms
    a.task.abort();
    let b = engine(dir.clone()).await;
    for m in second { request(&b, "POST", "/api/RC/ingest/valorant", Some(m), true).await; }
    assert_eq!(summary(&show(&b, "RC").await), control_end, "same score, same round history, players in the same places");
    assert_eq!(logged_events(&dir, "RC"), control_events, "no round win lost, nothing doubled");
}

#[tokio::test]
async fn credits_after_a_data_gap_are_a_baseline_not_a_spike_plant() {
    let board = |money: u32| json!([
        { "info": { "match_info": { "round_phase": "combat" } }, "feature": "match_info" },
        { "feature": "match_info", "key": "scoreboard_0", "data": json!({ "player_id": "p0", "name": "A #1", "character": "Clay", "team": 0, "alive": true, "money": money }).to_string() },
    ]);
    for (code, gap_ms, expect_plant) in [("GAPLONG", 20_000, false), ("GAPSHORT", 2_000, true)] {
        let data = temp_dir();
        let r = engine(data.clone()).await;
        request(&r, "POST", &format!("/api/{code}/ingest/valorant?ageMs={gap_ms}"), Some(&board(3900)), true).await;
        request(&r, "POST", &format!("/api/{code}/ingest/valorant"), Some(&board(4200)), true).await;
        let planted = logged_events(&data, code).iter().any(|e| e == "spike.planted");
        assert_eq!(planted, expect_plant, "{code}: a +300 after a {gap_ms} ms gap");
    }
}
