//! On-air corrections ("display fixes"), ported from `esportra-valorant-hud/server/display-fixes.js`.
//!
//! A fix changes what viewers see (score, series, map result, names, sides, observed player)
//! without touching the game data underneath. Fixes are scoped to the selected match context and
//! either stay until cleared or expire when the next round starts.

use serde_json::{json, Map, Value};

use air_state::js::{to_js_string, truthy};

pub const FIELDS: [&str; 7] = [
    "scores",
    "series",
    "map_result",
    "names",
    "player_name",
    "sides",
    "observed",
];

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FixError(pub String);

fn err<T>(message: &str) -> Result<T, FixError> {
    Err(FixError(message.to_string()))
}

/// Plain display text: non-blank, at most `max` UTF-16 units, no markup or control characters.
pub fn plain_text(v: Option<&Value>, max: usize) -> bool {
    let Some(Value::String(s)) = v else {
        return false;
    };
    !air_state::js::trim(s).is_empty()
        && s.encode_utf16().count() <= max
        && !s
            .chars()
            .any(|c| c == '<' || c == '>' || (c as u32) < 0x20 || c as u32 == 0x7f)
}

fn int_in(v: Option<&Value>, min: f64, max: f64) -> bool {
    v.and_then(Value::as_f64)
        .is_some_and(|n| n == n.trunc() && n >= min && n <= max)
}

fn keys_within(v: &Value, allowed: &[&str]) -> bool {
    v.as_object()
        .is_some_and(|m| m.keys().all(|k| allowed.contains(&k.as_str())))
}

fn scope(state: &Value) -> String {
    serde_json::to_string(state.get("airContext").unwrap_or(&Value::Null)).unwrap_or_default()
}

/// `{ map, number }` of the current round, when the round number is a positive integer.
pub fn round(state: &Value) -> Value {
    let number = state.get("round").and_then(|r| r.get("number"));
    if !int_in(number, 1.0, f64::MAX) {
        return Value::Null;
    }
    let name = state.get("map").and_then(|m| m.get("name"));
    let map = if truthy(name) {
        to_js_string(name)
    } else {
        String::new()
    };
    json!({ "map": map.to_uppercase(), "number": number.cloned().unwrap_or(Value::Null) })
}

fn player_at(state: &Value, team: usize, index: usize) -> Option<&Value> {
    state.get("players")?.get(team)?.get(index)
}

fn player_key(player: Option<&Value>) -> Value {
    let id = player.and_then(|p| p.get("id"));
    if truthy(id) {
        return id.cloned().unwrap_or(Value::Null);
    }
    let name = player.and_then(|p| p.get("name"));
    if truthy(name) {
        return name.cloned().unwrap_or(Value::Null);
    }
    Value::Null
}

fn team_index(v: Option<&Value>) -> Option<usize> {
    match v.and_then(Value::as_f64) {
        Some(0.0) => Some(0),
        Some(1.0) => Some(1),
        _ => None,
    }
}

fn validate(field: &str, value: Option<&Value>, state: &Value) -> Result<Value, FixError> {
    if !FIELDS.contains(&field) {
        return err("Choose scores, series, map result, names, sides or the observed player.");
    }
    if state.get("teams").and_then(Value::as_array).map(Vec::len) != Some(2) {
        return err("Match teams are unavailable.");
    }
    let Some(Value::Array(items)) = value else {
        return err("Provide the two current team values.");
    };
    if items.len() != 2 {
        return err("Provide the two current team values.");
    }
    let named_player = |team: Option<&Value>, index: Option<&Value>| {
        team_index(team)
            .zip(
                index
                    .and_then(Value::as_f64)
                    .filter(|n| *n == n.trunc() && (0.0..5.0).contains(n)),
            )
            .and_then(|(t, i)| player_at(state, t, i as usize))
            .is_some_and(|p| truthy(p.get("name")))
    };
    let ok = match field {
        "scores" => items.iter().all(|s| int_in(Some(s), 0.0, 999.0)),
        "series" => items.iter().all(|s| int_in(Some(s), 0.0, 9.0)),
        "map_result" => {
            let first = items[0].get("mapIndex");
            items.iter().all(|item| {
                truthy(Some(item))
                    && keys_within(item, &["mapIndex", "score"])
                    && int_in(item.get("mapIndex"), 1.0, 9.0)
                    && int_in(item.get("score"), 0.0, 2_147_483_647.0)
                    && item.get("mapIndex") == first
            })
        }
        "names" => items.iter().all(|t| {
            truthy(Some(t))
                && keys_within(t, &["name", "tag"])
                && plain_text(t.get("name"), 80)
                && plain_text(t.get("tag"), 12)
        }),
        "sides" => items.contains(&json!("ATK")) && items.contains(&json!("DEF")),
        "observed" => named_player(items.first(), items.get(1)),
        "player_name" => {
            let detail = &items[1];
            truthy(Some(detail))
                && keys_within(detail, &["index", "name"])
                && named_player(items.first(), detail.get("index"))
                && plain_text(detail.get("name"), 80)
        }
        _ => false,
    };
    if ok {
        return Ok(Value::Array(items.clone()));
    }
    err(match field {
        "scores" => "On-air scores must be integers from 0 to 999.",
        "series" => "Series wins must be integers from 0 to 9.",
        "map_result" => "Choose one valid map and two non-negative scores.",
        "names" => "Use plain team names (1–80 characters) and tags (1–12).",
        "sides" => "Assign one attacking and one defending team.",
        "observed" => "Choose a player from the received roster.",
        _ => "Choose a received player and a plain display name (1–80 characters).",
    })
}

fn valid_saved_names(names: &Value) -> bool {
    names.as_array().is_some_and(|list| {
        list.len() <= 10
            && list.iter().all(|n| {
                truthy(Some(n))
                    && team_index(n.get("team")).is_some()
                    && n.get("playerKey")
                        .and_then(Value::as_str)
                        .is_some_and(|k| k.encode_utf16().count() <= 256)
                    && n.get("playerIdBased").is_some_and(Value::is_boolean)
                    && plain_text(n.get("name"), 80)
            })
    })
}

/// The result of applying a change, for the event log and the caller.
pub struct FixAction {
    pub value: Value,
}

#[derive(Clone)]
pub struct DisplayFixes {
    scope: Option<String>,
    entries: Map<String, Value>,
    history: Vec<Value>,
    restored: Map<String, Value>,
    pub storage_warning: Option<String>,
}

pub trait FixStore {
    fn save(&self, data: &Value) -> std::io::Result<()>;
}

impl DisplayFixes {
    pub fn new(saved: Option<&Value>) -> Self {
        let scope = saved
            .and_then(|s| s.get("scope"))
            .and_then(Value::as_str)
            .map(str::to_string);
        let restored = saved
            .and_then(|s| s.get("entries"))
            .and_then(Value::as_object)
            .cloned()
            .unwrap_or_default();
        Self {
            scope,
            entries: Map::new(),
            history: Vec::new(),
            restored,
            storage_warning: None,
        }
    }

    pub fn entries(&self) -> &Map<String, Value> {
        &self.entries
    }

    fn data(&self) -> Value {
        json!({ "scope": self.scope, "entries": self.entries, "history": self.history })
    }

    fn persist(&mut self, store: &dyn FixStore) -> Result<(), FixError> {
        store
            .save(&self.data())
            .map_err(|e| FixError(format!("The fix could not be saved: {e}")))?;
        self.storage_warning = None;
        Ok(())
    }

    fn save_automatic(&mut self, store: &dyn FixStore) {
        if self.persist(store).is_err() {
            self.storage_warning = Some(
                "The override cleared in memory, but its saved copy could not be updated. Check local storage before restarting.".into(),
            );
        }
    }

    /// Reconciles fixes with the current state: drops them when the match context changes and
    /// expires `next_round` fixes once a newer round is captured.
    pub fn sync(&mut self, state: &Value, capture_at: Option<f64>, store: &dyn FixStore) {
        let next_scope = scope(state);
        if self.scope.as_ref().is_some_and(|s| *s != next_scope) {
            let had = !self.entries.is_empty() || !self.restored.is_empty();
            self.scope = Some(next_scope);
            self.entries.clear();
            self.history.clear();
            self.restored.clear();
            if had {
                self.save_automatic(store);
            }
            return;
        }
        self.scope = Some(next_scope);
        for field in FIELDS {
            let Some(entry) = self.restored.get(field) else {
                continue;
            };
            if validate(field, entry.get("value"), state).is_err() {
                continue;
            }
            if field == "player_name"
                && entry.get("names").is_some()
                && !valid_saved_names(&entry["names"])
            {
                continue;
            }
            let until_ok = matches!(
                entry.get("until").and_then(Value::as_str),
                Some("cleared" | "next_round")
            );
            if until_ok
                && entry
                    .get("at")
                    .and_then(Value::as_f64)
                    .is_some_and(f64::is_finite)
            {
                self.entries.insert(field.to_string(), entry.clone());
            }
        }
        self.restored.clear();
        let current = round(state);
        let mut expired = false;
        if let Some(capture_at) = capture_at {
            let fields: Vec<String> = self.entries.keys().cloned().collect();
            for field in fields {
                let entry = &self.entries[&field];
                let advanced = !current.is_null() && {
                    let r = entry.get("round").filter(|r| truthy(Some(r)));
                    r.is_none_or(|r| {
                        r.get("map") != current.get("map")
                            || current["number"].as_f64().unwrap_or(0.0)
                                > r.get("number").and_then(Value::as_f64).unwrap_or(f64::NAN)
                    })
                };
                let next_round = entry.get("until").and_then(Value::as_str) == Some("next_round");
                let after = entry
                    .get("at")
                    .and_then(Value::as_f64)
                    .is_some_and(|at| capture_at >= at);
                if next_round && after && advanced {
                    self.entries.shift_remove(&field);
                    expired = true;
                }
            }
        }
        if expired {
            self.history.clear();
            self.save_automatic(store);
        }
    }

    /// What viewers see: the state with nicknames and active fixes applied.
    pub fn view(&self, state: &Value) -> Value {
        let mut result = state.clone();
        let nicknames = state.get("hudNicknames").cloned();
        if let Some(Value::Array(teams)) = result.get_mut("players") {
            for team in teams.iter_mut().filter_map(Value::as_array_mut) {
                for player in team.iter_mut().filter_map(Value::as_object_mut) {
                    let Some(Value::String(puuid)) = player.get("puuid") else {
                        continue;
                    };
                    if let Some(Value::String(nick)) = nicknames.as_ref().and_then(|n| n.get(puuid))
                    {
                        player.insert("name".into(), json!(nick));
                    }
                }
            }
        }
        if result.get("teams").and_then(Value::as_array).map(Vec::len) != Some(2) {
            return result;
        }
        for (field, entry) in &self.entries {
            let values = entry
                .get("value")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default();
            let set_team = |result: &mut Value, index: usize, key: &str, v: Value| {
                if let Some(team) = result["teams"]
                    .get_mut(index)
                    .and_then(Value::as_object_mut)
                {
                    team.insert(key.into(), v);
                }
            };
            match field.as_str() {
                "scores" | "series" | "sides" => {
                    let key = if field == "scores" {
                        "score"
                    } else if field == "series" {
                        "series"
                    } else {
                        "side"
                    };
                    for (i, v) in values.into_iter().enumerate() {
                        set_team(&mut result, i, key, v);
                    }
                }
                "names" => {
                    for (i, v) in values.into_iter().enumerate() {
                        if let Value::Object(fields) = v {
                            for (k, v) in fields {
                                set_team(&mut result, i, &k, v);
                            }
                        }
                    }
                }
                "map_result" => apply_map_result(&mut result, &values),
                "observed" => {
                    let teams = if truthy(entry.get("playerIdBased")) {
                        vec![0, 1]
                    } else {
                        team_index(values.first()).into_iter().collect()
                    };
                    for team in teams {
                        if let Some(player) = find_player(state, team, entry.get("playerKey")) {
                            result["observed"] = json!([team, player]);
                        }
                    }
                }
                "player_name" => {
                    let names = match entry.get("names") {
                        Some(Value::Array(names)) => names.clone(),
                        _ => vec![json!({
                            "playerKey": entry.get("playerKey"), "playerIdBased": entry.get("playerIdBased"),
                            "team": values.first(), "name": values.get(1).and_then(|v| v.get("name")),
                        })],
                    };
                    for named in names
                        .iter()
                        .take(10)
                        .filter(|n| plain_text(n.get("name"), 80))
                    {
                        let teams = if truthy(named.get("playerIdBased")) {
                            vec![0, 1]
                        } else {
                            team_index(named.get("team")).into_iter().collect()
                        };
                        for team in teams {
                            if let Some(player) = find_player(state, team, named.get("playerKey")) {
                                if let Some(p) = result["players"][team]
                                    .get_mut(player)
                                    .and_then(Value::as_object_mut)
                                {
                                    p.insert("name".into(), named["name"].clone());
                                }
                            }
                        }
                    }
                }
                _ => {}
            }
        }
        result
    }

    /// Applies, clears or undoes a fix. Persists before returning; on a save failure nothing changes.
    pub fn change(
        &mut self,
        input: &Value,
        state: &Value,
        now: f64,
        id: String,
        store: &dyn FixStore,
    ) -> Result<FixAction, FixError> {
        self.sync(state, None, store);
        let allowed = ["action", "field", "value", "until", "reason"];
        if !input
            .as_object()
            .is_some_and(|m| m.keys().all(|k| allowed.contains(&k.as_str())))
        {
            return err("Invalid on-air fix.");
        }
        let saved = (self.entries.clone(), self.history.clone());
        let before = Value::Object(self.entries.clone());
        let action = input.get("action").and_then(Value::as_str).unwrap_or("");
        let field = input.get("field");
        match action {
            "set" => {
                let field_name = field.and_then(Value::as_str).unwrap_or("");
                let value = validate(field_name, input.get("value"), state)?;
                let until = input.get("until").and_then(Value::as_str);
                let reason = input.get("reason").and_then(Value::as_str);
                let reason_ok = reason.is_some_and(|r| {
                    !air_state::js::trim(r).is_empty() && r.encode_utf16().count() <= 500
                });
                if !matches!(until, Some("cleared" | "next_round")) || !reason_ok {
                    return err("Choose an expiry and enter a reason (1–500 characters).");
                }
                let mut entry = json!({
                    "id": id, "at": air_state::js::num(now), "value": value, "until": until,
                    "reason": air_state::js::trim(reason.unwrap_or("")), "round": round(state),
                });
                let team = team_index(value.get(0)).unwrap_or(0);
                if field_name == "observed" {
                    let index = value[1].as_f64().unwrap_or(0.0) as usize;
                    let target = player_at(state, team, index);
                    entry["playerKey"] = player_key(target);
                    entry["playerIdBased"] = json!(truthy(target.and_then(|p| p.get("id"))));
                }
                if field_name == "player_name" {
                    let index = value[1]["index"].as_f64().unwrap_or(0.0) as usize;
                    let target = player_at(state, team, index);
                    let named = json!({
                        "playerKey": player_key(target), "playerIdBased": truthy(target.and_then(|p| p.get("id"))),
                        "team": team, "name": value[1]["name"],
                    });
                    let previous = before.get("player_name");
                    let mut names: Vec<Value> = match previous {
                        Some(p) => match p.get("names") {
                            Some(Value::Array(names)) => names.clone(),
                            _ => vec![json!({
                                "playerKey": p.get("playerKey"), "playerIdBased": p.get("playerIdBased"),
                                "team": p["value"].get(0), "name": p["value"].get(1).and_then(|v| v.get("name")),
                            })],
                        },
                        None => Vec::new(),
                    };
                    let id_based = truthy(named.get("playerIdBased"));
                    names.retain(|item| {
                        item.get("playerKey") != named.get("playerKey")
                            || (!id_based && item.get("team") != named.get("team"))
                    });
                    names.push(named.clone());
                    let keep = names.len().saturating_sub(10);
                    for (k, v) in named.as_object().expect("object") {
                        entry[k] = v.clone();
                    }
                    entry["names"] = Value::Array(names.split_off(keep));
                }
                self.entries.insert(field_name.to_string(), entry);
            }
            "clear" => {
                let named = field.filter(|f| !f.is_null());
                if let Some(f) = named {
                    if !f.as_str().is_some_and(|f| FIELDS.contains(&f)) {
                        return err("Choose an existing fix to clear.");
                    }
                }
                match named.and_then(Value::as_str) {
                    Some(f) => {
                        self.entries.shift_remove(f);
                    }
                    None => self.entries.clear(),
                }
            }
            "undo" => {
                let Some(previous) = self.history.pop() else {
                    return err("No fix to undo in this round.");
                };
                self.entries = previous
                    .get("before")
                    .and_then(Value::as_object)
                    .cloned()
                    .unwrap_or_default();
            }
            _ => return err("Choose Apply, Clear or Undo."),
        }
        let at = air_state::js::num(now);
        if action != "undo" {
            let start = self.history.len().saturating_sub(19);
            self.history.drain(..start);
            self.history
                .push(json!({ "id": id, "at": at, "before": before }));
        }
        if let Err(e) = self.persist(store) {
            (self.entries, self.history) = saved;
            return Err(e);
        }
        let field_out = field
            .filter(|f| truthy(Some(f)))
            .cloned()
            .unwrap_or(Value::Null);
        Ok(FixAction {
            value: json!({ "id": id, "at": at, "action": action, "field": field_out, "before": before, "after": self.entries }),
        })
    }

    /// The operator's view of active fixes, as returned by `GET /api/<match>/display-fixes`.
    pub fn status(&self, state: &Value) -> Value {
        let displayed = self.view(state);
        let active: Vec<Value> = self
            .entries
            .iter()
            .map(|(field, entry)| {
                let mut item = Map::new();
                item.insert("field".into(), json!(field));
                if let Value::Object(fields) = entry {
                    item.extend(fields.clone());
                }
                Value::Object(item)
            })
            .collect();
        let teams: Vec<Value> = displayed
            .get("teams")
            .and_then(Value::as_array)
            .map(|teams| {
                teams
                    .iter()
                    .take(2)
                    .enumerate()
                    .map(|(i, t)| {
                        json!({
                            "name": t.get("name"), "tag": t.get("tag"), "side": t.get("side"), "score": t.get("score"),
                            "series": t.get("series"), "sourceScore": state["teams"].get(i).and_then(|t| t.get("score")),
                        })
                    })
                    .collect()
            })
            .unwrap_or_default();
        let players: Vec<Value> = displayed
            .get("players")
            .and_then(Value::as_array)
            .map(|teams| {
                teams
                    .iter()
                    .take(2)
                    .map(|team| {
                        let list = team.as_array().cloned().unwrap_or_default();
                        Value::Array(
                            list.iter()
                                .take(5)
                                .map(|p| {
                                    let name = p
                                        .get("name")
                                        .filter(|n| truthy(Some(n)))
                                        .cloned()
                                        .unwrap_or(json!(""));
                                    let id = p
                                        .get("id")
                                        .filter(|n| truthy(Some(n)))
                                        .cloned()
                                        .unwrap_or(Value::Null);
                                    json!({ "name": name, "id": id })
                                })
                                .collect(),
                        )
                    })
                    .collect()
            })
            .unwrap_or_default();
        json!({
            "active": active, "canUndo": !self.history.is_empty(), "storageWarning": self.storage_warning,
            "round": round(state), "teams": teams, "observed": displayed.get("observed"), "players": players,
        })
    }
}

fn find_player(state: &Value, team: usize, key: Option<&Value>) -> Option<usize> {
    let key = key.cloned().unwrap_or(Value::Null);
    state
        .get("players")?
        .get(team)?
        .as_array()?
        .iter()
        .position(|p| player_key(Some(p)) == key)
}

fn apply_map_result(result: &mut Value, values: &[Value]) {
    let Some(map_index) = values
        .first()
        .and_then(|v| v.get("mapIndex"))
        .and_then(Value::as_u64)
    else {
        return;
    };
    let map_index = map_index as usize;
    if !result.get("series").is_some_and(Value::is_array) {
        result["series"] = json!([]);
    }
    let series = result["series"].as_array_mut().expect("array");
    while series.len() < map_index {
        series.push(json!({}));
    }
    let scores: Vec<f64> = values
        .iter()
        .map(|v| v["score"].as_f64().unwrap_or(0.0))
        .collect();
    let winner = if scores[0] > scores[1] {
        0
    } else if scores[0] < scores[1] {
        1
    } else {
        -1
    };
    let mut entry = series[map_index - 1]
        .as_object()
        .cloned()
        .unwrap_or_default();
    entry.insert(
        "score".into(),
        json!([values[0]["score"], values[1]["score"]]),
    );
    entry.insert("winner".into(), json!(winner));
    series[map_index - 1] = Value::Object(entry);
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;

    #[derive(Default)]
    struct Memory(RefCell<Vec<Value>>);
    impl FixStore for Memory {
        fn save(&self, data: &Value) -> std::io::Result<()> {
            self.0.borrow_mut().push(data.clone());
            Ok(())
        }
    }

    fn state() -> Value {
        json!({
            "airContext": { "showId": "s", "matchId": "m" },
            "teams": [{ "name": "A", "tag": "A", "score": 3, "series": 0, "side": "ATK" }, { "name": "B", "tag": "B", "score": 5, "series": 1, "side": "DEF" }],
            "players": [[{ "name": "ONE" }, { "name": "TWO", "id": "p2" }], [{ "name": "THREE" }]],
            "round": { "number": 4 }, "map": { "name": "lotus" }, "observed": [0, 0], "series": [],
        })
    }

    #[test]
    fn score_fix_applies_then_expires_next_round() {
        let store = Memory::default();
        let mut fixes = DisplayFixes::new(None);
        let s = state();
        let input = json!({ "action": "set", "field": "scores", "value": [7, 5], "until": "next_round", "reason": "wrong" });
        fixes
            .change(&input, &s, 1000.0, "id-1".into(), &store)
            .unwrap();
        assert_eq!(fixes.view(&s)["teams"][0]["score"], json!(7));
        assert_eq!(fixes.view(&s)["teams"][0]["name"], json!("A"));
        let mut next = s.clone();
        next["round"]["number"] = json!(5);
        fixes.sync(&next, Some(2000.0), &store);
        assert!(fixes.entries().is_empty());
        assert_eq!(fixes.view(&next)["teams"][0]["score"], json!(3));
    }

    #[test]
    fn validation_and_undo() {
        let store = Memory::default();
        let mut fixes = DisplayFixes::new(None);
        let s = state();
        let bad = json!({ "action": "set", "field": "names", "value": [{ "name": "<b>", "tag": "X" }, { "name": "Y", "tag": "Y" }], "until": "cleared", "reason": "r" });
        assert!(fixes.change(&bad, &s, 1.0, "a".into(), &store).is_err());
        let name = json!({ "action": "set", "field": "player_name", "value": [0, { "index": 1, "name": "Two Fixed" }], "until": "cleared", "reason": "r" });
        fixes.change(&name, &s, 2.0, "b".into(), &store).unwrap();
        assert_eq!(fixes.view(&s)["players"][0][1]["name"], json!("Two Fixed"));
        let map = json!({ "action": "set", "field": "map_result", "value": [{ "mapIndex": 2, "score": 13 }, { "mapIndex": 2, "score": 9 }], "until": "cleared", "reason": "r" });
        fixes.change(&map, &s, 3.0, "c".into(), &store).unwrap();
        assert_eq!(
            fixes.view(&s)["series"][1],
            json!({ "score": [13, 9], "winner": 0 })
        );
        fixes
            .change(&json!({ "action": "undo" }), &s, 4.0, "d".into(), &store)
            .unwrap();
        assert!(fixes.view(&s)["series"].as_array().unwrap().is_empty());
        assert_eq!(fixes.status(&s)["canUndo"], json!(true));
    }

    #[test]
    fn context_change_drops_fixes() {
        let store = Memory::default();
        let mut fixes = DisplayFixes::new(None);
        let s = state();
        let input = json!({ "action": "set", "field": "sides", "value": ["DEF", "ATK"], "until": "cleared", "reason": "swap" });
        fixes.change(&input, &s, 1.0, "a".into(), &store).unwrap();
        let mut other = s.clone();
        other["airContext"]["matchId"] = json!("n");
        fixes.sync(&other, None, &store);
        assert!(fixes.entries().is_empty());
    }
}
