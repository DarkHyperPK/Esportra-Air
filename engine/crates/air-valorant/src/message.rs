//! Flattens every Overwolf message shape into info updates and game events.
//!
//! Accepted shapes (see `adapters/valorant-gep.js`):
//!   `{ info: { match_info: { round_number: "3" } }, feature: "match_info" }`
//!   `{ feature: "match_info", key: "scoreboard_0", data|value: "{…json…}" }`
//!   `{ events: [ { name: "kill_feed", data: "{…json…}" } ] }`
//! Player-PC messages add `playerId`.

use air_state::js::{get, object_keys, parse_if_string, truthy};
use serde_json::Value;

/// One info update. `key` is kept raw: JavaScript compares it strictly with string literals.
#[derive(Debug, Clone)]
pub struct Info {
    pub key: Value,
    pub value: Option<Value>,
}

impl Info {
    pub fn key_is(&self, name: &str) -> bool {
        self.key.as_str() == Some(name)
    }
}

#[derive(Debug, Clone)]
pub struct Event {
    pub name: Option<Value>,
    pub data: Option<Value>,
}

impl Event {
    pub fn is(&self, name: &str) -> bool {
        self.name.as_ref().and_then(Value::as_str) == Some(name)
    }
}

#[derive(Debug)]
pub struct Normalized<'a> {
    pub infos: Vec<Info>,
    pub events: Vec<Event>,
    pub player_id: Option<&'a Value>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MalformedMessage(pub &'static str);

/// Children of a value as JavaScript `for…in` visits them.
fn entries(v: &Value) -> Vec<(String, &Value)> {
    match v {
        Value::Object(map) => object_keys(map)
            .into_iter()
            .map(|k| (k.clone(), &map[k]))
            .collect(),
        Value::Array(items) => items
            .iter()
            .enumerate()
            .map(|(i, v)| (i.to_string(), v))
            .collect(),
        _ => Vec::new(),
    }
}

pub fn normalize(msg: &Value) -> Result<Normalized<'_>, MalformedMessage> {
    let msg_ref = Some(msg);
    let mut infos = Vec::new();
    let mut events = Vec::new();
    if let Some(info) = get(msg_ref, "info").filter(|v| truthy(Some(v))) {
        for (_, category) in entries(info) {
            for (key, value) in entries(category) {
                infos.push(Info {
                    key: Value::String(key),
                    value: parse_if_string(Some(value)),
                });
            }
        }
    }
    let key = get(msg_ref, "key");
    if truthy(key) {
        let data = get(msg_ref, "data");
        let raw = if data.is_some() {
            data
        } else {
            get(msg_ref, "value")
        };
        infos.push(Info {
            key: key.cloned().unwrap_or(Value::Null),
            value: parse_if_string(raw),
        });
    }
    let list = get(msg_ref, "events");
    if truthy(list) {
        match list {
            Some(Value::Array(items)) => {
                for e in items {
                    if e.is_null() {
                        return Err(MalformedMessage("event entry is null"));
                    }
                    events.push(Event {
                        name: get(Some(e), "name").cloned(),
                        data: parse_if_string(get(Some(e), "data")),
                    });
                }
            }
            // A string iterates characters, none of which carry an event name.
            Some(Value::String(_)) => {}
            _ => return Err(MalformedMessage("events is not a list")),
        }
    }
    let name = get(msg_ref, "name");
    if truthy(name) && !truthy(key) && !truthy(list) {
        events.push(Event {
            name: name.cloned(),
            data: parse_if_string(get(msg_ref, "data")),
        });
    }
    Ok(Normalized {
        infos,
        events,
        player_id: get(msg_ref, "playerId"),
    })
}
