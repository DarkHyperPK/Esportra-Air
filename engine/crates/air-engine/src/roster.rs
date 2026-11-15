//! Roster mapping: the producer's lineups (`state.airRoster`) put display names and photos on the
//! players the game reports.
//!
//! Air pushes `airRoster = [[{ gameId, name, photo }, …], [ … ]]` for the selected match, where
//! `gameId` is how the game knows the player (Valorant: Riot ID `Name#TAG`). After every change the
//! engine matches each player's `inGameName` to a `gameId` (ignoring case and spaces) and sets the
//! player's `name` and `photo`. Players the producer did not list keep their in-game name.

use std::collections::HashMap;

use serde_json::{json, Value};

fn norm(s: &str) -> String {
    s.chars().filter(|c| !c.is_whitespace()).flat_map(char::to_lowercase).collect()
}

pub fn apply(state: &mut Value) {
    let Some(roster) = state.get("airRoster").and_then(Value::as_array) else {
        return;
    };
    let mut known: HashMap<String, (Value, Value)> = HashMap::new();
    for team in roster.iter().filter_map(Value::as_array) {
        for p in team {
            let Some(id) = p.get("gameId").and_then(Value::as_str).filter(|s| !s.trim().is_empty()) else {
                continue;
            };
            let name = p.get("name").and_then(Value::as_str).filter(|s| !s.trim().is_empty());
            let photo = p.get("photo").and_then(Value::as_str).unwrap_or("");
            known.insert(norm(id), (name.map_or(Value::Null, |n| json!(n)), json!(photo)));
        }
    }
    if known.is_empty() {
        return;
    }
    let Some(teams) = state.get_mut("players").and_then(Value::as_array_mut) else {
        return;
    };
    for player in teams.iter_mut().filter_map(Value::as_array_mut).flatten() {
        let Some(found) = player.get("inGameName").and_then(Value::as_str).map(norm).and_then(|k| known.get(&k)) else {
            continue;
        };
        let (name, photo) = found.clone();
        if let Some(obj) = player.as_object_mut() {
            if !name.is_null() {
                obj.insert("name".into(), name);
            }
            obj.insert("photo".into(), photo);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn state() -> Value {
        json!({
            "players": [
                [{ "name": "JUNO", "inGameName": "Juno #EU1" }, { "name": "MIRA", "inGameName": "Mira#NA2" }],
                [{ "name": "KAIRO", "inGameName": "Kairo #X" }]
            ],
            "airRoster": [[{ "gameId": "juno#eu1", "name": "Juno Park", "photo": "/assets/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" }], [{ "gameId": "Kairo#X", "name": "", "photo": "" }]]
        })
    }

    #[test]
    fn listed_players_get_their_display_name_and_photo() {
        let mut s = state();
        apply(&mut s);
        assert_eq!(s["players"][0][0]["name"], json!("Juno Park"));
        assert_eq!(s["players"][0][0]["photo"], json!("/assets/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"));
        assert_eq!(s["players"][0][1]["name"], json!("MIRA"), "unlisted players keep their in-game name");
        assert!(s["players"][0][1].get("photo").is_none());
        assert_eq!(s["players"][1][0]["name"], json!("KAIRO"), "an empty display name keeps the in-game name");
        let again = s.clone();
        apply(&mut s);
        assert_eq!(s, again, "applying twice changes nothing");
    }

    #[test]
    fn no_roster_changes_nothing() {
        let mut s = json!({ "players": [[{ "name": "JUNO", "inGameName": "Juno #EU1" }]] });
        let before = s.clone();
        apply(&mut s);
        assert_eq!(s, before);
    }
}
