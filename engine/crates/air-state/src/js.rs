//! JavaScript value semantics over `serde_json::Value`.
//!
//! The HUD state and the Overwolf messages are schemaless JSON, and the original parser relies on
//! JavaScript coercions (`+v`, `!!v`, `String(v)`, `a || b`). These helpers reproduce those rules
//! so the Rust port behaves the same on the same input. `None` stands for JavaScript `undefined`.

use serde_json::{Map, Number, Value};

/// JavaScript truthiness (`!!v`).
pub fn truthy(v: Option<&Value>) -> bool {
    match v {
        None | Some(Value::Null) => false,
        Some(Value::Bool(b)) => *b,
        Some(Value::Number(n)) => {
            let f = n.as_f64().unwrap_or(0.0);
            f != 0.0 && !f.is_nan()
        }
        Some(Value::String(s)) => !s.is_empty(),
        Some(Value::Array(_)) | Some(Value::Object(_)) => true,
    }
}

/// JavaScript `a || b`: the first value if truthy, otherwise the second.
pub fn or<'a>(a: Option<&'a Value>, b: Option<&'a Value>) -> Option<&'a Value> {
    if truthy(a) {
        a
    } else {
        b
    }
}

fn is_js_whitespace(c: char) -> bool {
    c.is_whitespace() || c == '\u{feff}'
}

/// JavaScript `String.prototype.trim`.
pub fn trim(s: &str) -> &str {
    s.trim_matches(is_js_whitespace)
}

/// JavaScript `Number(string)`.
pub fn string_to_number(s: &str) -> f64 {
    let t = trim(s);
    if t.is_empty() {
        return 0.0;
    }
    let radix = |prefix: &str, radix: u32| -> Option<f64> {
        let digits = t
            .strip_prefix(prefix)
            .or_else(|| t.strip_prefix(&prefix.to_uppercase()))?;
        if digits.is_empty() {
            return Some(f64::NAN);
        }
        Some(
            u128::from_str_radix(digits, radix)
                .map(|n| n as f64)
                .unwrap_or(f64::NAN),
        )
    };
    if let Some(n) = radix("0x", 16)
        .or_else(|| radix("0o", 8))
        .or_else(|| radix("0b", 2))
    {
        return n;
    }
    match t {
        "Infinity" | "+Infinity" => return f64::INFINITY,
        "-Infinity" => return f64::NEG_INFINITY,
        _ => {}
    }
    // Rust accepts "inf", "nan" and "infinity"; JavaScript does not.
    if t.chars()
        .any(|c| c.is_ascii_alphabetic() && c != 'e' && c != 'E')
    {
        return f64::NAN;
    }
    t.parse::<f64>().unwrap_or(f64::NAN)
}

/// JavaScript `Number(v)` / unary `+v`.
pub fn to_number(v: Option<&Value>) -> f64 {
    match v {
        None => f64::NAN,
        Some(Value::Null) => 0.0,
        Some(Value::Bool(b)) => f64::from(u8::from(*b)),
        Some(Value::Number(n)) => n.as_f64().unwrap_or(f64::NAN),
        Some(Value::String(s)) => string_to_number(s),
        Some(Value::Array(a)) => match a.len() {
            0 => 0.0,
            1 => string_to_number(&to_js_string(a.first())),
            _ => f64::NAN,
        },
        Some(Value::Object(_)) => f64::NAN,
    }
}

/// JavaScript `+v || 0`.
pub fn number_or_zero(v: Option<&Value>) -> f64 {
    let n = to_number(v);
    if n.is_nan() || n == 0.0 {
        0.0
    } else {
        n
    }
}

/// JavaScript number to string (`String(1)`, `String(0.5)`).
pub fn number_to_string(n: f64) -> String {
    if n.is_nan() {
        "NaN".into()
    } else if n.is_infinite() {
        if n > 0.0 { "Infinity" } else { "-Infinity" }.into()
    } else if n == n.trunc() && n.abs() < 1e21 {
        format!("{}", n as i128)
    } else {
        format!("{n}")
    }
}

/// JavaScript `String(v)`.
pub fn to_js_string(v: Option<&Value>) -> String {
    match v {
        None => "undefined".into(),
        Some(Value::Null) => "null".into(),
        Some(Value::Bool(b)) => b.to_string(),
        Some(Value::Number(n)) => number_to_string(n.as_f64().unwrap_or(f64::NAN)),
        Some(Value::String(s)) => s.clone(),
        Some(Value::Array(a)) => a
            .iter()
            .map(|item| match item {
                Value::Null => String::new(),
                other => to_js_string(Some(other)),
            })
            .collect::<Vec<_>>()
            .join(","),
        Some(Value::Object(_)) => "[object Object]".into(),
    }
}

/// A JavaScript number as a JSON value, as `JSON.stringify` would write it (NaN and ±Infinity → null).
pub fn num(n: f64) -> Value {
    if !n.is_finite() {
        Value::Null
    } else if n == n.trunc() && n.abs() < 9_007_199_254_740_992.0 {
        Value::Number(Number::from(n as i64))
    } else {
        Number::from_f64(n)
            .map(Value::Number)
            .unwrap_or(Value::Null)
    }
}

/// JavaScript `JSON.parse` when given a string; other values pass through (the adapter's `parse`).
pub fn parse_if_string(v: Option<&Value>) -> Option<Value> {
    match v {
        Some(Value::String(s)) => {
            Some(serde_json::from_str(s).unwrap_or_else(|_| Value::String(s.clone())))
        }
        other => other.cloned(),
    }
}

/// `String.prototype.slice(0, n)` on UTF-16 code units.
pub fn slice_utf16(s: &str, n: usize) -> String {
    let units: Vec<u16> = s.encode_utf16().take(n).collect();
    String::from_utf16_lossy(&units)
}

/// True for a canonical array-index key ("0", "1", … not "01").
fn array_index(key: &str) -> Option<u32> {
    if key.is_empty()
        || (key.len() > 1 && key.starts_with('0'))
        || !key.bytes().all(|b| b.is_ascii_digit())
    {
        return None;
    }
    key.parse::<u32>().ok().filter(|n| *n != u32::MAX)
}

/// `Object.keys` order: integer keys ascending, then string keys in insertion order.
pub fn object_keys(map: &Map<String, Value>) -> Vec<&String> {
    let mut indexed: Vec<(u32, &String)> = map
        .keys()
        .filter_map(|k| array_index(k).map(|i| (i, k)))
        .collect();
    indexed.sort_by_key(|(i, _)| *i);
    indexed
        .into_iter()
        .map(|(_, k)| k)
        .chain(map.keys().filter(|k| array_index(k).is_none()))
        .collect()
}

/// `Object.values(v)` for an object or array.
pub fn object_values(v: &Value) -> Vec<&Value> {
    match v {
        Value::Object(map) => object_keys(map).into_iter().map(|k| &map[k]).collect(),
        Value::Array(items) => items.iter().collect(),
        // Callers only pass objects/arrays; primitives have no own enumerable values here.
        _ => Vec::new(),
    }
}

/// `obj[key]` for objects (string key) and arrays (numeric key).
pub fn get<'a>(v: Option<&'a Value>, key: &str) -> Option<&'a Value> {
    match v? {
        Value::Object(map) => map.get(key),
        Value::Array(items) => array_index(key).and_then(|i| items.get(i as usize)),
        _ => None,
    }
}

/// Sets `obj[key] = value`; `None` (JavaScript `undefined`) removes it, matching what `JSON.stringify` keeps.
pub fn set(obj: &mut Map<String, Value>, key: &str, value: Option<Value>) {
    match value {
        Some(v) => {
            obj.insert(key.to_string(), v);
        }
        None => {
            obj.shift_remove(key);
        }
    }
}

/// Numeric equality across integer and float JSON representations, everywhere else structural.
pub fn json_eq(a: &Value, b: &Value) -> bool {
    match (a, b) {
        (Value::Number(x), Value::Number(y)) => x.as_f64() == y.as_f64(),
        (Value::Array(x), Value::Array(y)) => {
            x.len() == y.len() && x.iter().zip(y).all(|(a, b)| json_eq(a, b))
        }
        (Value::Object(x), Value::Object(y)) => {
            x.len() == y.len()
                && x.iter()
                    .all(|(k, v)| y.get(k).is_some_and(|w| json_eq(v, w)))
        }
        _ => a == b,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn numbers_follow_javascript() {
        assert_eq!(to_number(Some(&json!(" 42 "))), 42.0);
        assert_eq!(to_number(Some(&json!(""))), 0.0);
        assert!(to_number(Some(&json!("abc"))).is_nan());
        assert!(to_number(Some(&json!("inf"))).is_nan());
        assert_eq!(to_number(Some(&json!("0x10"))), 16.0);
        assert_eq!(to_number(Some(&json!(true))), 1.0);
        assert_eq!(to_number(Some(&Value::Null)), 0.0);
        assert!(to_number(None).is_nan());
        assert_eq!(to_number(Some(&json!(["7"]))), 7.0);
        assert_eq!(number_or_zero(Some(&json!("x"))), 0.0);
    }

    #[test]
    fn strings_and_truthiness() {
        assert_eq!(to_js_string(Some(&json!(3.0))), "3");
        assert_eq!(to_js_string(Some(&json!(0.5))), "0.5");
        assert_eq!(to_js_string(Some(&json!([1, null, "a"]))), "1,,a");
        assert!(!truthy(Some(&json!(0))));
        assert!(truthy(Some(&json!("false"))));
        assert!(truthy(Some(&json!({}))));
        assert_eq!(slice_utf16("ab😀c", 3), "ab\u{fffd}");
        assert_eq!(trim("\u{feff} x "), "x");
    }

    #[test]
    fn object_values_use_javascript_key_order() {
        let v: Value = serde_json::from_str(r#"{"b":1,"1":2,"0":3,"a":4,"01":5}"#).unwrap();
        let values: Vec<i64> = object_values(&v)
            .iter()
            .map(|v| v.as_i64().unwrap())
            .collect();
        assert_eq!(values, vec![3, 2, 1, 4, 5]);
    }

    #[test]
    fn num_matches_json_stringify() {
        assert_eq!(num(f64::NAN), Value::Null);
        assert_eq!(num(3.0), json!(3));
        assert_eq!(num(0.25), json!(0.25));
        assert!(json_eq(&json!({"a": [1, 2.0]}), &json!({"a": [1.0, 2]})));
    }
}
