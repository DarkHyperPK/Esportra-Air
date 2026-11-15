//! Golden parity: the Rust parser must reproduce the JavaScript pipeline step for step.
//! Fixtures are recorded by `node engine/fixtures/record.cjs`.

use std::path::PathBuf;

use air_state::js::json_eq;
use air_state::merge;
use air_valorant::ValorantAdapter;
use serde_json::Value;

fn fixture(name: &str) -> (Value, Vec<Value>) {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../fixtures")
        .join(format!("{name}.ndjson"));
    let text = std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("{}: {e}", path.display()));
    let mut lines = text
        .lines()
        .map(|l| serde_json::from_str::<Value>(l).expect("fixture line is JSON"));
    let header = lines.next().expect("header");
    (header["initial"].clone(), lines.collect())
}

/// First differing path, for a readable failure.
fn first_difference(a: &Value, b: &Value, path: &str) -> Option<String> {
    match (a, b) {
        (Value::Object(x), Value::Object(y)) => {
            for key in x.keys().chain(y.keys()) {
                match (x.get(key), y.get(key)) {
                    (Some(av), Some(bv)) => {
                        if let Some(d) = first_difference(av, bv, &format!("{path}.{key}")) {
                            return Some(d);
                        }
                    }
                    (av, bv) => return Some(format!("{path}.{key}: rust={av:?} js={bv:?}")),
                }
            }
            None
        }
        (Value::Array(x), Value::Array(y)) if x.len() == y.len() => x
            .iter()
            .zip(y)
            .enumerate()
            .find_map(|(i, (av, bv))| first_difference(av, bv, &format!("{path}[{i}]"))),
        _ if json_eq(a, b) => None,
        _ => Some(format!("{path}: rust={a} js={b}")),
    }
}

fn replay(name: &str) {
    let (initial, steps) = fixture(name);
    let mut adapters: Vec<ValorantAdapter> = Vec::new();
    let mut state = initial;
    for step in &steps {
        let t = step["t"].as_f64().expect("t");
        // Fixtures with several adapters record which one ran and the state it was given.
        let index = step["adapter"].as_u64().unwrap_or(0) as usize;
        while adapters.len() <= index {
            adapters.push(ValorantAdapter::new());
        }
        let adapter = &mut adapters[index];
        if let Some(before) = step.get("before") {
            state = before.clone();
        }
        let mut events = Vec::new();
        match step["kind"].as_str().unwrap() {
            "ingest" => {
                let mut next = state.clone();
                for msg in step["input"].as_array().unwrap() {
                    events.extend(
                        adapter
                            .ingest(&mut next, msg, t)
                            .unwrap_or_else(|e| panic!("{name} step {}: {e}", step["step"])),
                    );
                }
                state = next;
            }
            "patch" => state = merge(state, &step["input"]),
            other => panic!("unsupported step kind {other}"),
        }
        if let Some(d) = first_difference(&state, &step["state"], "state") {
            panic!("{name} step {} ({}): {d}", step["step"], step["kind"]);
        }
        let expected = step["events"].as_array().unwrap();
        assert!(
            events.len() == expected.len()
                && events.iter().zip(expected).all(|(a, b)| json_eq(a, b)),
            "{name} step {}: events differ\n rust={events:?}\n js={expected:?}",
            step["step"]
        );
    }
}

#[test]
fn adapter_shapes() {
    replay("adapter-shapes");
}

#[test]
fn edge_cases() {
    replay("edge-cases");
}

#[test]
fn spectators_in_the_lobby_never_take_a_seat() {
    replay("spectators");
}

#[test]
fn simulated_match() {
    replay("simulated-match");
}
