//! `with_nearest_occurrence`: show a recurring master at the occurrence nearest
//! to now (port of `withNearestOccurrence`), e.g. in search results.

use std::collections::VecDeque;

use chrono::{NaiveDateTime, NaiveTime};
use rencal_time::{CalendarEvent, EventTime, Tz};

use super::RRuleError;
use super::rule::RRule;

/// How many excluded occurrences in a row are skipped before giving up on a
/// direction.
const MAX_EXDATE_SKIPS: usize = 32;

/// An event time as a wallclock in its own zone (the viewer's for UTC values),
/// to the minute: the "fake UTC" value rrule.js expands in.
fn rrule_wallclock(time: &EventTime, viewer: Tz) -> NaiveDateTime {
    let (hour, minute) = time.wallclock_time(viewer);
    let clock = NaiveTime::from_hms_opt(hour, minute, 0).expect("valid wallclock time");
    time.date_in_event_zone(viewer).and_time(clock)
}

/// For a recurring master, move start/end by whole days to the first
/// occurrence at or after `now` (a viewer-zone wallclock), else the last one
/// before it. RDATEs count as occurrences and EXDATEs are skipped. Events that
/// aren't recurring, have no occurrence or have an unreadable rule come back
/// unchanged.
pub fn with_nearest_occurrence(
    mut event: CalendarEvent,
    now: NaiveDateTime,
    viewer: Tz,
) -> CalendarEvent {
    let Ok(Some(occurrence)) = nearest_occurrence(&event, now, viewer) else {
        return event;
    };
    let delta = (occurrence.date() - event.start.date_in_event_zone(viewer)).num_days();
    let (start, end) = (event.start.add_days(delta), event.end.add_days(delta));
    event.set_dates(start, end, viewer);
    event
}

fn nearest_occurrence(
    event: &CalendarEvent,
    now: NaiveDateTime,
    viewer: Tz,
) -> Result<Option<NaiveDateTime>, RRuleError> {
    let Some(recurrence) = &event.recurrence else {
        return Ok(None);
    };
    let rule = recurrence
        .rrule
        .parse::<RRule>()?
        .anchor(rrule_wallclock(&event.start, viewer));
    let exdates: Vec<NaiveDateTime> = recurrence
        .exdates
        .iter()
        .map(|t| rrule_wallclock(t, viewer))
        .collect();
    let rdates: Vec<NaiveDateTime> = recurrence
        .rdates
        .iter()
        .map(|t| rrule_wallclock(t, viewer))
        .filter(|d| !exdates.contains(d))
        .collect();
    let included = |d: &NaiveDateTime| !exdates.contains(d);

    // After: the first of the next MAX_EXDATE_SKIPS + 1 rule occurrences that
    // isn't excluded, or an RDATE if one comes sooner.
    let rule_after = rule
        .occurrences()?
        .skip_while(|d| *d < now)
        .take(MAX_EXDATE_SKIPS + 1)
        .find(included);
    let rdate_after = rdates.iter().copied().filter(|d| *d >= now).min();
    let after = match (rule_after, rdate_after) {
        (Some(a), Some(b)) => Some(a.min(b)),
        (a, b) => a.or(b),
    };
    if after.is_some() {
        return Ok(after);
    }

    // Before: the same, walking back from now.
    let mut last = VecDeque::with_capacity(MAX_EXDATE_SKIPS + 1);
    for d in rule.occurrences()?.take_while(|d| *d <= now) {
        if last.len() == MAX_EXDATE_SKIPS + 1 {
            last.pop_front();
        }
        last.push_back(d);
    }
    let rule_before = last.into_iter().rev().find(included);
    let rdate_before = rdates.iter().copied().filter(|d| *d <= now).max();
    Ok(match (rule_before, rdate_before) {
        (Some(a), Some(b)) => Some(a.max(b)),
        (a, b) => a.or(b),
    })
}
