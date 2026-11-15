//! RFC 7386 JSON merge patch and its inverse, as used by the HUD WebSocket protocol.
//!
//! Mirrors `merge` and `diff` in `esportra-valorant-hud/server/server.js`: arrays are replaced
//! whole, `null` deletes a key, and `diff(a, b)` is the smallest patch that turns `a` into `b`.

use serde_json::{Map, Value};

use crate::js::json_eq;

/// Applies `patch` to `target` and returns the result.
pub fn merge(target: Value, patch: &Value) -> Value {
    let Value::Object(patch) = patch else {
        return patch.clone();
    };
    let mut target = match target {
        Value::Object(map) => map,
        _ => Map::new(),
    };
    for (key, value) in patch {
        if value.is_null() {
            target.shift_remove(key);
        } else if let Some(slot) = target.get_mut(key) {
            // In place, so the key keeps its position as a JavaScript assignment would.
            let current = std::mem::take(slot);
            *slot = merge(current, value);
        } else {
            target.insert(key.clone(), merge(Value::Null, value));
        }
    }
    Value::Object(target)
}

/// The smallest merge patch that turns `a` into `b`, or `None` when they are equal.
pub fn diff(a: &Value, b: &Value) -> Option<Value> {
    let empty = Map::new();
    let a_map = a.as_object().unwrap_or(&empty);
    let b_map = b.as_object().unwrap_or(&empty);
    let mut out = Map::new();
    let keys = a_map
        .keys()
        .chain(b_map.keys().filter(|k| !a_map.contains_key(*k)));
    for key in keys {
        match (a_map.get(key), b_map.get(key)) {
            (_, None) => {
                out.insert(key.clone(), Value::Null);
            }
            (Some(av @ Value::Object(_)), Some(bv @ Value::Object(_))) => {
                if let Some(d) = diff(av, bv) {
                    out.insert(key.clone(), d);
                }
            }
            (av, Some(bv)) => {
                if !av.is_some_and(|av| json_eq(av, bv)) {
                    out.insert(key.clone(), bv.clone());
                }
            }
        }
    }
    (!out.is_empty()).then_some(Value::Object(out))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn merge_replaces_arrays_and_deletes_nulls() {
        let a = json!({"a": {"b": 1, "c": 2}, "list": [1, 2], "gone": true});
        let p = json!({"a": {"c": null, "d": 4}, "list": [3], "gone": null});
        assert_eq!(merge(a, &p), json!({"a": {"b": 1, "d": 4}, "list": [3]}));
        assert_eq!(merge(json!(5), &json!({"x": 1})), json!({"x": 1}));
        assert_eq!(merge(json!({"x": 1}), &json!([1])), json!([1]));
    }

    #[test]
    fn diff_round_trips_through_merge() {
        let a = json!({"teams": [{"score": 1}], "round": {"number": 3, "phase": "buy"}, "old": 1});
        let b =
            json!({"teams": [{"score": 2}], "round": {"number": 3, "phase": "live"}, "new": [1]});
        let d = diff(&a, &b).unwrap();
        assert_eq!(
            d,
            json!({"teams": [{"score": 2}], "round": {"phase": "live"}, "old": null, "new": [1]})
        );
        assert_eq!(merge(a, &d), b);
        assert_eq!(diff(&b, &b), None);
        assert_eq!(diff(&json!({"n": 1}), &json!({"n": 1.0})), None);
    }
}
