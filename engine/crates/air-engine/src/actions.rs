//! Named actions: every operator action that changes graphics, as one call (`POST /control/action`).
//!
//! The Air window, its hotkeys and any external controller (Stream Deck, Companion, a script) all use
//! these, so they behave identically and keep working while the window is closed. Validation matches
//! the legacy `src/graphic-actions.js`: plain text only, bounded lengths.

use std::sync::Arc;

use serde_json::{json, Value};

use crate::engine::{now_ms, Room};
use crate::fixes::plain_text;
use crate::layers::{self, Mode};

fn text(args: &Value, key: &str, max: usize, label: &str) -> Result<String, String> {
    let v = args.get(key);
    if !plain_text(v, max) {
        return Err(format!(
            "{label}: enter plain text, up to {max} characters."
        ));
    }
    Ok(air_state::js::trim(v.and_then(Value::as_str).unwrap_or("")).to_string())
}

fn slot(args: &Value, key: &str, max: i64) -> Result<i64, String> {
    args.get(key)
        .and_then(Value::as_f64)
        .filter(|n| *n == n.trunc() && *n >= 0.0 && *n <= max as f64)
        .map(|n| n as i64)
        .ok_or_else(|| "Choose a team and player slot.".to_string())
}

fn show_lower_third(state: &mut Value, content: Value) -> Result<(), String> {
    state["lowerThird"] = content;
    layers::set_mode(state, "lowerThird", Mode::On)
}

/// Runs one named action and returns the new state version.
pub fn run(room: &Arc<Room>, name: &str, args: &Value) -> Result<u64, String> {
    let source = format!("action:{name}");
    room.mutate(&source, |state| match name {
        "layer.set" => {
            let layer = args.get("layer").and_then(Value::as_str).unwrap_or("");
            let mode = args.get("mode").and_then(Value::as_str).and_then(Mode::parse).ok_or("Choose On, Off or Auto.")?;
            layers::set_mode(state, layer, mode)
        }
        // Applies only once per match, so a producer's changes during the show are never reset.
        "layers.init" => {
            if state.get("airInit").and_then(Value::as_bool).unwrap_or(false) {
                return Ok(());
            }
            let modes = args.get("modes").and_then(Value::as_object).ok_or("Provide layer modes.")?;
            for (layer, mode) in modes {
                if let Some(mode) = mode.as_str().and_then(Mode::parse) {
                    // A mode a layer cannot have is ignored here; setup only sends on/off.
                    let _ = layers::set_mode(state, layer, mode);
                }
            }
            state["airInit"] = json!(true);
            Ok(())
        }
        "toast.show" => {
            state["toast"] = json!({ "text": text(args, "text", 180, "Update")?, "ts": air_state::js::num(now_ms()) });
            Ok(())
        }
        "poll.show" => {
            let question = text(args, "question", 120, "Question")?;
            let options = args.get("options").and_then(Value::as_array).filter(|o| o.len() == 2).ok_or("Enter two poll options.")?;
            let labels: Vec<String> = options
                .iter()
                .map(|o| {
                    let v = Some(o);
                    if plain_text(v, 40) { Ok(air_state::js::trim(o.as_str().unwrap_or("")).to_string()) } else { Err("Option: enter plain text, up to 40 characters.".to_string()) }
                })
                .collect::<Result<_, _>>()?;
            if labels[0].to_lowercase() == labels[1].to_lowercase() {
                return Err("Poll options must differ.".into());
            }
            let first = slot(args, "firstPercent", 100).map_err(|_| "Use a whole percentage from 0 to 100.".to_string())?;
            state["poll"] = json!({ "question": question, "options": [{ "label": labels[0], "pct": first }, { "label": labels[1], "pct": 100 - first }], "votes": 0 });
            layers::set_mode(state, "poll", Mode::On)
        }
        "poll.hide" => layers::set_mode(state, "poll", Mode::Off),
        "lowerthird.caster" => show_lower_third(state, json!({ "kind": "caster", "title": "", "sub": "", "team": 0, "player": 0 })),
        "lowerthird.generic" => {
            let title = text(args, "title", 100, "Title")?;
            let sub = if args.get("sub").is_some_and(|s| !s.as_str().unwrap_or("").is_empty()) { text(args, "sub", 160, "Subtitle")? } else { String::new() };
            let team = args.get("team").and_then(Value::as_i64).filter(|t| (-1..=1).contains(t)).unwrap_or(-1);
            show_lower_third(state, json!({ "kind": "generic", "title": title, "sub": sub, "team": team, "player": 0 }))
        }
        "lowerthird.player" => {
            let (team, player) = (slot(args, "team", 1)?, slot(args, "player", 4)?);
            show_lower_third(state, json!({ "kind": "player", "title": "", "sub": "", "team": team, "player": player }))
        }
        // Back to Auto: the callout rules may use it again, and a manual one is hidden.
        "lowerthird.hide" => {
            layers::set_mode(state, "lowerThird", Mode::Auto)?;
            state["airAuto"] = json!({ "lowerThird": false });
            Ok(())
        }
        "spotlight.set" => {
            let (team, player) = (slot(args, "team", 1)?, slot(args, "player", 4)?);
            if !state.get("spotlight").is_some_and(Value::is_object) {
                state["spotlight"] = json!({});
            }
            state["spotlight"]["team"] = json!(team);
            state["spotlight"]["player"] = json!(player);
            Ok(())
        }
        "stinger.play" => {
            state["stinger"] = air_state::js::num(now_ms());
            Ok(())
        }
        // Player cameras: which VDO.Ninja stream sits in each of the ten player frames, and how they are laid out.
        "cams.set" => cams_set(state, args),
        // The full-screen host page shows this graphic (null hides it).
        "fullscreen.show" => {
            let screen = args.get("screen").cloned().unwrap_or(Value::Null);
            match &screen {
                Value::Null => {}
                Value::String(s) if FULLSCREEN.contains(&s.as_str()) => {}
                // One of the producer's own graphics (state.airOwn), by its id.
                Value::String(s) if s.strip_prefix("own:").is_some_and(|id| uuid::Uuid::parse_str(id).is_ok() && id.len() == 36) => {}
                _ => return Err("Choose one of the full-screen graphics.".into()),
            }
            // "band" shows the over-the-game version (core/bands.js); anything else is full screen.
            let style = match args.get("style").and_then(Value::as_str) {
                None | Some("full") => "full",
                Some("band") => "band",
                Some(_) => return Err("Choose full screen or over the game.".into()),
            };
            // A saved look from Air's Templates (its parts are in state.airTemplates); none is the default look.
            let template = match args.get("template") {
                None | Some(Value::Null) => Value::Null,
                Some(Value::String(t)) if (1..=40).contains(&t.len()) && t.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-') => Value::String(t.clone()),
                Some(_) => return Err("Choose a saved template.".into()),
            };
            state["airFullscreen"] = screen;
            state["airFullscreenStyle"] = Value::String(style.into());
            state["airFullscreenTemplate"] = template;
            Ok(())
        }
        _ => Err("Unknown action.".into()),
    })
}

/// The graphics the full-screen host page can show (`overlays/fullscreen.html`).
const FULLSCREEN: [&str; 29] = ["match-intro", "map-veto", "agent-select", "map-result", "series", "halftime", "standings", "player-profile", "champion", "cam-grid", "schedule", "bracket", "map-breakdown", "postgame-player", "postgame-matchup", "br-lobby", "br-today", "br-rankings", "br-overall", "br-wwcd", "br-mvp", "br-champion", "br-teams", "br-drop", "br-fraggers", "br-tom", "br-profile", "br-mstats", "br-pvp"];

fn camera_id(v: &Value) -> Result<Value, String> {
    match v {
        Value::Null => Ok(Value::Null),
        Value::String(s) if (6..=40).contains(&s.len()) && s.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-') => Ok(v.clone()),
        _ => Err("A camera link id uses letters, numbers, - and _ (6–40 characters).".into()),
    }
}

/// `{ layout?: "ingame"|"grid5"|"grid10", delayMs?: 0..=10000, slots?: [[id|null; 5]; 2] }`, each part optional.
fn cams_set(state: &mut Value, args: &Value) -> Result<(), String> {
    if !state.get("airCams").is_some_and(Value::is_object) {
        state["airCams"] = json!({ "layout": "ingame", "delayMs": 0, "slots": [[null, null, null, null, null], [null, null, null, null, null]] });
    }
    if let Some(layout) = args.get("layout") {
        match layout.as_str() {
            Some("ingame" | "grid5" | "grid10") => state["airCams"]["layout"] = layout.clone(),
            _ => return Err("Choose In-game, 5-up or 10-up.".into()),
        }
    }
    if let Some(delay) = args.get("delayMs") {
        let ms = delay.as_f64().filter(|n| *n == n.trunc() && (0.0..=10_000.0).contains(n)).ok_or("Camera delay is 0–10,000 ms.")?;
        state["airCams"]["delayMs"] = json!(ms as u64);
    }
    if let Some(slots) = args.get("slots") {
        let teams = slots.as_array().filter(|t| t.len() == 2 && t.iter().all(|x| x.as_array().is_some_and(|a| a.len() == 5))).ok_or("Provide five camera slots per team.")?;
        let clean: Result<Vec<Vec<Value>>, String> = teams.iter().map(|t| t.as_array().into_iter().flatten().map(camera_id).collect()).collect();
        state["airCams"]["slots"] = json!(clean?);
    }
    // The in-game frames show when that layout has at least one camera; the camera wall has its own page.
    let any = state["airCams"]["slots"].as_array().is_some_and(|t| t.iter().flat_map(|x| x.as_array().into_iter().flatten()).any(|c| !c.is_null()));
    if !state.get("show").is_some_and(Value::is_object) {
        state["show"] = json!({});
    }
    state["show"]["playerCams"] = json!(any && state["airCams"]["layout"] == json!("ingame"));
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn text_is_plain_and_bounded() {
        assert!(text(&json!({ "t": "hello" }), "t", 10, "X").is_ok());
        assert!(text(&json!({ "t": "<b>" }), "t", 10, "X").is_err());
        assert!(text(&json!({ "t": "   " }), "t", 10, "X").is_err());
        assert!(text(&json!({ "t": "toolongvalue" }), "t", 5, "X").is_err());
        assert_eq!(slot(&json!({ "p": 3 }), "p", 4), Ok(3));
        assert!(slot(&json!({ "p": 5 }), "p", 4).is_err());
        assert!(slot(&json!({ "p": 1.5 }), "p", 4).is_err());
    }
}
