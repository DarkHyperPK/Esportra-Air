//! Which game features a batch of raw GEP messages reports, ported from `server/gep-features.js`.
//! Used for feed freshness: player-PC heartbeats alone do not make the observer feed fresh.

use std::collections::HashSet;

use serde_json::Value;

pub fn reported_features(messages: &[Value]) -> Vec<&'static str> {
    let mut keys: HashSet<String> = HashSet::new();
    let mut events: HashSet<String> = HashSet::new();
    for message in messages {
        if let Some(key) = message
            .get("key")
            .filter(|k| air_state::js::truthy(Some(k)))
        {
            keys.insert(air_state::js::to_js_string(Some(key)));
        }
        if let Some(Value::Object(info)) = message.get("info") {
            for category in info.values() {
                if let Value::Object(category) = category {
                    keys.extend(category.keys().cloned());
                }
            }
        }
        if let Some(Value::Array(list)) = message.get("events") {
            for name in list
                .iter()
                .filter_map(|e| e.get("name"))
                .filter_map(Value::as_str)
                .filter(|n| !n.is_empty())
            {
                events.insert(name.to_string());
            }
        }
        if let Some(Value::String(name)) = message
            .get("name")
            .filter(|n| air_state::js::truthy(Some(n)))
        {
            events.insert(name.clone());
        }
        if message.get("captureHeartbeat") == Some(&Value::Bool(true)) {
            keys.insert("player_capture".into());
        }
    }
    let has = |k: &str| keys.contains(k);
    let scoreboard = keys.iter().any(|k| {
        k.strip_prefix("scoreboard_")
            .is_some_and(|n| !n.is_empty() && n.bytes().all(|b| b.is_ascii_digit()))
    });
    let spike = has("planted_location")
        || events
            .iter()
            .any(|n| n.starts_with("spike_") || n == "planted_location");
    [
        (has("match_score"), "score"),
        (has("round_phase") || has("round_number"), "round"),
        (scoreboard, "players"),
        (scoreboard, "credits"),
        (spike, "spike"),
        (
            has("health") || has("abilities") || has("player_capture"),
            "playerCapture",
        ),
        (has("map"), "map"),
        (has("observing"), "observed"),
    ]
    .into_iter()
    .filter_map(|(on, name)| on.then_some(name))
    .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn reports_features_like_the_js_helper() {
        let messages = [
            json!({ "info": { "match_info": { "round_phase": "combat", "scoreboard_3": "{}" } } }),
            json!({ "events": [{ "name": "spike_defused" }] }),
            json!({ "playerId": "x", "captureHeartbeat": true }),
        ];
        assert_eq!(
            reported_features(&messages),
            vec!["round", "players", "credits", "spike", "playerCapture"]
        );
        assert!(reported_features(&[json!({ "key": "map", "data": "Jam" })]) == vec!["map"]);
    }
}
