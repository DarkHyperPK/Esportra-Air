//! Player-PC capture coverage, ported from `adapters/player-coverage.js`.
//!
//! Tracks live health and ability data sent from competitors' own PCs (GEP `me`), and only shows it
//! on the HUD while it belongs to the current map and round.

use std::collections::HashMap;

use air_state::js::{get, num, to_js_string, to_number, truthy};
use serde_json::{json, Map, Value};

use crate::message::Info;

const MAX_PLAYERS: usize = 64;

#[derive(Default, Clone)]
struct PlayerData {
    health: Option<f64>,
    health_at: Option<f64>,
    availability: Option<Vec<bool>>,
    exact_charges: Option<Vec<f64>>,
    abilities_at: Option<f64>,
    last_seen_at: Option<f64>,
}

#[derive(Default)]
pub struct PlayerCoverage {
    players: HashMap<String, PlayerData>,
    round_key: Option<String>,
    round_at: Option<f64>,
}

pub fn is_uuid(s: &str) -> bool {
    let b = s.as_bytes();
    b.len() == 36
        && b.iter().enumerate().all(|(i, c)| match i {
            8 | 13 | 18 | 23 => *c == b'-',
            _ => c.is_ascii_hexdigit(),
        })
}

fn ability_valid(v: Option<&Value>) -> bool {
    match v {
        Some(Value::Bool(_)) => true,
        Some(Value::String(s)) => s == "true" || s == "false",
        Some(Value::Number(n)) => n
            .as_f64()
            .is_some_and(|f| f == f.trunc() && (0.0..=16.0).contains(&f)),
        _ => false,
    }
}

impl PlayerCoverage {
    pub fn record(&mut self, player_id: Option<&Value>, infos: &[Info], heartbeat: bool, now: f64) {
        let Some(Value::String(id)) = player_id else {
            return;
        };
        if !is_uuid(id) || (!self.players.contains_key(id) && self.players.len() >= MAX_PLAYERS) {
            return;
        }
        let mut value = self.players.get(id).cloned().unwrap_or_default();
        for info in infos {
            let input = info.value.as_ref();
            if info.key_is("health")
                && !matches!(input, Some(Value::Null))
                && input != Some(&Value::String(String::new()))
            {
                let n = to_number(input);
                if n.is_finite() && (0.0..=1000.0).contains(&n) {
                    value.health = Some(n);
                    value.health_at = Some(now);
                }
            }
            if info.key_is("abilities")
                && truthy(input)
                && matches!(input, Some(Value::Object(_) | Value::Array(_)))
            {
                let abilities: Vec<Option<&Value>> =
                    ["C", "Q", "E"].iter().map(|k| get(input, k)).collect();
                if abilities.iter().all(|a| ability_valid(*a)) {
                    value.availability = Some(
                        abilities
                            .iter()
                            .map(|a| match a {
                                Some(Value::Bool(b)) => *b,
                                Some(Value::String(s)) => s == "true",
                                Some(Value::Number(n)) => n.as_f64().unwrap_or(0.0) > 0.0,
                                _ => false,
                            })
                            .collect(),
                    );
                    value.exact_charges = abilities
                        .iter()
                        .map(|a| match a {
                            Some(Value::Number(n)) => n.as_f64(),
                            _ => None,
                        })
                        .collect::<Option<Vec<f64>>>();
                    value.abilities_at = Some(now);
                }
            }
        }
        if heartbeat || value.health_at == Some(now) || value.abilities_at == Some(now) {
            value.last_seen_at = Some(now);
        }
        if value.last_seen_at.is_some() {
            self.players.insert(id.clone(), value);
        }
    }

    pub fn apply(&mut self, state: &mut Value, now: f64) {
        let map_name = get(get(Some(state), "map"), "name");
        let round_number = get(get(Some(state), "round"), "number");
        let key = format!("{}:{}", to_js_string(map_name), to_js_string(round_number));
        if self.round_key.as_ref().is_some_and(|k| *k != key) {
            self.round_at = Some(now);
        }
        self.round_key = Some(key);
        let round_at = self.round_at.unwrap_or(f64::NEG_INFINITY);
        let Some(Value::Array(teams)) = state.get_mut("players") else {
            return;
        };
        for team in teams.iter_mut() {
            let players: Vec<&mut Value> = match team {
                Value::Array(list) => list.iter_mut().collect(),
                other => vec![other],
            };
            for player in players {
                let Value::Object(player) = player else {
                    continue;
                };
                let Some(Value::String(puuid)) = player.get("puuid") else {
                    continue;
                };
                let Some(data) = self.players.get(puuid) else {
                    continue;
                };
                apply_player(player, data, round_at);
            }
        }
    }
}

fn apply_player(player: &mut Map<String, Value>, data: &PlayerData, round_at: f64) {
    let hp_known = data.health_at.is_some_and(|at| at >= round_at);
    player.insert("hpKnown".into(), Value::Bool(hp_known));
    if hp_known {
        player.insert("hp".into(), num(data.health.unwrap_or(f64::NAN)));
    }
    let abilities_known = data.abilities_at.is_some_and(|at| at >= round_at);
    player.insert("abilitiesKnown".into(), Value::Bool(abilities_known));
    if abilities_known {
        let availability = data.availability.clone().unwrap_or_default();
        player.insert("abilityAvailability".into(), json!(availability));
        player.insert(
            "chargesKnown".into(),
            Value::Bool(data.exact_charges.is_some()),
        );
        if let Some(charges) = &data.exact_charges {
            player.insert(
                "charges".into(),
                Value::Array(charges.iter().map(|c| num(*c)).collect()),
            );
        }
    } else {
        player.shift_remove("abilityAvailability");
        player.insert("chargesKnown".into(), Value::Bool(false));
    }
    let at = |v: Option<f64>| v.map(num).unwrap_or(Value::Null);
    let mut coverage = Map::new();
    if let Some(last) = data.last_seen_at {
        coverage.insert("lastSeenAt".into(), num(last));
    }
    coverage.insert("healthAt".into(), at(data.health_at));
    coverage.insert("abilitiesAt".into(), at(data.abilities_at));
    player.insert("captureCoverage".into(), Value::Object(coverage));
}
