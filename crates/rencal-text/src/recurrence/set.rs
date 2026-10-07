//! `RRuleSet`: the recurrence editor's value (port of `recurrenceToRRuleSet` /
//! `rruleToRecurrence`). A rule plus RDATE/EXDATE instants, printed like
//! rrule.js's `RRuleSet.toString()`, which the repeat picker compares against
//! its presets.

use std::fmt;

use chrono::{DateTime, Utc};
use rencal_time::event::Recurrence;
use rencal_time::{EventTime, Tz};

use super::RRuleError;
use super::rule::{RRule, format_utc_stamp};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RRuleSet {
    pub rrule: RRule,
    rdates: Vec<DateTime<Utc>>,
    exdates: Vec<DateTime<Utc>>,
}

/// Add an instant, keeping the list sorted and free of duplicates.
fn insert(dates: &mut Vec<DateTime<Utc>>, date: DateTime<Utc>) {
    if let Err(i) = dates.binary_search(&date) {
        dates.insert(i, date);
    }
}

impl RRuleSet {
    pub fn new(rrule: RRule) -> Self {
        Self {
            rrule,
            rdates: Vec::new(),
            exdates: Vec::new(),
        }
    }

    pub fn rdate(&mut self, date: DateTime<Utc>) {
        insert(&mut self.rdates, date);
    }

    pub fn exdate(&mut self, date: DateTime<Utc>) {
        insert(&mut self.exdates, date);
    }

    /// Sorted and deduplicated.
    pub fn rdates(&self) -> &[DateTime<Utc>] {
        &self.rdates
    }

    /// Sorted and deduplicated.
    pub fn exdates(&self) -> &[DateTime<Utc>] {
        &self.exdates
    }

    /// Parse a stored recurrence. Exceptions and additions become the instants
    /// they denote in the viewer's zone (all-day dates: the viewer's midnight).
    pub fn from_recurrence(recurrence: &Recurrence, viewer: Tz) -> Result<Self, RRuleError> {
        let mut set = Self::new(recurrence.rrule.parse()?);
        for exdate in &recurrence.exdates {
            set.exdate(exdate.instant_for_ordering(viewer));
        }
        for rdate in &recurrence.rdates {
            set.rdate(rdate.instant_for_ordering(viewer));
        }
        Ok(set)
    }

    /// Back to a stored recurrence; exceptions and additions come back zoned in
    /// the viewer's zone, so an all-day EXDATE returns as the viewer's midnight.
    pub fn to_recurrence(&self, viewer: Tz) -> Recurrence {
        let zoned = |dates: &[DateTime<Utc>]| {
            dates
                .iter()
                .map(|d| EventTime::Zoned(d.with_timezone(&viewer)))
                .collect()
        };
        Recurrence {
            rrule: self.rrule.value(),
            exdates: zoned(&self.exdates),
            rdates: zoned(&self.rdates),
        }
    }
}

impl From<RRule> for RRuleSet {
    fn from(rrule: RRule) -> Self {
        Self::new(rrule)
    }
}

impl fmt::Display for RRuleSet {
    /// `RRULE:…`, then `RDATE:` and `EXDATE:` lines of UTC stamps when present.
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.rrule)?;
        for (name, dates) in [("RDATE", &self.rdates), ("EXDATE", &self.exdates)] {
            if !dates.is_empty() {
                let stamps: Vec<String> = dates
                    .iter()
                    .map(|d| format_utc_stamp(&d.naive_utc()))
                    .collect();
                write!(f, "\n{name}:{}", stamps.join(","))?;
            }
        }
        Ok(())
    }
}
