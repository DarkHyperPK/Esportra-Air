//! Shared match-state primitives for the Esportra Air engine.
pub mod js;
pub mod patch;

pub use patch::{diff, merge};
