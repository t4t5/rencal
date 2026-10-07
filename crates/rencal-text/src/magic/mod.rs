//! Magic event-text parser (port of `src/lib/magic-parser.ts`): turns
//! "Lunch with Anna tomorrow at 1pm at Cafe Luna" into a summary, a time
//! range, a recurrence and a location, and splits the input into highlighted
//! segments for the compose field (`MagicSegments`).
//!
//! The TS version wrapped chrono-node 2.x with `forwardDate`. Its behaviour is
//! the spec (`tests/fixtures/magic_parser.json`); `dates` re-implements the
//! part of chrono-node the corpus exercises, quirks included.
//!
//! # Pipeline
//!
//! 1. **Recurrence**: the first `every (day|week|month|year|weekday|weekend|
//!    monday…sunday)` (case-insensitive, whole words) becomes the RRULE
//!    (`FREQ=DAILY`, `FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR`, …). It is cut from the
//!    text; a weekday name stays (lowercased) so it also sets the start date.
//!    "everyday" is not a recurrence.
//! 2. **Dates**: the first date/time in the remaining text. Its match is cut,
//!    with a directly preceding `at`/`on`/`for`/`from`.
//! 3. **Location**: in what is left, everything after the first standalone
//!    `at`/`in` (`Meet Sam at Central Park`, `Dinner in Kreuzberg`).
//! 4. **Times**: no clock time → all-day dates with an exclusive end
//!    (`june 15 to june 18` → 06-15..06-19); otherwise wallclocks zoned in the
//!    viewer's zone (DST gaps resolve forward), one hour long unless a range
//!    was given.
//!
//! # Date grammar
//!
//! Case-insensitive; words must stand alone. Without a year a date is the
//! occurrence closest to "now", moved a year ahead if it already passed today.
//!
//! - Casual days: `now`, `today`, `tonight`, `tomorrow`/`tmr`/`tmrw`,
//!   `overmorrow`, `yesterday`, `last night`.
//! - Parts of day: `(this) morning|afternoon|evening|night` (date only, no
//!   clock), `noon`/`midday` (12:00), `midnight` (the coming 00:00).
//! - Weekdays: `monday`…`sunday`, `mon`, `tue`, `thurs`, `sat.`, …,
//!   `weekend`, `weekday`, optionally after `on` and/or `this|next|last|past`,
//!   or followed by `this|next|last week`. A bare weekday is the closest one
//!   (today included), moved to next week if it already passed;
//!   `next friday` is the one in the following week.
//! - Month names: `june 15`, `June 15th, 2027`, `jun 15 2027`, `15 june`,
//!   `on 15th of June`, ranges `3 to 5 june` / `june 3 - 5`, a month alone
//!   (`in June`, `june 2027`; bare `jan`/`mar`/… are ignored, `may` only
//!   after `in`). Ordinals may be words (`twenty-first`).
//! - Numeric dates: `2026-06-15` (`/`, `.`, space also separate),
//!   `6/15` (month first; `25/12` swaps), `6/15/2026`, `6/2026`, ISO
//!   `2026-06-15T10:00(:30.5)(Z|+02:00)` (an offset converts to the viewer's
//!   zone). `6-15`, `1.2` and phone-number-like text are not dates.
//! - Clock times: `3pm`, `3 pm`, `3 a.m.`, `15:00`, `9:45am`, `930pm`,
//!   `12:30:15`, `10 o'clock`, `9 at night`, `3 in the afternoon`. A bare
//!   number needs `at`/`from` (`at 9`, but not `9` or `Q3`); a time already
//!   past today means tomorrow.
//! - Time ranges: `3pm-4pm`, `3-4pm` (the meridiem carries back),
//!   `from 3pm to 5pm`, `22:00 to 06:00` (ends the next day). Also with
//!   `–`, `~`, `until`, `through`, `till`. Not `9-10`.
//! - Durations from now: `in 2 hours`, `within a week`, `for 3 days`, bare
//!   `30 minutes`, `half an hour`, `a couple of days`, `2 hours and 30 min`,
//!   `3 days ago`, `2 weeks later`, `3 days from now`, `next 2 weeks`,
//!   `+2 days`. Day-based durations are all-day, hour/minute ones are timed.
//! - Relative periods: `next week|month|year` (same weekday/day a period
//!   later), `last month`, `this week|month|year`.
//! - Combinations: a date and a time next to each other, joined by nothing,
//!   `at`, `on`, `of`, `after`, `before`, `,`, `-`, `.` or `:`, in either
//!   order (`tomorrow at 3pm`, `at 9:45am tomorrow`, `friday 10am`,
//!   `dec 31 9pm`); two dates or times joined by `to`, `-`, `–`, `until`,
//!   `through`, `till` form a range (`monday to wednesday`,
//!   `dec 31 9pm to jan 1 2am`). A range whose end comes first is swapped.
//!   A weekday before a full date merges into it (`Sunday, 12/7/2014`).
//!   A relative duration attaches to a neighbouring date
//!   (`tomorrow +2 days`, `2 weeks before june 15`).
//!
//! Not supported (as in the TS app): `the 25th` without a month, `end of
//! month`, `9-10` without am/pm. Unlike chrono-node, zone suffixes after a
//! time (`3pm EST`, `3pm UTC+2`) are not recognised: the time is taken as the
//! viewer's and the suffix stays in the summary.
//!
//! # Quirks kept from chrono-node
//!
//! - `10am to noon` at 10:30 swaps into noon today → 10:00 tomorrow (the
//!   forward-date step runs before ranges are merged).
//! - `friday from 2 to 4pm` on a Monday ends a week after it starts.
//! - `Yoga every monday at 7am`: the date text (`monday at 7am`) is not in the
//!   original, so only `every monday` is highlighted.
//! - A date that cannot exist is dropped, including a time inside the
//!   viewer's DST gap (`march 29 at 2:30am` in Berlin), and an overnight
//!   time range (`22:00 to 06:00`) typed on the last day of a month (the
//!   end's day overflows the month before it is moved).

mod dates;

use std::ops::Range;

use chrono::{Days, NaiveDateTime};
use rencal_time::constants::DEFAULT_DURATION_MINS;
use rencal_time::event::Recurrence;
use rencal_time::{EventTime, EventTimeRange, Tz};

use dates::{is_space, is_word, js_trim};

/// What `parse_event_text` found in the compose text.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ParsedEvent {
    /// The text without the recurrence, date and location parts.
    pub summary: String,
    /// `start`/`end`: all-day dates (exclusive end) or zoned in the viewer's zone.
    pub time: Option<EventTimeRange>,
    pub recurrence: Option<Recurrence>,
    pub location: Option<String>,
    /// The recognised date text (chrono-node's match). It comes from the text
    /// after the recurrence was cut, so it may not occur in the input.
    pub date_text: Option<String>,
}

/// A run of the input, highlighted when it was recognised.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MagicSegment {
    /// Byte range in the input.
    pub range: Range<usize>,
    pub parsed: bool,
}

/// Parse compose text. `now` is the viewer's current wallclock in `viewer`.
pub fn parse_event_text(text: &str, now: NaiveDateTime, viewer: Tz) -> ParsedEvent {
    let every = find_recurrence(text);
    let recurrence = every.as_ref().map(|every| Recurrence {
        rrule: every.rrule.to_owned(),
        exdates: Vec::new(),
        rdates: Vec::new(),
    });
    let date_text_source = match &every {
        Some(every) => every.remaining_text(text),
        None => text.to_owned(),
    };

    let Some(found) = dates::parse(&date_text_source, now, viewer)
        .into_iter()
        .next()
    else {
        let (summary, location) = split_location(js_trim(&date_text_source));
        return ParsedEvent {
            summary,
            time: None,
            recurrence,
            location,
            date_text: None,
        };
    };

    let summary = remove_match(&date_text_source, found.range.clone());
    let (summary, location) = split_location(js_trim(&summary));
    let time = if found.all_day {
        let start = found.start.date();
        let last = found.end.map_or(start, |end| end.date());
        let end = last.checked_add_days(Days::new(1)).unwrap_or(last);
        EventTimeRange::new(EventTime::Date(start), EventTime::Date(end))
    } else {
        let start = EventTime::zoned(found.start, viewer);
        let end = match found.end {
            Some(end) => EventTime::zoned(end, viewer),
            None => start.add_minutes(i64::from(DEFAULT_DURATION_MINS)),
        };
        EventTimeRange::new(start, end)
    };
    ParsedEvent {
        summary,
        time: Some(time),
        recurrence,
        location,
        date_text: Some(date_text_source[found.range].to_owned()),
    }
}

/// Split the input into plain and recognised runs for highlighting
/// (`segmentEventText`). Concatenated, the ranges cover `text`.
pub fn segment_event_text(text: &str, now: NaiveDateTime, viewer: Tz) -> Vec<MagicSegment> {
    let whole = vec![MagicSegment {
        range: 0..text.len(),
        parsed: false,
    }];
    if js_trim(text).is_empty() {
        return whole;
    }
    let parsed = parse_event_text(text, now, viewer);
    if parsed.time.is_none() && parsed.recurrence.is_none() && parsed.location.is_none() {
        return whole;
    }

    let mut ranges = Vec::new();
    let every = find_recurrence(text);
    if let Some(every) = &every {
        ranges.push(every.range.clone());
    }
    // The date text is looked up after the recurrence, as the TS did.
    if parsed.time.is_some()
        && let Some(date_text) = &parsed.date_text
    {
        let from = every.as_ref().map_or(0, |every| every.range.end);
        if let Some(offset) = text[from..].find(date_text.as_str()) {
            ranges.push(from + offset..from + offset + date_text.len());
        }
    }
    if let Some(location) = &parsed.location
        && let Some(range) = trailing_match(text, location)
    {
        ranges.push(range);
    }

    ranges.sort_by_key(|range| range.start);
    let mut merged: Vec<Range<usize>> = Vec::new();
    for range in ranges {
        match merged.last_mut() {
            Some(last) if range.start <= last.end => last.end = last.end.max(range.end),
            _ => merged.push(range),
        }
    }

    let mut segments = Vec::new();
    let mut pos = 0;
    for range in merged {
        if pos < range.start {
            segments.push(MagicSegment {
                range: pos..range.start,
                parsed: false,
            });
        }
        pos = range.end;
        segments.push(MagicSegment {
            range,
            parsed: true,
        });
    }
    if pos < text.len() {
        segments.push(MagicSegment {
            range: pos..text.len(),
            parsed: false,
        });
    }
    segments
}

/// An `every …` phrase: `\bevery\s+(unit)\b`.
struct Every {
    range: Range<usize>,
    /// The unit, lowercased.
    unit: &'static str,
    rrule: &'static str,
}

const EVERY_UNITS: &[(&str, &str)] = &[
    ("day", "FREQ=DAILY"),
    ("week", "FREQ=WEEKLY"),
    ("month", "FREQ=MONTHLY"),
    ("year", "FREQ=YEARLY"),
    ("weekday", "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR"),
    ("weekend", "FREQ=WEEKLY;BYDAY=SA,SU"),
    ("monday", "FREQ=WEEKLY;BYDAY=MO"),
    ("tuesday", "FREQ=WEEKLY;BYDAY=TU"),
    ("wednesday", "FREQ=WEEKLY;BYDAY=WE"),
    ("thursday", "FREQ=WEEKLY;BYDAY=TH"),
    ("friday", "FREQ=WEEKLY;BYDAY=FR"),
    ("saturday", "FREQ=WEEKLY;BYDAY=SA"),
    ("sunday", "FREQ=WEEKLY;BYDAY=SU"),
];

impl Every {
    fn is_day_name(&self) -> bool {
        self.rrule.contains("BYDAY=") && !self.unit.starts_with("week")
    }

    /// The text the date parser sees: the phrase cut out, or replaced by the
    /// day name so it still sets the start date.
    fn remaining_text(&self, text: &str) -> String {
        let keep = if self.is_day_name() { self.unit } else { "" };
        let joined = format!(
            "{}{keep}{}",
            &text[..self.range.start],
            &text[self.range.end..]
        );
        js_trim(&collapse_spaces(&joined)).to_owned()
    }
}

fn find_recurrence(text: &str) -> Option<Every> {
    text.char_indices().find_map(|(start, _)| {
        if starts_word(text, start) && starts_with_ignore_case(&text[start..], "every") {
            let after = start + "every".len();
            let spaces = text[after..].len() - text[after..].trim_start_matches(is_space).len();
            if spaces == 0 {
                return None;
            }
            let unit_start = after + spaces;
            EVERY_UNITS.iter().find_map(|&(unit, rrule)| {
                let end = unit_start + unit.len();
                (starts_with_ignore_case(&text[unit_start..], unit) && ends_word(text, end))
                    .then_some(Every {
                        range: start..end,
                        unit,
                        rrule,
                    })
            })
        } else {
            None
        }
    })
}

/// `parseLocation`: `\b(?:at|in)\s+(.+)$` (case-insensitive) splits off the
/// location; the summary is what comes before.
fn split_location(summary: &str) -> (String, Option<String>) {
    let unchanged = (summary.to_owned(), None);
    for (start, _) in summary.char_indices() {
        if !starts_word(summary, start)
            || !(starts_with_ignore_case(&summary[start..], "at")
                || starts_with_ignore_case(&summary[start..], "in"))
        {
            continue;
        }
        let after = &summary[start + 2..];
        let spaces: Vec<usize> = after
            .char_indices()
            .take_while(|&(_, c)| is_space(c))
            .map(|(i, c)| i + c.len_utf8())
            .collect();
        // `\s+` backtracks so that `(.+)` gets at least one char and no newline.
        let location =
            spaces.iter().rev().map(|&end| &after[end..]).find(|rest| {
                !rest.is_empty() && !rest.contains(['\n', '\r', '\u{2028}', '\u{2029}'])
            });
        let Some(location) = location else { continue };
        let location = js_trim(location);
        if location.is_empty() {
            return unchanged;
        }
        return (
            js_trim(&summary[..start]).to_owned(),
            Some(location.to_owned()),
        );
    }
    unchanged
}

/// `removeMatchAndConnectors`: cut `range` and a connector word right before
/// it, then collapse runs of whitespace.
fn remove_match(text: &str, range: Range<usize>) -> String {
    let before = &text[..range.start];
    let trimmed = before.trim_end_matches(is_space);
    let before = ["at", "on", "for", "from"]
        .into_iter()
        .find_map(|word| {
            let start = trimmed.len().checked_sub(word.len())?;
            (trimmed.is_char_boundary(start)
                && trimmed[start..].eq_ignore_ascii_case(word)
                && starts_word(trimmed, start))
            .then(|| &before[..start])
        })
        .unwrap_or(before);
    collapse_spaces(&format!("{before}{}", &text[range.end..]))
}

/// The range of `needle` at the end of `text` (before trailing whitespace),
/// compared case-insensitively: `new RegExp(escape(needle) + "\\s*$", "i")`.
fn trailing_match(text: &str, needle: &str) -> Option<Range<usize>> {
    let end = text.trim_end_matches(is_space).len();
    let mut start = end;
    let mut haystack = text[..end].char_indices().rev();
    for expected in needle.chars().rev() {
        let (i, c) = haystack.next()?;
        if !c.to_uppercase().eq(expected.to_uppercase()) {
            return None;
        }
        start = i;
    }
    Some(start..text.len())
}

/// JS `\b` before `pos`, where the char at `pos` is a word char.
fn starts_word(text: &str, pos: usize) -> bool {
    text[..pos].chars().next_back().is_none_or(|c| !is_word(c))
}

/// JS `\b` after a word char ending at `pos`.
fn ends_word(text: &str, pos: usize) -> bool {
    text.get(pos..)
        .is_some_and(|rest| rest.chars().next().is_none_or(|c| !is_word(c)))
}

fn starts_with_ignore_case(text: &str, prefix: &str) -> bool {
    text.get(..prefix.len())
        .is_some_and(|head| head.eq_ignore_ascii_case(prefix))
}

/// `.replace(/\s{2,}/g, " ")`.
fn collapse_spaces(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut run = String::new();
    for c in text.chars() {
        if is_space(c) {
            run.push(c);
            continue;
        }
        flush_spaces(&mut out, &mut run);
        out.push(c);
    }
    flush_spaces(&mut out, &mut run);
    out
}

fn flush_spaces(out: &mut String, run: &mut String) {
    if run.chars().count() >= 2 {
        out.push(' ');
    } else {
        out.push_str(run);
    }
    run.clear();
}
