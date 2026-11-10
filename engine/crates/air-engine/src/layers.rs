//! Graphic layers (PRD picture 8): each layer is On, Off, or Auto (controlled by rules until the
//! producer overrides it). The engine owns the modes in `state.airLayers` and writes the HUD's
//! `state.show.*` flags from them, so the console, hotkeys and external controllers all agree.
//!
//! Auto means different things per layer, because the HUD already gates several graphics by round
//! phase: economy and round recap use the HUD's own `'auto'` tri-state; spike timer, win probability
//! and the sponsor bug are simply allowed (the HUD shows them in the right phase); the lower third
//! is driven by rules (multi-kill callouts) and by one-click triggers.

use serde_json::{json, Map, Value};

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Mode {
    On,
    Off,
    Auto,
}

impl Mode {
    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "on" => Some(Mode::On),
            "off" => Some(Mode::Off),
            "auto" => Some(Mode::Auto),
            _ => None,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Mode::On => "on",
            Mode::Off => "off",
            Mode::Auto => "auto",
        }
    }
}

pub struct LayerDef {
    pub key: &'static str,
    pub default: Mode,
    /// Whether Auto is meaningful for this layer.
    pub auto: bool,
}

/// The layers the console controls, in PRD order (In-game 1–8, then Between rounds).
pub const LAYERS: [LayerDef; 16] = [
    LayerDef {
        key: "scorebug",
        default: Mode::On,
        auto: false,
    },
    LayerDef {
        key: "players",
        default: Mode::On,
        auto: false,
    },
    LayerDef {
        key: "killfeed",
        default: Mode::On,
        auto: false,
    },
    LayerDef {
        key: "observed",
        default: Mode::On,
        auto: false,
    },
    LayerDef {
        key: "minimap",
        default: Mode::Off,
        auto: false,
    },
    LayerDef {
        key: "winProb",
        default: Mode::On,
        auto: false,
    },
    LayerDef {
        key: "spikeTimer",
        default: Mode::Auto,
        auto: true,
    },
    LayerDef {
        key: "sponsor",
        default: Mode::Auto,
        auto: true,
    },
    LayerDef {
        key: "economy",
        default: Mode::Auto,
        auto: true,
    },
    LayerDef {
        key: "roundRecap",
        default: Mode::Auto,
        auto: true,
    },
    LayerDef {
        key: "scoreboard",
        default: Mode::Off,
        auto: false,
    },
    LayerDef {
        key: "duel",
        default: Mode::Off,
        auto: false,
    },
    LayerDef {
        key: "teamCompare",
        default: Mode::Off,
        auto: false,
    },
    LayerDef {
        key: "lowerThird",
        default: Mode::Auto,
        auto: true,
    },
    LayerDef {
        key: "ticker",
        default: Mode::On,
        auto: false,
    },
    LayerDef {
        key: "poll",
        default: Mode::Off,
        auto: false,
    },
];

pub fn def(key: &str) -> Option<&'static LayerDef> {
    LAYERS.iter().find(|l| l.key == key)
}

pub fn defaults() -> Map<String, Value> {
    LAYERS
        .iter()
        .map(|l| (l.key.to_string(), json!(l.default.as_str())))
        .collect()
}

fn mode_of(state: &Value, key: &str) -> Option<Mode> {
    state
        .get("airLayers")?
        .get(key)?
        .as_str()
        .and_then(Mode::parse)
}

/// The mode a legacy `show` value stands for.
fn from_show(layer: &LayerDef, value: &Value) -> Mode {
    match value {
        Value::Bool(false) => Mode::Off,
        Value::String(s) if s == "auto" && layer.auto => Mode::Auto,
        _ => Mode::On,
    }
}

/// Writes the HUD flags for every managed layer from `state.airLayers`.
fn write_show(state: &mut Value) {
    let auto_lower = state
        .get("airAuto")
        .and_then(|a| a.get("lowerThird"))
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let modes: Vec<(&'static str, Mode)> = LAYERS
        .iter()
        .map(|l| (l.key, mode_of(state, l.key).unwrap_or(l.default)))
        .collect();
    let Some(root) = state.as_object_mut() else {
        return;
    };
    let show = root.entry("show").or_insert_with(|| json!({}));
    let Some(show) = show.as_object_mut() else {
        return;
    };
    for (key, mode) in modes {
        let value = match (key, mode) {
            (_, Mode::On) => json!(true),
            (_, Mode::Off) => json!(false),
            ("economy" | "roundRecap", Mode::Auto) => json!("auto"),
            ("lowerThird", Mode::Auto) => json!(auto_lower),
            (_, Mode::Auto) => json!(true),
        };
        show.insert(key.to_string(), value);
    }
}

/// Brings `next` in line with the layer modes before it is applied.
///
/// - A state with no modes yet (a full state loaded with PUT) takes its modes from its `show` flags.
/// - A write to a `show` flag without a matching mode change (an older control panel, the HUD's own
///   tools) becomes a manual override, so it is not silently reverted.
pub fn sync(prev: &Value, next: &mut Value) {
    if !next.get("airLayers").is_some_and(Value::is_object) {
        let derived: Map<String, Value> = LAYERS
            .iter()
            .map(|l| {
                let mode = next
                    .get("show")
                    .and_then(|s| s.get(l.key))
                    .map(|v| from_show(l, v))
                    .unwrap_or(l.default);
                (l.key.to_string(), json!(mode.as_str()))
            })
            .collect();
        next["airLayers"] = Value::Object(derived);
    } else {
        for l in &LAYERS {
            let before = prev.get("show").and_then(|s| s.get(l.key));
            let after = next.get("show").and_then(|s| s.get(l.key));
            let modes_equal = prev.get("airLayers").and_then(|m| m.get(l.key))
                == next.get("airLayers").and_then(|m| m.get(l.key));
            if let (Some(before), Some(after)) = (before, after) {
                if before != after && modes_equal {
                    next["airLayers"][l.key] = json!(from_show(l, after).as_str());
                }
            }
            if next["airLayers"].get(l.key).is_none() {
                next["airLayers"][l.key] = json!(l.default.as_str());
            }
        }
    }
    write_show(next);
}

/// Sets one layer's mode. Auto is only allowed where it means something.
pub fn set_mode(state: &mut Value, key: &str, mode: Mode) -> Result<(), String> {
    let layer =
        def(key).ok_or_else(|| "Choose one of the console's graphic layers.".to_string())?;
    if mode == Mode::Auto && !layer.auto {
        return Err(format!("{key} has no automatic mode."));
    }
    if !state.get("airLayers").is_some_and(Value::is_object) {
        state["airLayers"] = Value::Object(defaults());
    }
    state["airLayers"][key] = json!(mode.as_str());
    if key == "lowerThird" && mode != Mode::Auto {
        state["airAuto"] = json!({ "lowerThird": false });
    }
    Ok(())
}

/// At the next segment (a new match starting), manual overrides on automatic layers go back to Auto.
pub fn clear_overrides(state: &mut Value) {
    for l in LAYERS.iter().filter(|l| l.auto) {
        state["airLayers"][l.key] = json!("auto");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fresh() -> Value {
        let mut s = json!({ "show": {}, "airLayers": defaults() });
        write_show(&mut s);
        s
    }

    #[test]
    fn modes_write_the_hud_flags() {
        let s = fresh();
        assert_eq!(s["show"]["scorebug"], json!(true));
        assert_eq!(s["show"]["scoreboard"], json!(false));
        assert_eq!(s["show"]["economy"], json!("auto"));
        assert_eq!(s["show"]["roundRecap"], json!("auto"));
        assert_eq!(s["show"]["spikeTimer"], json!(true));
        assert_eq!(s["show"]["lowerThird"], json!(false));
    }

    #[test]
    fn auto_only_where_it_means_something() {
        let mut s = fresh();
        assert!(set_mode(&mut s, "scorebug", Mode::Auto).is_err());
        assert!(set_mode(&mut s, "nonsense", Mode::On).is_err());
        set_mode(&mut s, "economy", Mode::Off).unwrap();
        let prev = s.clone();
        sync(&prev, &mut s);
        assert_eq!(s["show"]["economy"], json!(false));
        set_mode(&mut s, "economy", Mode::Auto).unwrap();
        sync(&prev, &mut s);
        assert_eq!(s["show"]["economy"], json!("auto"));
    }

    #[test]
    fn a_legacy_show_write_becomes_a_manual_override() {
        let prev = fresh();
        let mut next = prev.clone();
        next["show"]["poll"] = json!(true);
        next["show"]["economy"] = json!(false);
        sync(&prev, &mut next);
        assert_eq!(next["airLayers"]["poll"], json!("on"));
        assert_eq!(next["airLayers"]["economy"], json!("off"));
        assert_eq!(next["show"]["poll"], json!(true), "not reverted");
    }

    #[test]
    fn a_full_state_without_modes_derives_them() {
        let prev = fresh();
        let mut next = json!({ "show": { "scorebug": false, "economy": "auto", "spikeTimer": true, "poll": true } });
        sync(&prev, &mut next);
        assert_eq!(next["airLayers"]["scorebug"], json!("off"));
        assert_eq!(next["airLayers"]["economy"], json!("auto"));
        assert_eq!(next["airLayers"]["poll"], json!("on"));
        assert_eq!(next["show"]["poll"], json!(true));
    }

    #[test]
    fn overrides_return_to_auto_at_the_next_segment() {
        let mut s = fresh();
        set_mode(&mut s, "economy", Mode::On).unwrap();
        set_mode(&mut s, "sponsor", Mode::Off).unwrap();
        set_mode(&mut s, "poll", Mode::On).unwrap();
        clear_overrides(&mut s);
        assert_eq!(s["airLayers"]["economy"], json!("auto"));
        assert_eq!(s["airLayers"]["sponsor"], json!("auto"));
        assert_eq!(
            s["airLayers"]["poll"],
            json!("on"),
            "manual-only layers stay as they are"
        );
    }
}
