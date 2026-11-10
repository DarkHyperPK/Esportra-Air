//! Match rooms: one shared state per match, versioned merge patches to every client, persistence.
//!
//! Mirrors `room`, `apply`, `event` and `changeDisplayFix` in `esportra-valorant-hud/server/server.js`.

use std::collections::HashMap;
use std::fs::{self, OpenOptions};
use std::io::Write as _;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, MutexGuard, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

use air_state::{diff, merge};
use air_valorant::ValorantAdapter;
use serde_json::{json, Map, Value};
use tokio::sync::{broadcast, watch};

use crate::features::reported_features;
use crate::fixes::{DisplayFixes, FixError, FixStore};
use crate::layers;

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
    /// True while a test round plays: nothing is logged or persisted.
    testing: AtomicBool,
    test_generation: AtomicU64,
    /// Overlay clients on air. Read-only observers (Air's own event log) are not counted.
    pub viewers: AtomicUsize,
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
    test: Option<TestRun>,
    /// Kills per (round, killer), for the multi-kill callout.
    multikills: HashMap<String, u32>,
    /// Bumped whenever an automatic lower third is shown, so only the latest timer clears it.
    auto_generation: u64,
}

/// A test round in progress: the real state and fixes it replaced, and its own parser.
struct TestRun {
    generation: u64,
    backup_state: Value,
    backup_fixes: DisplayFixes,
    adapter: ValorantAdapter,
    started_at: f64,
    /// Playback speed (1.0 = real time) and the script position it started from.
    speed: f64,
    from_ms: f64,
}

/// What one overlay page last said about each player camera it shows.
pub type CamReports = (String, HashMap<(u8, u8), (bool, f64)>);

/// A report older than this no longer counts (the page sends one every few seconds).
pub const CAM_REPORT_TTL_MS: f64 = 15_000.0;

impl Engine {
    /// `[[bool; 5]; 2]`: is each player camera connected, per the overlay pages on air for this room.
    pub fn cam_status(&self, room: &str) -> Value {
        let now = now_ms();
        let reports = self.cam_reports.lock().unwrap_or_else(|p| p.into_inner());
        let connected = |team: u8, slot: u8| {
            reports.values().any(|(code, map)| {
                code == room
                    && map
                        .get(&(team, slot))
                        .is_some_and(|(on, at)| *on && now - at < CAM_REPORT_TTL_MS)
            })
        };
        json!([0u8, 1u8].map(|t| (0u8..5).map(|s| connected(t, s)).collect::<Vec<_>>()))
    }
}

/// One scripted step of the Check screen's test round (`test-round.json`).
#[derive(Clone)]
pub struct TestStep {
    pub at: f64,
    pub ingest: bool,
    pub body: Value,
}

/// The embedded test round: the first three rounds of the recorded simulated match.
pub fn test_round_script() -> &'static [TestStep] {
    static SCRIPT: OnceLock<Vec<TestStep>> = OnceLock::new();
    SCRIPT.get_or_init(|| {
        let all: Value = serde_json::from_str(include_str!("../test-round.json"))
            .expect("embedded test round is JSON");
        all["steps"]
            .as_array()
            .map(|steps| {
                steps
                    .iter()
                    .map(|s| TestStep {
                        at: s["at"].as_f64().unwrap_or(0.0),
                        ingest: s["kind"] == "ingest",
                        body: s["body"].clone(),
                    })
                    .collect()
            })
            .unwrap_or_default()
    })
}

/// Replaces `{"$at": offset}` placeholders with absolute times from `start`.
fn rebase_times(v: &Value, start: f64) -> Value {
    match v {
        Value::Object(map) if map.len() == 1 && map.contains_key("$at") => {
            air_state::js::num(start + map["$at"].as_f64().unwrap_or(0.0))
        }
        Value::Object(map) => Value::Object(
            map.iter()
                .map(|(k, x)| (k.clone(), rebase_times(x, start)))
                .collect(),
        ),
        Value::Array(items) => Value::Array(items.iter().map(|x| rebase_times(x, start)).collect()),
        other => other.clone(),
    }
}

/// Keeps the producer's own team identity (name, tag, colour, logo) over the script's.
fn keep_team_identity(patch: &mut Value, current: &Value) {
    let Some(teams) = patch.get_mut("teams").and_then(Value::as_array_mut) else {
        return;
    };
    for (i, team) in teams.iter_mut().enumerate() {
        let Some(team) = team.as_object_mut() else {
            continue;
        };
        for field in ["name", "tag", "color", "logo"] {
            let own = current
                .get("teams")
                .and_then(|t| t.get(i))
                .and_then(|t| t.get(field));
            if own.is_some_and(|v| air_state::js::truthy(Some(v))) {
                team.insert(field.into(), own.cloned().unwrap_or(Value::Null));
            }
        }
    }
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
        if self.ephemeral || self.testing.load(Ordering::SeqCst) {
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
        if self.ephemeral || self.testing.load(Ordering::SeqCst) {
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
    pub fn apply(&self, inner: &mut RoomInner, mut next: Value, source: &str) -> Option<u64> {
        layers::sync(&inner.state, &mut next);
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
            inner.dirty |= inner.test.is_none();
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
    pub fn ingest(self: &Arc<Self>, messages: &[Value], age_ms: f64) -> (u64, usize) {
        // Real game data always wins over a test round.
        self.stop_test(None);
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
        let call_out = apply_rules(&mut inner, &mut state, &events);
        let v = self
            .apply(&mut inner, state, "valorant-gep")
            .unwrap_or(inner.v);
        drop(inner);
        if call_out {
            self.schedule_auto_lower_clear(MULTI_KILL_MS);
        }
        for e in &events {
            self.event(e, "valorant-gep");
        }
        (v, events.len())
    }

    /// Applies `change` to a copy of the state and broadcasts the result. The one place actions
    /// (layers, toast, poll, lower thirds…) change state, so every controller behaves the same.
    pub fn mutate(
        &self,
        source: &str,
        change: impl FnOnce(&mut Value) -> Result<(), String>,
    ) -> Result<u64, String> {
        let mut inner = self.lock();
        if inner.test.is_some() {
            return Err("Stop the test round before changing graphics.".into());
        }
        let mut next = inner.state.clone();
        change(&mut next)?;
        Ok(self.apply(&mut inner, next, source).unwrap_or(inner.v))
    }

    fn schedule_auto_lower_clear(self: &Arc<Self>, ms: u64) {
        let generation = {
            let mut inner = self.lock();
            inner.auto_generation += 1;
            inner.auto_generation
        };
        let room = self.clone();
        tokio::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_millis(ms)).await;
            let mut inner = room.lock();
            if inner.auto_generation != generation {
                return;
            }
            let mut next = inner.state.clone();
            next["airAuto"] = json!({ "lowerThird": false });
            room.apply(&mut inner, next, "air:rules");
        });
    }

    /// Applies, clears or undoes an on-air correction and broadcasts the visible change.
    pub fn change_fix(&self, input: &Value) -> Result<Value, FixError> {
        let mut inner = self.lock();
        let inner = &mut *inner;
        if inner.test.is_some() {
            return Err(FixError(
                "Stop the test round before correcting what viewers see.".into(),
            ));
        }
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
        if inner.test.is_some() {
            return;
        }
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

    /// Starts a test round on this match. Returns its generation, used by the player task.
    pub fn start_test(&self, speed: f64, from_ms: f64) -> Result<u64, &'static str> {
        let mut inner = self.lock();
        if inner.test.is_some() {
            return Err("A test round is already playing.");
        }
        let generation = self.test_generation.fetch_add(1, Ordering::SeqCst) + 1;
        inner.test = Some(TestRun {
            generation,
            backup_state: inner.state.clone(),
            backup_fixes: inner.fixes.clone(),
            adapter: ValorantAdapter::new(),
            started_at: now_ms(),
            speed,
            from_ms,
        });
        self.testing.store(true, Ordering::SeqCst);
        // The HUD shows its "REHEARSAL · SAMPLE DATA" tag for simulated context.
        let next = merge(
            inner.state.clone(),
            &json!({ "airContext": { "simulation": true }, "airDiagnostics": { "feedPaused": false } }),
        );
        self.apply(&mut inner, next, "air:test-round");
        Ok(generation)
    }

    /// Plays one scripted step. Returns false when this test round is no longer running.
    pub fn test_step(&self, generation: u64, step: &TestStep) -> bool {
        let mut inner = self.lock();
        let inner = &mut *inner;
        let Some(test) = inner.test.as_mut().filter(|t| t.generation == generation) else {
            return false;
        };
        let now = now_ms();
        let mut events = Vec::new();
        let next = if step.ingest {
            let mut state = inner.state.clone();
            let messages = step
                .body
                .as_array()
                .cloned()
                .unwrap_or_else(|| vec![step.body.clone()]);
            for message in &messages {
                let mut candidate = state.clone();
                if let Ok(out) = test.adapter.ingest(&mut candidate, message, now) {
                    state = candidate;
                    events.extend(out);
                }
            }
            state
        } else {
            // Script times map onto the wall clock from the position playback started at.
            let mut patch = rebase_times(&step.body, test.started_at - test.from_ms);
            keep_team_identity(&mut patch, &test.backup_state);
            merge(inner.state.clone(), &patch)
        };
        self.apply(inner, next, "air:test-round");
        for e in &events {
            let mut event = Map::new();
            event.insert(
                "id".into(),
                json!(format!(
                    "{}-test-{}",
                    self.code,
                    uuid::Uuid::new_v4().simple()
                )),
            );
            event.insert("t".into(), air_state::js::num(now));
            if let Value::Object(fields) = e {
                event.extend(fields.clone());
            }
            self.publish(json!({ "type": "event", "event": Value::Object(event) }));
        }
        true
    }

    /// Ends a test round and restores the exact state and fixes it replaced. With a generation,
    /// only that run is stopped (so a finished player cannot end a newer run).
    pub fn stop_test(&self, generation: Option<u64>) -> bool {
        let mut inner = self.lock();
        let inner = &mut *inner;
        if inner
            .test
            .as_ref()
            .is_none_or(|t| generation.is_some_and(|g| g != t.generation))
        {
            return false;
        }
        let test = inner.test.take().expect("checked");
        let before = inner.fixes.view(&inner.state);
        inner.state = test.backup_state;
        inner.fixes = test.backup_fixes;
        self.testing.store(false, Ordering::SeqCst);
        inner.v += 1;
        let patch = diff(&before, &inner.fixes.view(&inner.state));
        self.publish(
            json!({ "type": "patch", "v": inner.v, "patch": patch.unwrap_or_else(|| json!({})) }),
        );
        true
    }

    /// `{ running, startedAt, durationMs }` for the control status.
    pub fn test_status(&self) -> Value {
        let inner = self.lock();
        let duration = test_round_script().last().map_or(0.0, |s| s.at);
        match &inner.test {
            Some(t) => {
                json!({ "running": true, "startedAt": t.started_at, "durationMs": duration, "speed": t.speed, "fromMs": t.from_ms })
            }
            None => json!({ "running": false, "durationMs": duration }),
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

/// How long a multi-kill callout stays up.
const MULTI_KILL_MS: u64 = 5000;

/// Rules that run on game events (PRD §9 / E3.4). Most automatic graphics are derived by the HUD
/// from the round phase (economy at buy, recap at round end, spike timer on plant); what needs the
/// engine is: a new match returns manual overrides to Auto, buy phase clears an automatic lower
/// third, and a 3K or 4K shows a callout (not over an ace banner). Returns true when a callout was
/// shown and needs its timer.
fn apply_rules(inner: &mut RoomInner, state: &mut Value, events: &[Value]) -> bool {
    let mut callout = false;
    for event in events {
        match event.get("type").and_then(Value::as_str) {
            Some("match.start") => {
                layers::clear_overrides(state);
                inner.multikills.clear();
            }
            Some("round.phase") if event.get("phase").and_then(Value::as_str) == Some("buy") => {
                inner.multikills.clear();
                state["airAuto"] = json!({ "lowerThird": false });
            }
            Some("kill") => {
                let Some(killer) = event
                    .get("killer")
                    .and_then(Value::as_array)
                    .filter(|k| k.len() == 2)
                else {
                    continue;
                };
                let round = state
                    .get("round")
                    .and_then(|r| r.get("number"))
                    .cloned()
                    .unwrap_or(Value::Null);
                let key = format!("{round}:{}:{}", killer[0], killer[1]);
                let count = inner.multikills.entry(key).or_insert(0);
                *count += 1;
                let count = *count;
                let banner = state
                    .get("banner")
                    .and_then(|b| b.get("type"))
                    .and_then(Value::as_str)
                    .unwrap_or("");
                let auto = state
                    .get("airLayers")
                    .and_then(|l| l.get("lowerThird"))
                    .and_then(Value::as_str)
                    == Some("auto");
                if (3..=4).contains(&count) && !matches!(banner, "ace" | "teamace") && auto {
                    state["lowerThird"] = json!({ "kind": "generic", "title": format!("{count} KILLS"), "sub": "", "team": killer[0], "player": killer[1] });
                    state["airAuto"] = json!({ "lowerThird": true });
                    callout = true;
                }
            }
            _ => {}
        }
    }
    callout
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
    /// Camera connection reports from overlay pages, per client: (room, {(team, slot): (connected, at)}).
    pub cam_reports: Mutex<HashMap<u64, CamReports>>,
    /// Observer and player PCs joined over the network (off until the producer allows it).
    pub join: crate::join::Join,
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
            cam_reports: Mutex::new(HashMap::new()),
            join: Default::default(),
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
                test: None,
                multikills: HashMap::new(),
                auto_generation: 0,
            }),
            testing: AtomicBool::new(false),
            test_generation: AtomicU64::new(0),
            viewers: AtomicUsize::new(0),
            log: self.data.join(format!("{code}.ndjson")),
            file,
            fixes_file,
        });
        {
            let mut inner = room.lock();
            inner
                .fixes
                .sync(&state, Some(now_ms()), room.store().as_ref());
            let mut state = state;
            if !state.get("airLayers").is_some_and(Value::is_object) {
                state["airLayers"] = Value::Object(layers::defaults());
            }
            layers::sync(&Value::Null, &mut state);
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

    /// Plays the test round on `room` at real pace, then holds the last frame briefly and restores.
    pub fn play_test_round(
        room: Arc<Room>,
        speed: f64,
        from_ms: f64,
    ) -> Result<(), &'static str> {
        let generation = room.start_test(speed, from_ms)?;
        tokio::spawn(async move {
            let start = tokio::time::Instant::now();
            for step in test_round_script() {
                // Steps before the start position are applied at once, so the state is where it would be.
                if step.at >= from_ms {
                    let wait = (step.at - from_ms) / speed;
                    tokio::time::sleep_until(start + std::time::Duration::from_millis(wait as u64))
                        .await;
                }
                if !room.test_step(generation, step) {
                    return;
                }
            }
            tokio::time::sleep(std::time::Duration::from_secs(5)).await;
            room.stop_test(Some(generation));
        });
        Ok(())
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
