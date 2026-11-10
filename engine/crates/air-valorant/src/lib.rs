//! Valorant game module: Overwolf GEP messages → Esportra HUD match state.
//!
//! Port of `esportra-valorant-hud/adapters/valorant-gep.js` and `player-coverage.js`.
mod adapter;
mod coverage;
mod message;
mod tables;

pub use adapter::{IngestError, ValorantAdapter};
pub use coverage::is_uuid;
