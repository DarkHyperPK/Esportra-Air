//! HTTP API, static overlays and the control API.
//!
//! Routes match `esportra-valorant-hud/server/server.js`:
//!   GET/PUT/PATCH /api/<match>                state (PATCH = JSON merge patch; PUT ?preset=clean)
//!   POST /api/<match>/event                   one-shot event to every overlay
//!   POST /api/<match>/ingest/valorant         raw GEP messages → state (?ageMs=, ?recovered=1)
//!   POST /api/<match>/config                  selected match context from Air
//!   POST /api/<match>/map-result              operator map correction
//!   POST /api/<match>/pause-panel             technical pause / timeout panel
//!   GET/POST /api/<match>/display-fixes       on-air corrections
//!   GET /health, GET /o/<output>, GET /air-assets/<uuid>, static files under the HUD root
//! New for the separate engine process (write key required):
//!   GET /control/status, PUT /control/outputs, PUT /control/assets/<uuid>, POST /control/shutdown

use std::path::{Component, PathBuf};

use axum::body::{to_bytes, Body, Bytes};
use axum::extract::{Request, State};
use axum::http::{header, HeaderMap, HeaderValue, Method, StatusCode};
use axum::response::{IntoResponse, Response};
use serde_json::{json, Value};

use crate::engine::{now_ms, Engine};
use crate::AppState;

const MAX_BODY: usize = 2_000_000;
// Pictures (your own graphics are full 1920×1080 PNGs, up to 16 MB: even an uncompressed
// Photoshop export is about 8.3 MB) and fonts for their data boxes.
const MAX_ASSET: usize = 16_500_000;

fn content_type(path: &str) -> &'static str {
    match path.rsplit('.').next().unwrap_or("") {
        "html" => "text/html; charset=utf-8",
        "js" => "text/javascript",
        "css" => "text/css",
        "png" => "image/png",
        "ttf" => "font/ttf",
        "json" => "application/json",
        "webm" => "video/webm",
        "mov" => "video/quicktime",
        "jpg" => "image/jpeg",
        "svg" => "image/svg+xml",
        "webp" => "image/webp",
        "woff2" => "font/woff2",
        _ => "application/octet-stream",
    }
}

pub fn send(code: StatusCode, body: Value) -> Response {
    let mut res = (code, body.to_string()).into_response();
    let h = res.headers_mut();
    h.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("application/json"),
    );
    h.insert(
        header::ACCESS_CONTROL_ALLOW_ORIGIN,
        HeaderValue::from_static("*"),
    );
    res
}

fn status(code: StatusCode) -> Response {
    code.into_response()
}

fn error(code: StatusCode, message: &str) -> Response {
    send(code, json!({ "error": message }))
}

fn query(uri: &axum::http::Uri) -> Vec<(String, String)> {
    uri.query()
        .unwrap_or("")
        .split('&')
        .filter(|p| !p.is_empty())
        .map(|pair| {
            let (k, v) = pair.split_once('=').unwrap_or((pair, ""));
            (
                percent_decode(&k.replace('+', " ")),
                percent_decode(&v.replace('+', " ")),
            )
        })
        .collect()
}

pub fn query_get(q: &[(String, String)], key: &str) -> Option<String> {
    q.iter().find(|(k, _)| k == key).map(|(_, v)| v.clone())
}

pub fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Some(b) = s
                .get(i + 1..i + 3)
                .and_then(|h| u8::from_str_radix(h, 16).ok())
            {
                out.push(b);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn key_from(headers: &HeaderMap, q: &[(String, String)]) -> Option<String> {
    headers
        .get("x-esportra-key")
        .and_then(|v| v.to_str().ok())
        .map(str::to_string)
        .or_else(|| query_get(q, "key"))
}

async fn json_body(body: Body) -> Result<Value, Response> {
    let bytes = to_bytes(body, MAX_BODY)
        .await
        .map_err(|_| error(StatusCode::PAYLOAD_TOO_LARGE, "Request body is too large."))?;
    if bytes.is_empty() {
        return Ok(json!({}));
    }
    serde_json::from_slice(&bytes).map_err(|e| {
        error(
            StatusCode::BAD_REQUEST,
            &format!("Request body must be valid JSON: {e}"),
        )
    })
}

/// Resolves a request path under the HUD root, refusing anything outside it or under `server/`.
fn static_path(root: &std::path::Path, url_path: &str) -> Option<PathBuf> {
    let decoded = percent_decode(if url_path == "/" {
        "/control.html"
    } else {
        url_path
    });
    let mut parts: Vec<String> = Vec::new();
    for part in decoded.split(['/', '\\']) {
        match part {
            "" | "." => {}
            ".." => {
                parts.pop()?;
            }
            p => parts.push(p.to_string()),
        }
    }
    if parts
        .first()
        .is_some_and(|p| p.eq_ignore_ascii_case("server"))
        || parts.iter().any(|p| p.contains(':') || p.contains('\0'))
    {
        return None;
    }
    let mut path = root.to_path_buf();
    for p in &parts {
        path.push(p);
    }
    path.components()
        .all(|c| !matches!(c, Component::ParentDir))
        .then_some(path)
}

pub async fn handle(State(app): State<AppState>, req: Request) -> Response {
    let (parts, body) = req.into_parts();
    let path = parts.uri.path().to_string();
    let q = query(&parts.uri);
    let segments: Vec<&str> = path.split('/').filter(|s| !s.is_empty()).collect();
    let engine = &app.engine;
    if parts.method == Method::OPTIONS {
        let mut res = status(StatusCode::NO_CONTENT);
        let h = res.headers_mut();
        h.insert(
            header::ACCESS_CONTROL_ALLOW_ORIGIN,
            HeaderValue::from_static("*"),
        );
        h.insert(
            header::ACCESS_CONTROL_ALLOW_METHODS,
            HeaderValue::from_static("GET,PUT,PATCH,POST"),
        );
        h.insert(
            header::ACCESS_CONTROL_ALLOW_HEADERS,
            HeaderValue::from_static("Content-Type,X-Esportra-Key"),
        );
        return res;
    }
    match segments.first().copied() {
        Some("api") => api(engine, &parts.method, &segments, &q, &parts.headers, body).await,
        Some("control") => control(&app, &parts.method, &segments, &q, &parts.headers, body).await,
        Some("health") => {
            let rooms: Vec<Value> = engine.rooms().iter().map(|r| json!({ "match": r.code, "v": r.lock().v, "clients": r.viewers.load(std::sync::atomic::Ordering::Relaxed) })).collect();
            send(
                StatusCode::OK,
                json!({ "ok": true, "engine": "air-engine", "version": env!("CARGO_PKG_VERSION"), "rooms": rooms }),
            )
        }
        Some("air-assets") => asset(engine, &parts.method, &segments).await,
        Some("art") => art(engine, &parts.method, &segments).await,
        Some("o") => output_page(engine, &segments).await,
        _ => static_file(engine, &path).await,
    }
}

/// Where the catalogue's agent, weapon and map pictures come from. Air downloads them once into
/// `<data>/art/`; the engine serves them from there and points the catalogue at `/art/`.
pub const ART_ORIGIN: &str = "https://media.valorant-api.com/";

/// `art/<kind>/<uuid>/<name>.png` or `art/agents/<uuid>/abilities/<slot>/<name>.png`, the only
/// shapes a downloaded picture may have.
pub fn art_path(segments: &[&str]) -> Option<PathBuf> {
    let (kind, id, slot, file) = match segments {
        [_, kind, id, file] => (*kind, *id, None, *file),
        [_, "agents", id, "abilities", slot, file] => ("agents", *id, Some(*slot), *file),
        _ => return None,
    };
    let name = file.strip_suffix(".png")?;
    let slot_ok = slot.is_none_or(|s| {
        !s.is_empty() && s.len() <= 16 && s.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit())
    });
    let ok = slot_ok
        && ["agents", "weapons", "maps", "gear"].contains(&kind)
        && id.len() == 36
        && uuid::Uuid::parse_str(id).is_ok()
        && id.bytes().all(|b| b.is_ascii_hexdigit() || b == b'-')
        && !name.is_empty()
        && name.len() <= 32
        && name.bytes().all(|b| b.is_ascii_lowercase());
    ok.then(|| {
        let base = PathBuf::from(kind).join(id.to_ascii_lowercase());
        match slot {
            Some(s) => base.join("abilities").join(s).join(file),
            None => base.join(file),
        }
    })
}

async fn art(engine: &Engine, method: &Method, segments: &[&str]) -> Response {
    let Some(rel) = art_path(segments).filter(|_| method == Method::GET) else {
        return status(StatusCode::NOT_FOUND);
    };
    match tokio::fs::read(engine.data.join("art").join(rel)).await {
        Ok(bytes) => {
            let mut res = Body::from(bytes).into_response();
            let h = res.headers_mut();
            h.insert(header::CONTENT_TYPE, HeaderValue::from_static("image/png"));
            h.insert(
                header::CACHE_CONTROL,
                HeaderValue::from_static("private, max-age=86400"),
            );
            h.insert(
                "x-content-type-options",
                HeaderValue::from_static("nosniff"),
            );
            res
        }
        Err(_) => status(StatusCode::NOT_FOUND),
    }
}

/// What an uploaded asset is, from its first bytes: a PNG picture or a font. Anything else is refused.
fn asset_kind(bytes: &[u8]) -> Option<(&'static str, &'static str)> {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        Some(("png", "image/png"))
    } else if bytes.starts_with(b"wOF2") {
        Some(("woff2", "font/woff2"))
    } else if bytes.starts_with(b"wOFF") {
        Some(("woff", "font/woff"))
    } else if bytes.starts_with(&[0, 1, 0, 0]) {
        Some(("ttf", "font/ttf"))
    } else if bytes.starts_with(b"OTTO") {
        Some(("otf", "font/otf"))
    } else {
        None
    }
}

const ASSET_TYPES: [(&str, &str); 5] = [("png", "image/png"), ("woff2", "font/woff2"), ("woff", "font/woff"), ("ttf", "font/ttf"), ("otf", "font/otf")];

async fn asset(engine: &Engine, method: &Method, segments: &[&str]) -> Response {
    let valid = segments.len() == 2
        && uuid::Uuid::parse_str(segments[1]).is_ok()
        && segments[1].len() == 36;
    if method != Method::GET || !valid {
        return status(StatusCode::NOT_FOUND);
    }
    let id = segments[1].to_lowercase();
    let dir = engine.data.join("assets");
    let mut found = None;
    for (ext, mime) in ASSET_TYPES {
        if let Ok(bytes) = tokio::fs::read(dir.join(format!("{id}.{ext}"))).await {
            found = Some((bytes, mime));
            break;
        }
    }
    match found {
        Some((bytes, mime)) => {
            let mut res = Body::from(bytes).into_response();
            let h = res.headers_mut();
            h.insert(header::CONTENT_TYPE, HeaderValue::from_static(mime));
            h.insert(
                header::CACHE_CONTROL,
                HeaderValue::from_static("private, max-age=3600"),
            );
            h.insert(
                "x-content-type-options",
                HeaderValue::from_static("nosniff"),
            );
            res
        }
        None => status(StatusCode::NOT_FOUND),
    }
}

async fn output_page(engine: &Engine, segments: &[&str]) -> Response {
    let Some(output) = (segments.len() == 2)
        .then(|| engine.resolve_output(segments[1]))
        .flatten()
    else {
        return (StatusCode::NOT_FOUND, "Output not found").into_response();
    };
    match tokio::fs::read_to_string(
        engine
            .root
            .join("overlays")
            .join(format!("{}.html", output.overlay)),
    )
    .await
    {
        Ok(html) => {
            let lower = html.to_ascii_lowercase();
            let html = match lower.find("<head>") {
                Some(i) => format!(
                    "{}<head><base href=\"/overlays/\">{}",
                    &html[..i],
                    &html[i + 6..]
                ),
                None => html,
            };
            let mut res = html.into_response();
            let h = res.headers_mut();
            h.insert(
                header::CONTENT_TYPE,
                HeaderValue::from_static("text/html; charset=utf-8"),
            );
            h.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-cache"));
            res
        }
        Err(_) => (StatusCode::NOT_FOUND, "Overlay not found").into_response(),
    }
}

async fn static_file(engine: &Engine, path: &str) -> Response {
    let Some(file) = static_path(&engine.root, path) else {
        return status(StatusCode::FORBIDDEN);
    };
    match tokio::fs::read(&file).await {
        Ok(mut bytes) => {
            // The catalogue names remote art; overlays load the copies on this PC instead.
            if file.ends_with(std::path::Path::new("core").join("catalog.js")) {
                bytes = String::from_utf8_lossy(&bytes)
                    .replace(ART_ORIGIN, "/art/")
                    .into_bytes();
            }
            let mut res = Body::from(bytes).into_response();
            let h = res.headers_mut();
            h.insert(
                header::CONTENT_TYPE,
                HeaderValue::from_static(content_type(&file.to_string_lossy())),
            );
            h.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-cache"));
            res
        }
        Err(_) => (StatusCode::NOT_FOUND, "Not found").into_response(),
    }
}

fn is_obj(v: &Value) -> bool {
    v.is_object()
}

async fn api(
    engine: &Engine,
    method: &Method,
    segments: &[&str],
    q: &[(String, String)],
    headers: &HeaderMap,
    body: Body,
) -> Response {
    let room = engine.room(segments.get(1).copied());
    if *method == Method::GET && segments.len() == 2 {
        let inner = room.lock();
        return send(
            StatusCode::OK,
            json!({ "match": room.code, "v": inner.v, "state": inner.fixes.view(&inner.state) }),
        );
    }
    if !engine.can_write(key_from(headers, q).as_deref()) {
        return error(
            StatusCode::UNAUTHORIZED,
            "Missing or wrong X-Esportra-Key header.",
        );
    }
    let sub = segments.get(2).copied();
    if *method == Method::GET && sub == Some("display-fixes") {
        let inner = room.lock();
        return send(StatusCode::OK, inner.fixes.status(&inner.state));
    }
    let input = match json_body(body).await {
        Ok(v) => v,
        Err(res) => return res,
    };
    match (method.as_str(), segments.len(), sub) {
        ("POST", _, Some("pause-panel")) => pause_panel(&room, &input),
        ("POST", _, Some("display-fixes")) => match room.change_fix(&input) {
            Ok(action) => {
                let inner = room.lock();
                let mut out = inner.fixes.status(&inner.state);
                out["action"] = action;
                send(StatusCode::OK, out)
            }
            Err(e) => error(StatusCode::BAD_REQUEST, &e.0),
        },
        ("POST", _, Some("config")) => config(engine, &room, &input),
        ("POST", _, Some("map-result")) => map_result(&room, &input),
        ("PUT", 2, None) => {
            let base = if query_get(q, "preset").as_deref() == Some("clean") {
                &engine.defaults.clean
            } else {
                &engine.defaults.default
            };
            let mut inner = room.lock();
            let v = room
                .apply(
                    &mut inner,
                    air_state::merge(base.clone(), &input),
                    "api:put",
                )
                .unwrap_or(inner.v);
            send(StatusCode::OK, json!({ "v": v }))
        }
        ("PATCH", 2, None) => {
            let mut inner = room.lock();
            let next = air_state::merge(inner.state.clone(), &input);
            let v = room.apply(&mut inner, next, "api:patch").unwrap_or(inner.v);
            send(StatusCode::OK, json!({ "v": v }))
        }
        ("POST", _, Some("event")) => send(StatusCode::OK, room.event(&input, "api")),
        ("POST", _, Some("ingest")) if segments.get(3) == Some(&"valorant") => {
            let age = match query_get(q, "ageMs") {
                None => 0.0,
                Some(a) => air_state::js::string_to_number(&a),
            };
            if !age.is_finite() || !(0.0..=60_000.0).contains(&age) {
                return error(StatusCode::BAD_REQUEST, "Invalid buffered packet age.");
            }
            let messages = match input {
                Value::Array(list) => list,
                other => vec![other],
            };
            let (v, events) = room.ingest(&messages, age);
            send(StatusCode::OK, json!({ "v": v, "events": events }))
        }
        _ => error(StatusCode::NOT_FOUND, "Unknown API route."),
    }
}

fn pause_panel(room: &crate::engine::Room, input: &Value) -> Response {
    let mut inner = room.lock();
    if input.get("action").and_then(Value::as_str) == Some("clear") {
        if inner.state.get("airPause").and_then(|p| p.get("id")) == input.get("id")
            && inner.state.get("airPause").is_some()
        {
            let mut next = inner.state.clone();
            next.as_object_mut().map(|m| m.shift_remove("airPause"));
            room.apply(&mut inner, next, "air:pause-clear");
        }
        return send(StatusCode::OK, json!({ "v": inner.v }));
    }
    let panel = input.get("panel");
    let valid = input.get("action").and_then(Value::as_str) == Some("show")
        && panel.is_some_and(|p| {
            matches!(
                p.get("kind").and_then(Value::as_str),
                Some("technical" | "timeout")
            ) && p.get("id").and_then(Value::as_str).is_some_and(|id| {
                id.len() == 36 && id.bytes().all(|b| b.is_ascii_hexdigit() || b == b'-')
            }) && p
                .get("startedAt")
                .and_then(Value::as_f64)
                .is_some_and(|t| t.is_finite() && (t - now_ms()).abs() <= 10_000.0)
        });
    if !valid {
        return error(StatusCode::BAD_REQUEST, "Invalid pause panel.");
    }
    let panel = panel.expect("checked");
    let context = inner.state.get("airContext").cloned();
    let scope = panel.get("scope");
    let same = |k: &str| scope.and_then(|s| s.get(k)) == context.as_ref().and_then(|c| c.get(k));
    if !same("showId") || !same("matchId") {
        return error(StatusCode::CONFLICT, "Match context changed.");
    }
    let mut next = inner.state.clone();
    next["airPause"] =
        json!({ "id": panel["id"], "kind": panel["kind"], "startedAt": panel["startedAt"] });
    let v = room
        .apply(&mut inner, next, "air:pause-show")
        .unwrap_or(inner.v);
    send(StatusCode::OK, json!({ "v": v }))
}

fn config(engine: &Engine, room: &crate::engine::Room, patch: &Value) -> Response {
    if !is_obj(patch) || !patch.get("airContext").is_some_and(is_obj) {
        return error(StatusCode::BAD_REQUEST, "Show context required.");
    }
    let mut inner = room.lock();
    let current = inner
        .state
        .get("airContext")
        .filter(|c| air_state::js::truthy(Some(c)))
        .cloned();
    // Same test as the JS (`JSON.stringify` comparison, key order included).
    let text = |v: &Value| serde_json::to_string(v).unwrap_or_default();
    let changed = current
        .as_ref()
        .is_some_and(|c| text(c) != text(&patch["airContext"]));
    let sync = patch.get("sync") == Some(&Value::Bool(true));
    if sync && (current.is_none() || changed) {
        return error(
            StatusCode::CONFLICT,
            "Match context changed. Sync cannot replace the selected match.",
        );
    }
    let mut next = if changed {
        engine.defaults.clean.clone()
    } else {
        inner.state.clone()
    };
    next["airContext"] = patch["airContext"].clone();
    for key in ["event", "layout"] {
        if let Some(v) = patch.get(key).filter(|v| is_obj(v)) {
            next[key] = air_state::merge(next.get(key).cloned().unwrap_or_else(|| json!({})), v);
        }
    }
    if let Some(bug) = patch
        .get("show")
        .and_then(|s| s.get("eventBug"))
        .filter(|b| b.is_boolean())
    {
        if let Some(show) = next.get_mut("show").and_then(Value::as_object_mut) {
            show.insert("eventBug".into(), bug.clone());
        }
    }
    if let Some(Value::Array(teams)) = patch
        .get("teams")
        .filter(|t| t.as_array().is_some_and(|t| t.len() == 2))
    {
        let reset_series = current.is_none() || changed || sync;
        let merged: Vec<Value> = teams
            .iter()
            .enumerate()
            .map(|(i, team)| {
                let mut out = next
                    .get("teams")
                    .and_then(|t| t.get(i))
                    .and_then(Value::as_object)
                    .cloned()
                    .unwrap_or_default();
                for field in ["name", "tag", "color", "logo"] {
                    if let Some(v) = team.get(field).filter(|v| v.is_string()) {
                        out.insert(field.into(), v.clone());
                    }
                }
                if reset_series {
                    let series = team
                        .get("series")
                        .filter(|s| air_state::js::truthy(Some(s)))
                        .cloned()
                        .unwrap_or(json!(0));
                    out.insert("series".into(), series);
                }
                Value::Object(out)
            })
            .collect();
        next["teams"] = Value::Array(merged);
    }
    for field in [
        "casters",
        "sponsors",
        "veto",
        "mapPool",
        "schedule",
        "registeredRoster",
    ] {
        if let Some(v) = patch.get(field).filter(|v| v.is_array()) {
            next[field] = v.clone();
        }
    }
    let v = room
        .apply(&mut inner, next, "air:config")
        .unwrap_or(inner.v);
    send(StatusCode::OK, json!({ "v": v }))
}

fn map_result(room: &crate::engine::Room, input: &Value) -> Response {
    {
        let inner = room.lock();
        if let Some(ctx) = input
            .get("airContext")
            .filter(|c| air_state::js::truthy(Some(c)))
        {
            let current = inner.state.get("airContext");
            let field = |c: Option<&Value>, k: &str| c.and_then(|c| c.get(k)).cloned();
            if field(Some(ctx), "showId") != field(current, "showId")
                || field(Some(ctx), "matchId") != field(current, "matchId")
            {
                return error(StatusCode::CONFLICT, "Match context changed.");
            }
        }
    }
    let int = |v: Option<&Value>, min: f64, max: f64| {
        v.and_then(Value::as_f64)
            .is_some_and(|n| n == n.trunc() && n >= min && n <= max)
    };
    let (map_index, a, b) = (
        input.get("mapIndex"),
        input.get("teamAScore"),
        input.get("teamBScore"),
    );
    if !int(map_index, 1.0, 9.0) || !int(a, 0.0, 2_147_483_647.0) || !int(b, 0.0, 2_147_483_647.0) {
        return error(StatusCode::BAD_REQUEST, "Invalid map result.");
    }
    let reason = input
        .get("reason")
        .and_then(Value::as_str)
        .map(air_state::js::trim)
        .filter(|r| !r.is_empty())
        .unwrap_or("Operator map correction");
    let fix = json!({
        "action": "set", "field": "map_result", "until": "next_round", "reason": reason,
        "value": [{ "mapIndex": map_index, "score": a }, { "mapIndex": map_index, "score": b }],
    });
    match room.change_fix(&fix) {
        Ok(_) => {
            let inner = room.lock();
            send(
                StatusCode::OK,
                json!({ "v": inner.v, "patch": { "series": inner.fixes.view(&inner.state)["series"] } }),
            )
        }
        Err(e) => error(StatusCode::BAD_REQUEST, &e.0),
    }
}

async fn control(
    app: &AppState,
    method: &Method,
    segments: &[&str],
    q: &[(String, String)],
    headers: &HeaderMap,
    body: Body,
) -> Response {
    let engine = &app.engine;
    if !engine.can_write(key_from(headers, q).as_deref()) {
        return error(
            StatusCode::UNAUTHORIZED,
            "Missing or wrong X-Esportra-Key header.",
        );
    }
    match (method.as_str(), segments.get(1).copied()) {
        ("GET", Some("status")) => send(StatusCode::OK, control_status(engine)),
        ("GET", Some("join")) => send(StatusCode::OK, engine.join.status()),
        ("PUT", Some("join")) => {
            let input = match json_body(body).await {
                Ok(v) => v,
                Err(res) => return res,
            };
            match crate::join::configure(&app.engine, &input).await {
                Ok(status) => send(StatusCode::OK, status),
                Err(e) => error(StatusCode::BAD_REQUEST, &e),
            }
        }
        ("PUT", Some("outputs")) => {
            let input = match json_body(body).await {
                Ok(v) => v,
                Err(res) => return res,
            };
            match engine.set_outputs(&input) {
                Ok(count) => send(StatusCode::OK, json!({ "outputs": count })),
                Err(e) => error(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    &format!("Outputs could not be saved: {e}"),
                ),
            }
        }
        ("PUT", Some("assets"))
            if segments.len() == 3
                && uuid::Uuid::parse_str(segments[2]).is_ok()
                && segments[2].len() == 36 =>
        {
            let bytes: Bytes = match to_bytes(body, MAX_ASSET).await {
                Ok(b) => b,
                Err(_) => return error(StatusCode::PAYLOAD_TOO_LARGE, "Image is too large."),
            };
            let Some((ext, _)) = asset_kind(&bytes) else {
                return error(StatusCode::BAD_REQUEST, "Assets must be PNG images or fonts (WOFF2, WOFF, TTF, OTF).");
            };
            match tokio::fs::write(
                engine
                    .data
                    .join("assets")
                    .join(format!("{}.{ext}", segments[2].to_lowercase())),
                &bytes,
            )
            .await
            {
                Ok(()) => send(StatusCode::OK, json!({ "stored": true })),
                Err(e) => error(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    &format!("Asset could not be saved: {e}"),
                ),
            }
        }
        ("POST", Some("action")) => {
            let input = match json_body(body).await {
                Ok(v) => v,
                Err(res) => return res,
            };
            let room = engine.room(input.get("match").and_then(Value::as_str));
            let name = input.get("name").and_then(Value::as_str).unwrap_or("");
            match crate::actions::run(&room, name, input.get("args").unwrap_or(&Value::Null)) {
                Ok(v) => send(StatusCode::OK, json!({ "v": v })),
                Err(message) => error(StatusCode::BAD_REQUEST, &message),
            }
        }
        ("POST", Some("test-round")) => {
            let input = match json_body(body).await {
                Ok(v) => v,
                Err(res) => return res,
            };
            let room = engine.room(input.get("match").and_then(Value::as_str));
            match input.get("action").and_then(Value::as_str) {
                Some(action @ ("start" | "seek")) => {
                    let duration = crate::engine::test_round_script()
                        .last()
                        .map_or(0.0, |s| s.at);
                    let speed = input
                        .get("speed")
                        .and_then(Value::as_f64)
                        .unwrap_or(1.0)
                        .clamp(0.25, 8.0);
                    let from = input
                        .get("from")
                        .and_then(Value::as_f64)
                        .unwrap_or(0.0)
                        .clamp(0.0, duration);
                    if action == "seek" {
                        room.stop_test(None);
                    }
                    match Engine::play_test_round(room.clone(), speed, from) {
                        Ok(()) => send(StatusCode::OK, room.test_status()),
                        Err(e) => error(StatusCode::CONFLICT, e),
                    }
                }
                Some("stop") => {
                    room.stop_test(None);
                    send(StatusCode::OK, room.test_status())
                }
                _ => error(StatusCode::BAD_REQUEST, "Choose start, seek or stop."),
            }
        }
        ("POST", Some("shutdown")) => {
            let _ = app.shutdown.send(true);
            send(StatusCode::OK, json!({ "stopping": true }))
        }
        _ => error(StatusCode::NOT_FOUND, "Unknown control route."),
    }
}

fn control_status(engine: &Engine) -> Value {
    let now = now_ms();
    let frames = engine.frames.lock().unwrap_or_else(|p| p.into_inner());
    let mut outputs: std::collections::BTreeMap<String, (u64, Option<f64>)> = Default::default();
    for (output, last) in frames.values() {
        let entry = outputs.entry(output.clone()).or_insert((0, None));
        entry.0 += 1;
        entry.1 = match (entry.1, *last) {
            (Some(a), Some(b)) => Some(a.max(b)),
            (a, b) => a.or(b),
        };
    }
    let rooms: Vec<Value> = engine
        .rooms()
        .iter()
        .map(|room| {
            let inner = room.lock();
            let room_status = json!({
                "match": room.code, "v": inner.v, "clients": room.viewers.load(std::sync::atomic::Ordering::Relaxed),
                "lastGepAt": inner.last_gep_at, "lastFeedAt": inner.last_feed_at,
                "feedAgeMs": inner.last_feed_at.map(|at| (now - at).max(0.0)),
                "feedPaused": inner.state.get("airDiagnostics").and_then(|d| d.get("feedPaused")).cloned().unwrap_or(json!(false)),
                "fixes": inner.fixes.entries().keys().collect::<Vec<_>>(),
                "storageWarning": inner.fixes.storage_warning,
            });
            drop(inner);
            let mut room_status = room_status;
            room_status["testRound"] = room.test_status();
            room_status["cams"] = engine.cam_status(&room.code);
            room_status
        })
        .collect();
    let outputs: Vec<Value> = outputs
        .into_iter()
        .map(|(id, (count, last))| json!({ "id": id, "connections": count, "lastFrameAt": last }))
        .collect();
    json!({
        "engine": "air-engine", "version": env!("CARGO_PKG_VERSION"), "pid": std::process::id(),
        "startedAt": engine.started_at, "now": now, "rooms": rooms, "outputs": outputs,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn art_paths_are_only_catalogue_pictures() {
        let id = "41fb69c1-4189-7b37-f117-bcaf1e96f1bf";
        assert_eq!(
            art_path(&["art", "agents", id, "displayicon.png"]),
            Some(PathBuf::from("agents").join(id).join("displayicon.png"))
        );
        assert_eq!(
            art_path(&["art", "agents", id, "abilities", "ultimate", "displayicon.png"]),
            Some(PathBuf::from("agents").join(id).join("abilities").join("ultimate").join("displayicon.png"))
        );
        for bad in [
            vec!["art", "agents", id, "../x.png"],
            vec!["art", "secrets", id, "displayicon.png"],
            vec!["art", "agents", "not-a-uuid", "displayicon.png"],
            vec!["art", "agents", id, "displayicon.svg"],
            vec!["art", "agents", id, "Display.png"],
            vec!["art", "agents", id],
            vec!["art", "agents", id, "a", "b.png"],
            vec!["art", "maps", id, "abilities", "ultimate", "displayicon.png"],
            vec!["art", "agents", id, "abilities", "..", "displayicon.png"],
        ] {
            assert_eq!(art_path(&bad), None, "{bad:?}");
        }
    }

    #[test]
    fn static_paths_stay_inside_the_root() {
        let root = Path::new("/hud");
        assert_eq!(
            static_path(root, "/"),
            Some(PathBuf::from("/hud/control.html"))
        );
        assert_eq!(
            static_path(root, "/overlays/ingame.html"),
            Some(PathBuf::from("/hud/overlays/ingame.html"))
        );
        assert_eq!(
            static_path(root, "/a/../overlays/x.html"),
            Some(PathBuf::from("/hud/overlays/x.html"))
        );
        assert_eq!(static_path(root, "/../etc/passwd"), None);
        assert_eq!(static_path(root, "/%2e%2e/etc/passwd"), None);
        assert_eq!(static_path(root, "/server/server.js"), None);
        assert_eq!(static_path(root, "/x/../Server/data/MAIN.json"), None);
        assert_eq!(static_path(root, "/..%5c..%5cwindows"), None);
        assert_eq!(static_path(root, "/C:/windows"), None);
    }

    #[test]
    fn percent_decoding() {
        assert_eq!(percent_decode("a%20b"), "a b");
        assert_eq!(percent_decode("%zz"), "%zz");
        assert_eq!(percent_decode("100%"), "100%");
    }
}
