//! Recurrence rules (port of `src/lib/rrule-utils.ts`, `src/lib/recurrence-edit.ts`
//! and the repeat picker's logic), on rrule.js's terms: the strings, labels and
//! occurrences match what the TS app produced with rrule.js.
//!
//! - `RRule`: an RRULE value, parsed and printed like rrule.js (`rule`), with
//!   its English description (`text`).
//! - `AnchoredRule`: a rule bound to a DTSTART, expanded with the `rrule` crate
//!   (`anchored`).
//! - `RRuleSet`: rule + RDATE/EXDATE, the editor's value (`set`).
//! - `with_nearest_occurrence`, `anchor_range_to_recurring_master`,
//!   `repeat_presets`/`repeat_label`.
//!
//! The stored form stays `rencal_time::event::Recurrence` (caldir-core's shape:
//! the RRULE value as a string plus EXDATE/RDATE event times).

mod anchored;
mod edit;
mod nearest;
mod repeat;
mod rule;
mod set;
mod text;

use std::fmt;

pub use anchored::{AnchoredRule, Occurrences};
pub use edit::anchor_range_to_recurring_master;
pub use nearest::with_nearest_occurrence;
pub use repeat::{RepeatPreset, repeat_label, repeat_presets, selected_preset};
pub use rule::{Frequency, NWeekday, Part, RRule};
pub use set::RRuleSet;

/// A rule that can't be parsed or expanded.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RRuleError(pub String);

impl fmt::Display for RRuleError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for RRuleError {}
