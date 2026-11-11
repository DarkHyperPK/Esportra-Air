//! Raw Overwolf GEP messages → Esportra HUD state.
//!
//! A line-by-line port of `esportra-valorant-hud/adapters/valorant-gep.js`, including its
//! JavaScript coercions, so both produce identical state for identical input (checked against the
//! golden fixtures in `engine/fixtures`). Where the JavaScript would throw on malformed state, the
//! port returns [`IngestError`] and the caller keeps the previous state.

use std::collections::{HashMap, HashSet};

use air_state::js::{
    get, num, number_or_zero, number_to_string, object_values, or, slice_utf16, string_to_number,
    to_js_string, to_number, trim, truthy,
};
use regex::Regex;
use serde_json::{json, Map, Value};

use crate::coverage::PlayerCoverage;
use crate::message::{normalize, Event, MalformedMessage};
use crate::tables;

type Slot = (usize, usize);

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IngestError(pub &'static str);

impl From<MalformedMessage> for IngestError {
    fn from(error: MalformedMessage) -> Self {
        IngestError(error.0)
    }
}

impl std::fmt::Display for IngestError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.0)
    }
}

impl std::error::Error for IngestError {}

#[derive(Default, Clone, Copy)]
struct Spike {
    planted: bool,
    defused: bool,
    detonated: bool,
}

#[derive(Clone, Copy)]
struct Clutch {
    tp: Slot,
    against: usize,
}

/// One adapter per match room. It keeps the round context the HUD state does not hold.
pub struct ValorantAdapter {
    slots: HashMap<String, Slot>,
    by_name: HashMap<String, Slot>,
    spike: Spike,
    last_score: Option<[f64; 2]>,
    pending_kills: Vec<(Value, f64)>,
    round_kills: HashMap<Slot, u32>,
    team_killers: [HashSet<usize>; 2],
    clutch: Option<Clutch>,
    round_econ: Option<[f64; 2]>,
    round_banner: Option<&'static str>,
    round_first_kill: bool,
    overtime_fired: bool,
    prev_money: Option<HashMap<String, f64>>,
    coverage: PlayerCoverage,
    unknown_codenames: HashSet<String>,
    unique_keys: u64,
    team_order: Regex,
}

impl Default for ValorantAdapter {
    fn default() -> Self {
        Self::new()
    }
}

// ── value helpers that mirror small JavaScript expressions in the original ──

/// `String(n || '').split('#')[0].trim()`
fn name_part(n: Option<&Value>) -> String {
    let s = if truthy(n) {
        to_js_string(n)
    } else {
        String::new()
    };
    trim(s.split('#').next().unwrap_or("")).to_string()
}
fn name_key(n: Option<&Value>) -> String {
    name_part(n).to_lowercase()
}
fn short_name(n: Option<&Value>) -> String {
    name_part(n).to_uppercase()
}
/// `String(v || fallback)`
fn string_or(v: Option<&Value>, fallback: &str) -> String {
    if truthy(v) {
        to_js_string(v)
    } else {
        fallback.to_string()
    }
}
/// `[0, 1, '0', '1'].includes(v.team) ? Number(v.team) : v.teammate === false || v.teammate === 'false' ? 1 : 0`
fn game_team(v: &Value) -> usize {
    match v.get("team") {
        Some(Value::Number(n)) if n.as_f64() == Some(0.0) => 0,
        Some(Value::Number(n)) if n.as_f64() == Some(1.0) => 1,
        Some(Value::String(s)) if s == "0" => 0,
        Some(Value::String(s)) if s == "1" => 1,
        _ => match v.get("teammate") {
            Some(Value::Bool(false)) => 1,
            Some(Value::String(s)) if s == "false" => 1,
            _ => 0,
        },
    }
}
/// `x++` on an object property.
fn increment(map: &mut Map<String, Value>, key: &str) {
    let n = to_number(map.get(key));
    map.insert(key.to_string(), num(n + 1.0));
}
/// `Math.min(4, (x || 0) + 1)` with JavaScript `+` (strings concatenate).
fn capped_streak(x: Option<&Value>) -> f64 {
    let next = if !truthy(x) {
        1.0
    } else {
        match x {
            Some(Value::Number(_)) | Some(Value::Bool(_)) => to_number(x) + 1.0,
            other => string_to_number(&format!("{}1", to_js_string(other))),
        }
    };
    if next.is_nan() {
        f64::NAN
    } else {
        next.min(4.0)
    }
}
/// `/^TX_(Hud_)?/i` removed.
fn strip_tx(s: &str) -> &str {
    let Some(rest) = s
        .get(..3)
        .filter(|p| p.eq_ignore_ascii_case("tx_"))
        .map(|_| &s[3..])
    else {
        return s;
    };
    rest.get(..4)
        .filter(|p| p.eq_ignore_ascii_case("hud_"))
        .map(|_| &rest[4..])
        .unwrap_or(rest)
}
fn banner(
    kind: &str,
    team: usize,
    player: usize,
    text: &str,
    method: &str,
    ts: f64,
    hold: i64,
) -> Value {
    json!({ "type": kind, "team": team, "player": player, "text": text, "method": method, "ts": num(ts), "hold": hold })
}
fn slot_json(tp: Slot) -> Value {
    json!([tp.0, tp.1])
}
const HOW_LABEL: [(&str, &str); 4] = [
    ("boom", "SPIKE DETONATED"),
    ("defuse", "SPIKE DEFUSED"),
    ("time", "TIME EXPIRED"),
    ("elim", "ELIMINATION"),
];

// ── state access ──

fn player(s: &Value, tp: Slot) -> Option<&Map<String, Value>> {
    s.get("players")?.get(tp.0)?.get(tp.1)?.as_object()
}
fn player_mut(s: &mut Value, tp: Slot) -> Option<&mut Map<String, Value>> {
    s.get_mut("players")?
        .get_mut(tp.0)?
        .get_mut(tp.1)?
        .as_object_mut()
}
fn team_players(s: &Value, t: usize) -> Vec<&Value> {
    match s.get("players").and_then(|p| p.get(t)) {
        Some(Value::Array(list)) => list.iter().collect(),
        _ => Vec::new(),
    }
}
fn alive_count(s: &Value, t: usize) -> usize {
    team_players(s, t)
        .iter()
        .filter(|p| truthy(p.get("alive")))
        .count()
}
fn obj_mut<'a>(
    s: &'a mut Value,
    key: &'static str,
) -> Result<&'a mut Map<String, Value>, IngestError> {
    s.get_mut(key)
        .and_then(Value::as_object_mut)
        .ok_or(IngestError(key))
}
fn team_stat(s: &mut Value, t: usize, field: &str) -> Result<(), IngestError> {
    let stats = s
        .get_mut("teamStats")
        .and_then(|v| v.get_mut(t))
        .and_then(Value::as_object_mut)
        .ok_or(IngestError("teamStats"))?;
    increment(stats, field);
    Ok(())
}
fn round_number(s: &Value) -> Option<&Value> {
    get(s.get("round"), "number")
}
fn side(s: &Value, t: usize, r: f64) -> Option<Value> {
    let first = get(s.get("firstSide"), &t.to_string()).cloned();
    let other = Value::String(
        if first.as_ref().and_then(Value::as_str) == Some("ATK") {
            "DEF"
        } else {
            "ATK"
        }
        .into(),
    );
    if r <= 12.0 {
        first
    } else if r <= 24.0 {
        Some(other)
    } else {
        let m = (r - 25.0) % 2.0;
        if m != 0.0 && !m.is_nan() {
            Some(other)
        } else {
            first
        }
    }
}
fn side_is(s: &Value, t: usize, r: f64, value: &str) -> bool {
    side(s, t, r).as_ref().and_then(Value::as_str) == Some(value)
}
fn set_sides(s: &mut Value) {
    let r = round_number(s);
    let r = if truthy(r) { to_number(r) } else { 1.0 };
    let count = s.get("teams").and_then(Value::as_array).map_or(0, Vec::len);
    for t in 0..count {
        let next = side(s, t, r);
        if let Some(Value::Object(team)) = s.get_mut("teams").and_then(|v| v.get_mut(t)) {
            air_state::js::set(team, "side", next);
        }
    }
}
fn attacking_team(s: &Value) -> i64 {
    s.get("teams")
        .and_then(Value::as_array)
        .and_then(|teams| {
            teams
                .iter()
                .position(|team| team.get("side").and_then(Value::as_str) == Some("ATK"))
        })
        .map_or(-1, |i| i as i64)
}

impl ValorantAdapter {
    pub fn new() -> Self {
        Self {
            slots: HashMap::new(),
            by_name: HashMap::new(),
            spike: Spike::default(),
            last_score: None,
            pending_kills: Vec::new(),
            round_kills: HashMap::new(),
            team_killers: [HashSet::new(), HashSet::new()],
            clutch: None,
            round_econ: None,
            round_banner: None,
            round_first_kill: false,
            overtime_fired: false,
            prev_money: None,
            coverage: PlayerCoverage::default(),
            unknown_codenames: HashSet::new(),
            unique_keys: 0,
            team_order: Regex::new(r#"[0-9]+\s*:\s*"([^"]+)""#).expect("valid regex"),
        }
    }

    /// After a restart: rebuild the working memory from the saved match state, so the next update
    /// continues the match (same seats, same score baseline, same spike) instead of starting over.
    pub fn resume_from(&mut self, s: &Value) {
        if let Some(Value::Array(teams)) = s.get("players") {
            for (t, team) in teams.iter().enumerate().take(2) {
                let Value::Array(list) = team else { continue };
                for (j, p) in list.iter().enumerate().take(5) {
                    let id = p.get("puuid");
                    if truthy(id) {
                        let key = self.map_key(id);
                        self.slots.insert(key, (t, j));
                    }
                    let name = p
                        .get("inGameName")
                        .filter(|v| truthy(Some(v)))
                        .or_else(|| p.get("name"));
                    if truthy(name) {
                        self.by_name.insert(name_key(name), (t, j));
                    }
                }
            }
        }
        let scores: Vec<f64> = s
            .get("teams")
            .and_then(Value::as_array)
            .map(|t| t.iter().filter_map(|x| x.get("score").and_then(Value::as_f64)).collect())
            .unwrap_or_default();
        if let [a, b] = scores[..] {
            self.last_score = Some([a, b]);
        }
        self.spike.planted = get(s.get("round"), "phase").and_then(Value::as_str) == Some("planted");
        self.rebaseline();
    }

    /// After a gap in game data: credits seen next are a new baseline, not a change. A +300 that
    /// happened while data was missing must not be read as a spike plant.
    pub fn rebaseline(&mut self) {
        self.prev_money = None;
    }

    /// Agent codenames seen that are not in the table yet.
    pub fn unknown_codenames(&self) -> impl Iterator<Item = &String> {
        self.unknown_codenames.iter()
    }

    /// A JavaScript `Map` key: primitives compare by value, objects by identity (never equal).
    fn map_key(&mut self, v: Option<&Value>) -> String {
        match v {
            None => "undefined".into(),
            Some(Value::Null) => "null".into(),
            Some(Value::Bool(b)) => format!("b:{b}"),
            Some(Value::Number(n)) => {
                format!("n:{}", number_to_string(n.as_f64().unwrap_or(f64::NAN)))
            }
            Some(Value::String(s)) => format!("s:{s}"),
            Some(_) => {
                self.unique_keys += 1;
                format!("o:{}", self.unique_keys)
            }
        }
    }

    fn agent_of(&mut self, c: Option<&Value>) -> String {
        let full = string_or(c, "");
        let raw = full.strip_suffix("_PC_C").unwrap_or(&full);
        match tables::agent(raw) {
            Some(name) => name.to_string(),
            None => {
                if !raw.is_empty() {
                    self.unknown_codenames.insert(raw.to_string());
                }
                full.to_uppercase()
            }
        }
    }

    fn slot(
        &mut self,
        s: &mut Value,
        pid: &str,
        game_team: usize,
        name: Option<&Value>,
        authoritative: bool,
    ) -> Option<Slot> {
        if let Some(cur) = self.slots.get(pid).copied() {
            if !authoritative || cur.0 == game_team {
                return Some(cur);
            }
            self.slots.remove(pid);
        }
        let t = game_team;
        let used: HashSet<usize> = self
            .slots
            .values()
            .filter(|x| x.0 == t)
            .map(|x| x.1)
            .collect();
        let j = (0..5).find(|k| !used.contains(k))?;
        self.slots.insert(pid.to_string(), (t, j));
        if truthy(name) {
            self.by_name.insert(name_key(name), (t, j));
        }
        if let Value::Object(state) = s {
            state.insert("firstSide".into(), json!(["ATK", "DEF"]));
        }
        Some((t, j))
    }

    fn count_plant(
        &mut self,
        s: &mut Value,
        now: f64,
        out: &mut Vec<Value>,
    ) -> Result<(), IngestError> {
        if self.spike.planted {
            return Ok(());
        }
        self.spike.planted = true;
        let round = obj_mut(s, "round")?;
        round.insert("phase".into(), json!("planted"));
        round.insert("endsAt".into(), num(now + 45000.0));
        let t = attacking_team(s);
        if t >= 0 {
            team_stat(s, t as usize, "plants")?;
        }
        out.push(json!({ "type": "spike.planted" }));
        Ok(())
    }

    fn count_first_kill(&mut self, s: &mut Value, killer: Slot) -> Result<(), IngestError> {
        if self.round_first_kill {
            return Ok(());
        }
        self.round_first_kill = true;
        if let Some(p) = player_mut(s, killer) {
            let fk = number_or_zero(p.get("fk")) + 1.0;
            p.insert("fk".into(), num(fk));
        }
        team_stat(s, killer.0, "firstKills")
    }

    fn weapon(d: &Value) -> String {
        let code = string_or(or(d.get("weapon"), d.get("ult")), "").to_lowercase();
        match tables::kill_weapon(&code) {
            Some(name) => name.to_string(),
            None => strip_tx(&string_or(d.get("weapon"), "SPIKE")).to_uppercase(),
        }
    }

    /// The shared body of a resolved kill (direct or replayed from the pending queue).
    /// `strict` is the direct path, where a missing victim slot is an error (the replay path skips it).
    fn apply_kill(
        &mut self,
        s: &mut Value,
        d: &Value,
        (k, vt): (Slot, Slot),
        ts: f64,
        strict: bool,
        out: &mut Vec<Value>,
    ) -> Result<(), IngestError> {
        let w = Self::weapon(d);
        match player_mut(s, vt) {
            Some(victim) => {
                victim.insert("alive".into(), json!(false));
                victim.insert("hp".into(), json!(0));
            }
            None if strict => return Err(IngestError("victim slot missing")),
            None => {}
        }
        let hs = truthy(d.get("headshot"));
        let entry = json!({ "killer": slot_json(k), "victim": slot_json(vt), "weapon": w, "hs": hs, "ts": num(ts) });
        let feed = match s.get_mut("killfeed") {
            Some(Value::Array(list)) => list,
            _ => return Err(IngestError("killfeed")),
        };
        feed.push(entry);
        if feed.len() > 12 {
            feed.drain(..feed.len() - 12);
        }
        self.count_first_kill(s, k)?;
        let kills = self.round_kills.entry(k).or_insert(0);
        *kills += 1;
        let kills = *kills;
        self.team_killers[k.0].insert(k.1);
        if kills == 5 && self.round_banner.is_none() {
            set_banner(s, banner("ace", k.0, k.1, "", "", ts, 5500));
            self.round_banner = Some("ace");
            out.push(json!({ "type": "banner.ace", "team": k.0, "player": k.1 }));
        } else if self.team_killers[k.0].len() == 5 && self.round_banner.is_none() {
            set_banner(s, banner("teamace", k.0, 0, "", "", ts, 4500));
            self.round_banner = Some("teamace");
            out.push(json!({ "type": "banner.teamace", "team": k.0 }));
        }
        let phase = get(s.get("round"), "phase").and_then(Value::as_str);
        if phase == Some("live") || phase == Some("planted") {
            for t in 0..2 {
                let mine = alive_count(s, t);
                let theirs = alive_count(s, 1 - t);
                if mine == 1 && theirs >= 1 && self.clutch.is_none_or(|c| c.tp.0 != t) {
                    let j = team_players(s, t)
                        .iter()
                        .position(|p| truthy(p.get("alive")))
                        .unwrap_or(0);
                    self.clutch = Some(Clutch {
                        tp: (t, j),
                        against: theirs,
                    });
                }
            }
        }
        out.push(json!({ "type": "kill", "killer": slot_json(k), "victim": slot_json(vt), "weapon": w, "hs": hs }));
        Ok(())
    }

    fn try_replay_kills(
        &mut self,
        s: &mut Value,
        out: &mut Vec<Value>,
        now: f64,
    ) -> Result<(), IngestError> {
        if self.pending_kills.is_empty() {
            return Ok(());
        }
        let queue = std::mem::take(&mut self.pending_kills);
        for (data, ts) in queue {
            if now - ts > 5000.0 {
                continue;
            }
            let k = self.by_name.get(&name_key(data.get("attacker"))).copied();
            let vt = self.by_name.get(&name_key(data.get("victim"))).copied();
            match (k, vt) {
                (Some(k), Some(vt)) => self.apply_kill(s, &data, (k, vt), ts, false, out)?,
                _ => self.pending_kills.push((data, ts)),
            }
        }
        Ok(())
    }

    /// Applies one raw GEP message to `state` at capture time `now` (ms) and returns HUD events.
    pub fn ingest(
        &mut self,
        s: &mut Value,
        msg: &Value,
        now: f64,
    ) -> Result<Vec<Value>, IngestError> {
        let empty = Value::Object(Map::new());
        let msg = if truthy(Some(msg)) { msg } else { &empty };
        let normalized = normalize(msg)?;
        let player_id = normalized.player_id.cloned();
        let heartbeat = msg.get("captureHeartbeat") == Some(&Value::Bool(true));
        self.coverage
            .record(player_id.as_ref(), &normalized.infos, heartbeat, now);
        let mut out = Vec::new();
        let mut events: Vec<Event> = normalized.events;
        for info in &normalized.infos {
            let key = &info.key;
            let key_str = to_js_string(Some(key));
            let v = info.value.as_ref();
            let numbered = |prefix: &str| {
                key_str
                    .strip_prefix(prefix)
                    .is_some_and(|n| !n.is_empty() && n.bytes().all(|b| b.is_ascii_digit()))
            };
            let has_player = v.is_some_and(|v| truthy(Some(v)) && truthy(v.get("player_id")));
            if numbered("scoreboard_") && has_player {
                self.scoreboard(s, v.expect("checked"), now, &mut out)?;
            } else if numbered("roster_") && has_player {
                self.roster(s, v.expect("checked"), now, &mut out)?;
            } else if info.key_is("ui_team_order_allies") || info.key_is("ui_team_order_enemies") {
                self.team_order(s, info.key_is("ui_team_order_allies"), v);
            } else if info.key_is("round_number") {
                let n = to_number(v);
                if truthy(Some(&num(n))) {
                    obj_mut(s, "round")?.insert("number".into(), num(n));
                } else {
                    obj_mut(s, "round")?;
                }
                set_sides(s);
            } else if info.key_is("round_phase") {
                self.round_phase(s, v, now, &mut out)?;
            } else if info.key_is("match_score") && truthy(v) {
                self.match_score(s, v.expect("checked"), now, &mut out)?;
            } else if info.key_is("map") && tables::map(&to_js_string(v)).is_some() {
                let name = tables::map(&to_js_string(v)).expect("checked");
                obj_mut(s, "map")?.insert("name".into(), json!(name));
            } else if info.key_is("observing") {
                if let Some(tp) = self.by_name.get(&name_key(v)).copied() {
                    if let Value::Object(state) = s {
                        state.insert("observed".into(), slot_json(tp));
                    }
                }
            } else if ["kill_feed", "planted_location", "match_start", "match_end"]
                .iter()
                .any(|n| info.key_is(n))
            {
                events.push(Event {
                    name: Some(key.clone()),
                    data: info.value.clone(),
                });
            }
        }
        for event in &events {
            let d = event.data.as_ref();
            if event.is("kill_feed") && truthy(d) {
                let d = d.expect("checked");
                let k = self.by_name.get(&name_key(d.get("attacker"))).copied();
                let vt = self.by_name.get(&name_key(d.get("victim"))).copied();
                let (Some(k), Some(vt)) = (k, vt) else {
                    self.pending_kills.push((d.clone(), now));
                    if self.pending_kills.len() > 10 {
                        self.pending_kills.drain(..self.pending_kills.len() - 10);
                    }
                    continue;
                };
                self.apply_kill(s, d, (k, vt), now, true, &mut out)?;
            } else if event.is("spike_defused") {
                if !self.spike.defused {
                    let t = 1 - attacking_team(s);
                    if (0..2).contains(&t) {
                        team_stat(s, t as usize, "defuses")?;
                    }
                }
                self.spike.defused = true;
                out.push(json!({ "type": "spike.defused" }));
            } else if event.is("spike_detonated") {
                self.spike.detonated = true;
                out.push(json!({ "type": "spike.detonated" }));
            } else if event.is("planted_location") {
                self.count_plant(s, now, &mut out)?;
                let mut site = Map::new();
                site.insert("type".into(), json!("spike.site"));
                if let Some(d) = d {
                    site.insert("site".into(), d.clone());
                }
                out.push(Value::Object(site));
            } else if event.is("match_start") {
                self.match_start(s)?;
                out.push(json!({ "type": "match.start" }));
            } else if event.is("match_end") {
                out.push(json!({ "type": "match.end" }));
            }
        }
        self.coverage.apply(s, now);
        Ok(out)
    }

    fn scoreboard(
        &mut self,
        s: &mut Value,
        v: &Value,
        now: f64,
        out: &mut Vec<Value>,
    ) -> Result<(), IngestError> {
        let pid = self.map_key(v.get("player_id"));
        let Some(tp) = self.slot(s, &pid, game_team(v), v.get("name"), true) else {
            return Ok(());
        };
        if player(s, tp).is_none() {
            return Ok(());
        }
        self.by_name.insert(name_key(v.get("name")), tp);
        let agent = self.agent_of(v.get("character"));
        let p = player_mut(s, tp).expect("checked");
        let in_game = match v.get("name") {
            Some(Value::String(n)) => slice_utf16(n, 128),
            _ => String::new(),
        };
        let short = short_name(v.get("name"));
        let name = if short.is_empty() {
            p.get("name").cloned()
        } else {
            Some(json!(short))
        };
        let agent = if agent.is_empty() {
            p.get("agent").cloned()
        } else {
            Some(json!(agent))
        };
        let ult_max = to_number(v.get("ult_max"));
        let ult_max = if ult_max != 0.0 && !ult_max.is_nan() {
            Some(num(ult_max))
        } else {
            p.get("ultMax").cloned()
        };
        use air_state::js::set;
        set(p, "inGameName", Some(json!(in_game)));
        set(p, "name", name);
        set(p, "agent", agent);
        set(p, "alive", Some(json!(truthy(v.get("alive")))));
        set(p, "ult", Some(num(number_or_zero(v.get("ult_points")))));
        set(p, "ultMax", ult_max);
        set(p, "k", Some(num(number_or_zero(v.get("kills")))));
        set(p, "d", Some(num(number_or_zero(v.get("deaths")))));
        set(p, "a", Some(num(number_or_zero(v.get("assists")))));
        set(p, "credits", Some(num(number_or_zero(v.get("money")))));
        set(p, "spike", Some(json!(truthy(v.get("spike")))));
        set(p, "puuid", v.get("player_id").cloned());
        for stat in ["acs", "adr", "hs"] {
            if p.get(stat).and_then(Value::as_f64) == Some(0.0) {
                p.insert(stat.into(), Value::Null);
            }
        }
        if truthy(v.get("weapon")) {
            if let Some(weapon) = tables::loadout(&to_js_string(v.get("weapon"))) {
                p.insert("weapon".into(), json!(weapon));
            }
        }
        if let Some(armor) = tables::shield(&to_js_string(v.get("shield"))) {
            p.insert("armor".into(), json!(armor));
        }
        if !truthy(p.get("alive")) {
            p.insert("hp".into(), json!(0));
        } else if !truthy(p.get("hp")) {
            p.insert("hp".into(), json!(100));
        }
        // Spike planted inference: every player gains exactly 300 credits when the spike plants.
        let live = get(s.get("round"), "phase").and_then(Value::as_str) == Some("live");
        let money = to_number(v.get("money"));
        if live && !self.spike.planted {
            if let Some(prev) = self.prev_money.as_ref().and_then(|m| m.get(&pid)) {
                if money - prev == 300.0 {
                    self.count_plant(s, now, out)?;
                }
            }
        }
        self.prev_money
            .get_or_insert_with(HashMap::new)
            .insert(pid, number_or_zero(v.get("money")));
        self.try_replay_kills(s, out, now)
    }

    fn roster(
        &mut self,
        s: &mut Value,
        v: &Value,
        now: f64,
        out: &mut Vec<Value>,
    ) -> Result<(), IngestError> {
        let pid = self.map_key(v.get("player_id"));
        let Some(tp) = self.slot(s, &pid, game_team(v), v.get("name"), false) else {
            return Ok(());
        };
        if player(s, tp).is_none() {
            return Ok(());
        }
        let agent = self.agent_of(v.get("character"));
        let p = player_mut(s, tp).expect("checked");
        let in_game = match v.get("name") {
            Some(Value::String(n)) => slice_utf16(n, 128),
            _ => String::new(),
        };
        p.insert("inGameName".into(), json!(in_game));
        let short = short_name(v.get("name"));
        if !short.is_empty() {
            p.insert("name".into(), json!(short));
        }
        p.insert("agent".into(), json!(agent));
        p.insert("locked".into(), json!(truthy(v.get("locked"))));
        air_state::js::set(p, "puuid", v.get("player_id").cloned());
        self.by_name.insert(name_key(v.get("name")), tp);
        self.try_replay_kills(s, out, now)
    }

    fn team_order(&mut self, s: &mut Value, allies: bool, v: Option<&Value>) {
        let t = if allies { 0 } else { 1 };
        let picks: Vec<Value> = match v {
            Some(obj @ (Value::Object(_) | Value::Array(_))) => {
                object_values(obj).into_iter().cloned().collect()
            }
            other => {
                let text = to_js_string(other);
                self.team_order
                    .captures_iter(&text)
                    .map(|c| json!(c[1].to_string()))
                    .collect()
            }
        };
        for (j, pick) in picks.iter().take(5).enumerate() {
            let free = player(s, (t, j)).is_some_and(|p| !truthy(p.get("puuid")));
            if free {
                let agent = self.agent_of(Some(pick));
                player_mut(s, (t, j))
                    .expect("checked")
                    .insert("agent".into(), json!(agent));
            }
        }
    }

    fn round_phase(
        &mut self,
        s: &mut Value,
        v: Option<&Value>,
        now: f64,
        out: &mut Vec<Value>,
    ) -> Result<(), IngestError> {
        obj_mut(s, "round")?;
        match v.and_then(Value::as_str) {
            Some("shopping") => {
                let mut prev = Vec::new();
                for team in s
                    .get("players")
                    .and_then(Value::as_array)
                    .ok_or(IngestError("players"))?
                {
                    let list = team.as_array().ok_or(IngestError("players"))?;
                    prev.push(Value::Array(
                        list.iter()
                            .map(|p| num(number_or_zero(p.get("credits"))))
                            .collect(),
                    ));
                }
                if let Value::Object(state) = s {
                    state.insert("prevCredits".into(), Value::Array(prev));
                }
                let round = obj_mut(s, "round")?;
                round.insert("phase".into(), json!("buy"));
                round.insert("endsAt".into(), num(now + 30000.0));
                if let Value::Object(state) = s {
                    state.insert("killfeed".into(), json!([]));
                }
                self.spike = Spike::default();
                self.round_kills.clear();
                self.team_killers[0].clear();
                self.team_killers[1].clear();
                self.clutch = None;
                self.round_econ = None;
                self.round_banner = None;
                self.round_first_kill = false;
                if let Some(m) = self.prev_money.as_mut() {
                    m.clear();
                }
                if let Some(Value::Array(teams)) = s.get_mut("players") {
                    for team in teams.iter_mut().filter_map(Value::as_array_mut) {
                        for p in team.iter_mut().filter_map(Value::as_object_mut) {
                            p.insert("alive".into(), json!(true));
                            p.insert("hp".into(), json!(100));
                        }
                    }
                }
            }
            Some("combat") => {
                let round = obj_mut(s, "round")?;
                round.insert("phase".into(), json!("live"));
                round.insert("endsAt".into(), num(now + 100000.0));
                let total = |t: usize| {
                    team_players(s, t)
                        .iter()
                        .map(|p| number_or_zero(p.get("credits")))
                        .sum::<f64>()
                };
                self.round_econ = Some([total(0), total(1)]);
            }
            Some("end") | Some("game_end") => {
                let round = obj_mut(s, "round")?;
                round.insert("phase".into(), json!("end"));
                round.insert("endsAt".into(), json!(0));
                round.insert("remaining".into(), json!(0));
            }
            _ => {}
        }
        let round = obj_mut(s, "round")?;
        let mut event = Map::new();
        event.insert("type".into(), json!("round.phase"));
        if let Some(phase) = round.get("phase") {
            event.insert("phase".into(), phase.clone());
        }
        if let Some(number) = round.get("number") {
            event.insert("round".into(), number.clone());
        }
        out.push(Value::Object(event));
        Ok(())
    }

    fn match_score(
        &mut self,
        s: &mut Value,
        v: &Value,
        now: f64,
        out: &mut Vec<Value>,
    ) -> Result<(), IngestError> {
        let mapped = [to_number(v.get("team_0")), to_number(v.get("team_1"))];
        if let Some(last) = self.last_score {
            for t in 0..2 {
                if mapped[t] > last[t] {
                    self.round_won(s, t, mapped, now, out)?;
                }
            }
        }
        self.last_score = Some(mapped);
        for (t, score) in mapped.iter().enumerate() {
            let team = s
                .get_mut("teams")
                .and_then(|v| v.get_mut(t))
                .and_then(Value::as_object_mut)
                .ok_or(IngestError("teams"))?;
            team.insert("score".into(), num(*score));
        }
        Ok(())
    }

    fn round_won(
        &mut self,
        s: &mut Value,
        t: usize,
        mapped: [f64; 2],
        now: f64,
        out: &mut Vec<Value>,
    ) -> Result<(), IngestError> {
        let l = 1 - t;
        let r = to_number(round_number(s));
        let attacker = (0..2)
            .find(|x| side_is(s, *x, r, "ATK"))
            .ok_or(IngestError("no attacking team"))?;
        let atk_alive = team_players(s, attacker)
            .iter()
            .any(|p| truthy(p.get("alive")));
        let how = if self.spike.detonated {
            "boom"
        } else if self.spike.defused {
            "defuse"
        } else if side_is(s, t, r, "DEF") && atk_alive {
            "time"
        } else {
            "elim"
        };
        let rounds_len = {
            let Value::Object(state) = s else {
                return Err(IngestError("state"));
            };
            let mut rounds = match state.get("rounds") {
                Some(Value::Array(list)) => list.clone(),
                r if !truthy(r) => Vec::new(),
                _ => return Err(IngestError("rounds")),
            };
            rounds.push(json!({ "w": t, "how": how }));
            let len = rounds.len();
            state.insert("rounds".into(), Value::Array(rounds));
            len
        };
        {
            let teams = s
                .get_mut("teams")
                .and_then(Value::as_array_mut)
                .ok_or(IngestError("teams"))?;
            teams
                .get_mut(t)
                .and_then(Value::as_object_mut)
                .ok_or(IngestError("teams"))?
                .insert("lossStreak".into(), json!(0));
            let loser = teams
                .get_mut(l)
                .and_then(Value::as_object_mut)
                .ok_or(IngestError("teams"))?;
            let streak = capped_streak(loser.get("lossStreak"));
            loser.insert("lossStreak".into(), num(streak));
        }
        let clutch_won = self.clutch.is_some_and(|c| {
            c.tp.0 == t && c.against > 1 && player(s, c.tp).is_some_and(|p| truthy(p.get("alive")))
        });
        let eco_won = self
            .round_econ
            .is_some_and(|e| e[t] < e[l] * 0.55 && e[t] < 12000.0);
        if clutch_won {
            team_stat(s, t, "clutches")?;
        }
        if eco_won {
            team_stat(s, t, "ecoWins")?;
        }
        let all_alive = team_players(s, t).iter().all(|p| truthy(p.get("alive")));
        let next = if !self.overtime_fired && mapped[0] >= 12.0 && mapped[1] >= 12.0 {
            self.overtime_fired = true;
            Some(banner("overtime", t, 0, "", "", now, 5000))
        } else if self.round_banner.is_none() && mapped[t] == 12.0 && mapped[l] < 12.0 {
            Some(banner("matchpoint", t, 0, "", "", now, 4200))
        } else if matches!(self.round_banner, Some("ace" | "teamace")) {
            None
        } else if all_alive {
            Some(banner("flawless", t, 0, "", "", now, 4200))
        } else if clutch_won {
            let c = self.clutch.expect("checked");
            Some(banner(
                "clutch",
                c.tp.0,
                c.tp.1,
                &c.against.to_string(),
                "",
                now,
                4800,
            ))
        } else if eco_won {
            Some(banner("thrifty", t, 0, "", "", now, 4200))
        } else {
            let label = HOW_LABEL
                .iter()
                .find(|(k, _)| *k == how)
                .map_or("", |(_, l)| l);
            Some(banner("round", t, 0, "", label, now, 4200))
        };
        if let Some(b) = next {
            set_banner(s, b);
        }
        out.push(json!({ "type": "round.won", "team": t, "how": how, "round": rounds_len }));
        Ok(())
    }

    fn match_start(&mut self, s: &mut Value) -> Result<(), IngestError> {
        let Value::Object(state) = s else {
            return Err(IngestError("state"));
        };
        state.insert("rounds".into(), json!([]));
        self.last_score = Some([0.0, 0.0]);
        self.overtime_fired = false;
        self.round_first_kill = false;
        for team in state
            .get_mut("teams")
            .and_then(Value::as_array_mut)
            .ok_or(IngestError("teams"))?
        {
            if let Some(team) = team.as_object_mut() {
                team.insert("score".into(), json!(0));
                team.insert("lossStreak".into(), json!(0));
            }
        }
        for stats in state
            .get_mut("teamStats")
            .and_then(Value::as_array_mut)
            .ok_or(IngestError("teamStats"))?
        {
            if let Some(stats) = stats.as_object_mut() {
                for field in ["plants", "defuses", "clutches", "ecoWins", "firstKills"] {
                    stats.insert(field.into(), json!(0));
                }
            }
        }
        for team in state
            .get_mut("players")
            .and_then(Value::as_array_mut)
            .ok_or(IngestError("players"))?
        {
            let players: Vec<&mut Value> = match team {
                Value::Array(list) => list.iter_mut().collect(),
                other => vec![other],
            };
            for p in players.into_iter().filter_map(Value::as_object_mut) {
                p.insert("fk".into(), json!(0));
                for stat in ["acs", "adr", "hs"] {
                    p.insert(stat.into(), Value::Null);
                }
            }
        }
        Ok(())
    }
}

fn set_banner(s: &mut Value, banner: Value) {
    if let Value::Object(state) = s {
        state.insert("banner".into(), banner);
    }
}
