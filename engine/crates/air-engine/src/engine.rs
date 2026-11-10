//! Match rooms: one shared state per match, versioned merge patches to every client, persistence.
//!
//! Mirrors `room`, `apply`, `event` and `changeDisplayFix` in `esportra-valorant-hud/server/server.js`.

use std::collections::HashMap;
use std::fs::{self, OpenOptions};
use std::io::Write as _;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{SystemTime, UNIX_EPOCH};

use air_state::{diff, merge};
use air_valorant::ValorantAdapter;
use serde_json::{json, Map, Value};
use tokio::sync::{broadcast, watch};

use crate::features::reported_features;
use crate::fixes::{DisplayFixes, FixError, FixStore};

/// A live round with no game data for this long shows "feed paused" on the HUD.
pub const FEED_STALE_MS: f64 = 10_000.0;
const MAX_FIXES_FILE: u64 = 131_072;

pub fn now_ms() -> f64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as f64)
        .unwrap_or(0.0)
}

/// `String(code || 'MAIN').toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 32) || 'MAIN'`
pub fn room_code(code: Option<&str>) -> String {
    let raw = code
        .filter(|c| !c.is_empty())
        .unwrap_or("MAIN")
        .to_uppercase();
    let clean: String = raw
        .chars()
        .filter(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || *c == '_' || *c == '-')
        .take(32)
        .collect();
    if clean.is_empty() {
        "MAIN".into()
    } else {
        clean
    }
}

/// The HUD's default (demo) and clean starting states, exported from `core/state.*.js`.
pub struct Defaults {
    pub default: Value,
    pub clean: Value,
}

impl Defaults {
    pub fn embedded() -> Self {
        let all: Value = serde_json::from_str(include_str!("../defaults.json"))
            .expect("embedded defaults are JSON");
        Self {
            default: all["default"].clone(),
            clean: all["clean"].clone(),
        }
    }
}

/// A stable output alias (`/o/<id>`): which overlay it shows and which match it follows.
#[derive(Clone, Debug, PartialEq)]
pub struct Output {
    pub overlay: String,
    pub match_code: String,
}

pub struct Room {
    pub code: String,
    pub ephemeral: bool,
    pub tx: broadcast::Sender<Arc<str>>,
    inner: Mutex<RoomInner>,
    file: PathBuf,
    fixes_file: PathBuf,
    log: PathBuf,
}

pub struct RoomInner {
    pub v: u64,
    pub state: Value,
    pub fixes: DisplayFixes,
    adapter: ValorantAdapter,
    pub last_gep_at: Option<f64>,
    /// Last capture time of observer data (not player-PC heartbeats), for feed freshness.
    pub last_feed_at: Option<f64>,
    dirty: bool,
}

struct FileStore<'a>(&'a Path);

impl FixStore for FileStore<'_> {
    fn save(&self, data: &Value) -> std::io::Result<()> {
        let tmp = self.0.with_extension("json.tmp");
        fs::write(&tmp, serde_json::to_vec(data)?)?;
        fs::rename(tmp, self.0)
    }
}

struct NoStore;

impl FixStore for NoStore {
    fn save(&self, _: &Value) -> std::io::Result<()> {
        Ok(())
    }
}

/// `airPause` is live operator state; it is not persisted across restarts.
fn persistent_state(state: &Value) -> Value {
    let mut saved = state.clone();
    if let Value::Object(map) = &mut saved {
        map.shift_remove("airPause");
    }
    saved
}

impl Room {
    fn store(&self) -> Box<dyn FixStore + '_> {
        if self.ephemeral {
            Box::new(NoStore)
        } else {
            Box::new(FileStore(&self.fixes_file))
        }
    }

    pub fn lock(&self) -> MutexGuard<'_, RoomInner> {
        self.inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    /// `{ type: 'snapshot', v, state }` as overlays receive it.
    pub fn snapshot(&self) -> String {
        let inner = self.lock();
        json!({ "type": "snapshot", "v": inner.v, "state": inner.fixes.view(&inner.state) })
            .to_string()
    }

    fn append_log(&self, line: Value) {
        if self.ephemeral {
            return;
        }
        let result = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.log)
            .and_then(|mut f| writeln!(f, "{line}"));
        if let Err(e) = result {
            eprintln!("[engine] log for {} could not be written: {e}", self.code);
        }
    }

    fn publish(&self, message: Value) {
        // No subscribers is normal (no overlay open yet).
        let _ = self.tx.send(Arc::from(message.to_string()));
    }

    /// Replaces the state, broadcasting only what viewers will see change. Returns the new version,
    /// or `None` when nothing changed.
    pub fn apply(&self, inner: &mut RoomInner, next: Value, source: &str) -> Option<u64> {
        let before = inner.fixes.view(&inner.state);
        let patch = diff(&inner.state, &next);
        let capture = if source == "valorant-gep" {
            inner.last_gep_at
        } else {
            None
        };
        inner.fixes.sync(&next, capture, self.store().as_ref());
        let display_patch = diff(&before, &inner.fixes.view(&next));
        if patch.is_none() && display_patch.is_none() {
            return None;
        }
        inner.state = next;
        inner.v += 1;
        let v = inner.v;
        self.publish(
            json!({ "type": "patch", "v": v, "patch": display_patch.unwrap_or_else(|| json!({})) }),
        );
        if let Some(patch) = patch {
            self.append_log(json!({ "t": now_ms(), "v": v, "source": source, "patch": patch }));
            inner.dirty = true;
        }
        Some(v)
    }

    /// A one-shot event to every client (`{ type: 'event', event }`).
    pub fn event(&self, input: &Value, source: &str) -> Value {
        let t = now_ms();
        let suffix: String = uuid::Uuid::new_v4()
            .simple()
            .to_string()
            .chars()
            .take(4)
            .collect();
        let mut event = Map::new();
        event.insert(
            "id".into(),
            json!(format!("{}-{}-{}", self.code, t as i64, suffix)),
        );
        event.insert("t".into(), air_state::js::num(t));
        if let Value::Object(fields) = input {
            for (k, v) in fields {
                event.insert(k.clone(), v.clone());
            }
        }
        let event = Value::Object(event);
        self.publish(json!({ "type": "event", "event": event }));
        self.append_log(json!({ "t": event["t"], "source": source, "event": event }));
        event
    }

    /// Raw GEP messages captured `age_ms` ago → state, events and feed freshness.
    pub fn ingest(&self, messages: &[Value], age_ms: f64) -> (u64, usize) {
        let capture_at = now_ms() - age_ms;
        let mut inner = self.lock();
        let mut state = inner.state.clone();
        let mut events = Vec::new();
        for message in messages {
            let mut next = state.clone();
            match inner.adapter.ingest(&mut next, message, capture_at) {
                Ok(out) => {
                    state = next;
                    events.extend(out);
                }
                Err(e) => eprintln!("[engine] {}: game message skipped ({e})", self.code),
            }
        }
        if !messages.is_empty() {
            inner.last_gep_at = Some(capture_at);
        }
        let reported = reported_features(messages);
        if reported.iter().any(|f| *f != "playerCapture") || !events.is_empty() {
            inner.last_feed_at = Some(inner.last_feed_at.unwrap_or(0.0).max(capture_at));
        }
        let v = self
            .apply(&mut inner, state, "valorant-gep")
            .unwrap_or(inner.v);
        drop(inner);
        for e in &events {
            self.event(e, "valorant-gep");
        }
        (v, events.len())
    }

    /// Applies, clears or undoes an on-air correction and broadcasts the visible change.
    pub fn change_fix(&self, input: &Value) -> Result<Value, FixError> {
        let mut inner = self.lock();
        let inner = &mut *inner;
        let before = inner.fixes.view(&inner.state);
        let id = uuid::Uuid::new_v4().to_string();
        let action =
            inner
                .fixes
                .change(input, &inner.state, now_ms(), id, self.store().as_ref())?;
        let patch = diff(&before, &inner.fixes.view(&inner.state));
        inner.v += 1;
        self.publish(
            json!({ "type": "patch", "v": inner.v, "patch": patch.unwrap_or_else(|| json!({})) }),
        );
        self.append_log(json!({ "t": now_ms(), "v": inner.v, "source": "air:display-fix", "action": action.value }));
        Ok(action.value)
    }

    /// Sets `airDiagnostics.feedPaused` when game data was arriving and has stopped for `stale_ms`
    /// during a live round. Rooms that never received game data (manual or not yet capturing) are
    /// never tagged. The engine owns this, so the tag appears even if the Air window is gone.
    pub fn check_feed(&self, now: f64, stale_ms: f64) {
        if self.ephemeral {
            return;
        }
        let mut inner = self.lock();
        let phase = inner
            .state
            .get("round")
            .and_then(|r| r.get("phase"))
            .and_then(Value::as_str);
        let live = matches!(phase, Some("live" | "planted"));
        let stale = live && inner.last_feed_at.is_some_and(|at| now - at >= stale_ms);
        let shown = inner
            .state
            .get("airDiagnostics")
            .and_then(|d| d.get("feedPaused"))
            .and_then(Value::as_bool)
            .unwrap_or(false);
        if stale != shown {
            let next = merge(
                inner.state.clone(),
                &json!({ "airDiagnostics": { "feedPaused": stale } }),
            );
            self.apply(&mut inner, next, "air:feed");
        }
    }

    pub fn save_if_dirty(&self) {
        let mut inner = self.lock();
        if !inner.dirty || self.ephemeral {
            return;
        }
        inner.dirty = false;
        let data = persistent_state(&inner.state);
        drop(inner);
        if let Err(e) = write_atomic(&self.file, &data) {
            eprintln!("[engine] state for {} could not be saved: {e}", self.code);
        }
    }
}

fn write_atomic(path: &Path, data: &Value) -> std::io::Result<()> {
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, serde_json::to_vec(data)?)?;
    fs::rename(tmp, path)
}

pub struct Engine {
    pub root: PathBuf,
    pub data: PathBuf,
    key: String,
    pub defaults: Defaults,
    rooms: Mutex<HashMap<String, Arc<Room>>>,
    outputs: Mutex<HashMap<String, Output>>,
    pub outputs_changed: watch::Sender<u64>,
    /// Per output alias: connected overlay count and last rendered frame time.
    pub frames: Mutex<HashMap<u64, (String, Option<f64>)>>,
    pub started_at: f64,
    pub feed_stale_ms: f64,
}

impl Engine {
    pub fn new(root: PathBuf, data: PathBuf, key: String) -> std::io::Result<Self> {
        fs::create_dir_all(&data)?;
        fs::create_dir_all(data.join("assets"))?;
        let outputs = fs::read(data.join("outputs.json"))
            .ok()
            .and_then(|bytes| serde_json::from_slice::<Value>(&bytes).ok())
            .map(|v| parse_outputs(&v))
            .unwrap_or_default();
        Ok(Self {
            root,
            data,
            key,
            defaults: Defaults::embedded(),
            rooms: Mutex::new(HashMap::new()),
            outputs: Mutex::new(outputs),
            outputs_changed: watch::channel(0).0,
            frames: Mutex::new(HashMap::new()),
            started_at: now_ms(),
            feed_stale_ms: FEED_STALE_MS,
        })
    }

    /// Writes require the key given at startup (constant-time comparison).
    pub fn can_write(&self, provided: Option<&str>) -> bool {
        let Some(provided) = provided else {
            return false;
        };
        let (a, b) = (provided.as_bytes(), self.key.as_bytes());
        !b.is_empty()
            && a.len() == b.len()
            && a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
    }

    pub fn room(&self, code: Option<&str>) -> Arc<Room> {
        let code = room_code(code);
        let mut rooms = self.rooms.lock().unwrap_or_else(|p| p.into_inner());
        if let Some(room) = rooms.get(&code) {
            return room.clone();
        }
        let ephemeral = code.starts_with("__ESA_SIM_");
        let file = self.data.join(format!("{code}.json"));
        let fixes_file = self.data.join(format!("{code}.display-fixes.json"));
        let mut state = self.defaults.clean.clone();
        let mut saved_fixes = None;
        if !ephemeral {
            if let Some(saved) = fs::read(&file)
                .ok()
                .and_then(|b| serde_json::from_slice::<Value>(&b).ok())
            {
                state = merge(state, &saved);
            }
            let small = fs::metadata(&fixes_file).is_ok_and(|m| m.len() <= MAX_FIXES_FILE);
            if small {
                saved_fixes = fs::read(&fixes_file)
                    .ok()
                    .and_then(|b| serde_json::from_slice::<Value>(&b).ok());
            }
        }
        let room = Arc::new(Room {
            code: code.clone(),
            ephemeral,
            tx: broadcast::channel(1024).0,
            inner: Mutex::new(RoomInner {
                v: 0,
                state: Value::Null,
                fixes: DisplayFixes::new(saved_fixes.as_ref()),
                adapter: ValorantAdapter::new(),
                last_gep_at: None,
                last_feed_at: None,
                dirty: false,
            }),
            log: self.data.join(format!("{code}.ndjson")),
            file,
            fixes_file,
        });
        {
            let mut inner = room.lock();
            inner
                .fixes
                .sync(&state, Some(now_ms()), room.store().as_ref());
            inner.state = state;
        }
        rooms.insert(code, room.clone());
        room
    }

    pub fn rooms(&self) -> Vec<Arc<Room>> {
        self.rooms
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .values()
            .cloned()
            .collect()
    }

    pub fn resolve_output(&self, id: &str) -> Option<Output> {
        self.outputs
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .get(id)
            .cloned()
    }

    pub fn set_outputs(&self, value: &Value) -> std::io::Result<usize> {
        let parsed = parse_outputs(value);
        let count = parsed.len();
        write_atomic(&self.data.join("outputs.json"), value)?;
        *self.outputs.lock().unwrap_or_else(|p| p.into_inner()) = parsed;
        self.outputs_changed.send_modify(|n| *n += 1);
        Ok(count)
    }

    pub fn save_all(&self) {
        for room in self.rooms() {
            room.save_if_dirty();
        }
    }
}

fn valid_output_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 64
        && id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

/// `{ outputs: [{ id, overlay, matchCode }] }`; invalid entries are ignored.
fn parse_outputs(value: &Value) -> HashMap<String, Output> {
    value
        .get("outputs")
        .and_then(Value::as_array)
        .map(|list| {
            list.iter()
                .filter_map(|o| {
                    let id = o.get("id")?.as_str()?;
                    let overlay = o.get("overlay")?.as_str()?;
                    let valid_overlay = !overlay.is_empty()
                        && overlay
                            .bytes()
                            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-');
                    (valid_output_id(id) && valid_overlay).then(|| {
                        (
                            id.to_string(),
                            Output {
                                overlay: overlay.to_string(),
                                match_code: room_code(o.get("matchCode").and_then(Value::as_str)),
                            },
                        )
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn room_codes_match_the_js_rules() {
        assert_eq!(room_code(None), "MAIN");
        assert_eq!(room_code(Some("gf1")), "GF1");
        assert_eq!(room_code(Some("a b!c")), "ABC");
        assert_eq!(room_code(Some("!!!")), "MAIN");
        assert_eq!(room_code(Some(&"x".repeat(40))).len(), 32);
    }
}
