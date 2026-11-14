//! One game data source per match. The observer PC (or this PC's own capture) that sends first is
//! the source; data from any other full-data sender is held back, never parsed, so a second observer
//! set up by mistake cannot count every kill twice. When the source goes quiet another one takes over,
//! and the producer can switch by hand. Player PCs are not sources: they only add their own player's
//! health and abilities (`join::admit`).
use std::collections::HashMap;

use serde_json::{json, Value};

/// How long the source may be quiet before a standby sender takes over.
pub const TAKEOVER_MS: f64 = 5_000.0;
/// Senders not heard from for this long leave the list.
const FORGET_MS: f64 = 60_000.0;

/// The local capture (this PC's own game data, the ingest socket and HTTP route).
pub const THIS_PC: &str = "this-pc";

#[derive(Debug, Default)]
pub struct DataSources {
    active: Option<String>,
    /// Last time each sender sent full match data (wall clock, ms).
    seen: HashMap<String, f64>,
    /// Messages held back per sender, for the producer's view.
    held: HashMap<String, u64>,
    /// The producer just switched: the next message starts a new baseline.
    switched: bool,
}

/// What to do with a sender's messages.
#[derive(Debug, PartialEq, Eq)]
pub enum Gate {
    /// The source: parse them.
    Use,
    /// A new source took over: start a new baseline, then parse them.
    TakeOver,
    /// Another sender is the source: drop them.
    Hold,
}

impl DataSources {
    pub fn gate(&mut self, source: &str, now: f64) -> Gate {
        self.seen.insert(source.to_string(), now);
        self.seen.retain(|_, at| now - *at < FORGET_MS);
        let quiet = |s: &Self| {
            s.active
                .as_ref()
                .and_then(|a| s.seen.get(a))
                .is_none_or(|at| now - at > TAKEOVER_MS)
        };
        match &self.active {
            Some(a) if a == source => {
                if std::mem::take(&mut self.switched) {
                    Gate::TakeOver
                } else {
                    Gate::Use
                }
            }
            None => {
                self.active = Some(source.to_string());
                Gate::Use
            }
            Some(_) if quiet(self) => {
                self.active = Some(source.to_string());
                Gate::TakeOver
            }
            Some(_) => {
                *self.held.entry(source.to_string()).or_default() += 1;
                Gate::Hold
            }
        }
    }

    /// The producer chose this sender. Returns false when it has not sent anything recently.
    pub fn choose(&mut self, source: &str, now: f64) -> bool {
        if !self.seen.get(source).is_some_and(|at| now - at < FORGET_MS) {
            return false;
        }
        if self.active.as_deref() != Some(source) {
            self.active = Some(source.to_string());
            self.switched = true;
        }
        self.held.remove(source);
        true
    }

    pub fn active(&self) -> Option<&str> {
        self.active.as_deref()
    }

    pub fn status(&self, now: f64) -> Value {
        let mut list: Vec<_> = self
            .seen
            .iter()
            .filter(|(_, at)| now - **at < FORGET_MS)
            .collect();
        list.sort_by(|a, b| a.0.cmp(b.0));
        json!({
            "active": self.active,
            "takeoverMs": TAKEOVER_MS,
            "sources": list.into_iter().map(|(id, at)| json!({
                "id": id,
                "active": self.active.as_deref() == Some(id.as_str()),
                "ageMs": (now - at).max(0.0),
                "held": self.held.get(id).copied().unwrap_or(0),
            })).collect::<Vec<_>>(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_first_sender_is_the_source_and_a_second_is_held() {
        let mut s = DataSources::default();
        assert_eq!(s.gate("peer:1", 0.0), Gate::Use);
        assert_eq!(s.gate("peer:2", 100.0), Gate::Hold);
        assert_eq!(s.gate("peer:1", 200.0), Gate::Use);
        assert_eq!(s.active(), Some("peer:1"));
        assert_eq!(s.status(300.0)["sources"][1]["held"], 1);
    }

    #[test]
    fn a_quiet_source_is_replaced_and_the_producer_can_switch() {
        let mut s = DataSources::default();
        s.gate("peer:1", 0.0);
        assert_eq!(s.gate("peer:2", 4_000.0), Gate::Hold);
        assert_eq!(s.gate("peer:2", 5_500.0), Gate::TakeOver);
        assert_eq!(
            s.gate("peer:1", 5_600.0),
            Gate::Hold,
            "the old source stays standby when it returns"
        );
        assert!(s.choose("peer:1", 5_700.0));
        assert_eq!(
            s.gate("peer:1", 5_800.0),
            Gate::TakeOver,
            "a switch starts a new baseline"
        );
        assert_eq!(s.gate("peer:1", 5_900.0), Gate::Use);
        assert!(
            !s.choose("peer:9", 6_000.0),
            "a sender never seen cannot be chosen"
        );
    }
}
