//! chrono-node's English casual parsers (`locales/en/parsers`), in the order
//! its configuration runs them. Each finds the next match from a position;
//! `run` drives it over the text like chrono-node's `executeParser`.

use std::ops::Range;

use chrono::{Datelike, Timelike};

use super::Context;
use super::components::{
    AM, Components, Field, PM, ParsedDate, Reference, add_days, closest_year, weekday,
};
use super::lexicon::{
    Duration, MONTHS, UNITS, Unit, WEEKDAYS, is_full_month_name, ordinal, parse_duration,
    time_units, year,
};
use super::scan::{is_space, is_word, word_bounded};
use super::time::time_expression;

/// What a parser did with its next regex match.
pub(crate) enum Step {
    /// A result; scanning resumes at its end.
    Found(ParsedDate),
    /// The match was rejected; scanning resumes at this position.
    Retry(usize),
}

pub(crate) type Parser = fn(&Context, usize) -> Option<Step>;

pub(crate) const PARSERS: &[Parser] = &[
    year_month_day,
    iso_date_time,
    slash_date,
    time_unit_within,
    month_name_little_endian,
    month_name_middle_endian,
    weekday_name,
    slash_month,
    time_expression,
    time_unit_ago,
    time_unit_later,
    casual_date,
    casual_time,
    month_name,
    relative_date,
    time_unit_casual_relative,
];

/// Every result of `parser` (`Chrono.executeParser`).
pub(crate) fn run(ctx: &Context, parser: Parser) -> Vec<ParsedDate> {
    let mut results = Vec::new();
    let mut from = 0;
    while from <= ctx.text.len() {
        match parser(ctx, from) {
            None => break,
            Some(Step::Found(result)) => {
                from = result.span.end;
                results.push(result);
            }
            Some(Step::Retry(next)) => from = next,
        }
    }
    results
}

/// A result spanning `start..end` with `components` as its start.
fn found(start: usize, end: usize, components: Components) -> Option<Step> {
    Some(Step::Found(ParsedDate::new(start..end, components)))
}

/// `createParsingComponentsAtWeekday`.
fn at_weekday(reference: Reference, target: i32, modifier: Option<Modifier>) -> Components {
    let days = days_to_weekday(weekday(reference.now), target, modifier);
    let mut components = Components::new(reference);
    components.add_duration_as_implied(Duration::days(f64::from(days)));
    components.assign(Field::Weekday, target);
    components
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Modifier {
    This,
    Last,
    Next,
}

/// `getDaysToWeekday`: without a modifier, the closest such weekday (today
/// counts; ties go back).
fn days_to_weekday(today: i32, target: i32, modifier: Option<Modifier>) -> i32 {
    let forward = (target - today).rem_euclid(7);
    let backward = forward - 7;
    match modifier {
        Some(Modifier::This) => forward,
        Some(Modifier::Last) => backward,
        Some(Modifier::Next) => match today {
            0 => {
                if target == 0 {
                    7
                } else {
                    target
                }
            }
            6 => match target {
                6 => 7,
                0 => 8,
                _ => 1 + target,
            },
            _ if target < today && target != 0 => forward,
            _ => forward + 7,
        },
        None => {
            if forward < -backward {
                forward
            } else {
                backward
            }
        }
    }
}

// ---------------------------------------------------------------- numeric dates

/// `ENYearMonthDayParser`: `2026-06-15`, `2026/6/15`, `2026 jun 15`.
fn year_month_day(ctx: &Context, from: usize) -> Option<Step> {
    let t = &ctx.text;
    let is_separator =
        |c: Option<char>| c.is_some_and(|c| matches!(c, '-' | '.' | '/') || is_space(c));
    let (q, (end, year, month, day)) = word_bounded(t, from, |q| {
        if t.digits(q) < 4 || !is_separator(t.at(q + 4)) {
            return None;
        }
        let year: i32 = t.slice(q..q + 4).parse().ok()?;
        let s = q + 5;
        let mut months = t.words(s, MONTHS);
        months.extend(
            (1..=t.digits(s).min(2))
                .rev()
                .map(|len| (s + len, t.slice(s..s + len).parse().unwrap_or(0))),
        );
        for (month_end, month) in months {
            if !is_separator(t.at(month_end)) {
                continue;
            }
            let d = month_end + 1;
            for len in (1..=t.digits(d).min(2)).rev() {
                if t.ends_word(d + len) {
                    let day: i32 = t.slice(d..d + len).parse().ok()?;
                    return Some((d + len, year, month, day));
                }
            }
        }
        None
    })?;
    let (mut month, mut day) = (month, day);
    if !(1..=12).contains(&month) && (1..=12).contains(&day) {
        (month, day) = (day, month);
    }
    if !(1..=31).contains(&day) {
        return Some(Step::Retry(q + 1));
    }
    let mut components = ctx.components();
    components.assign(Field::Day, day);
    components.assign(Field::Month, month);
    components.assign(Field::Year, year);
    found(q, end, components)
}

/// `ISOFormatParser`: `2026-06-15`, `2026-06-15T10:00`,
/// `2026-06-15T10:00:30.5+02:00`, `…Z`. A zone designator converts the time
/// into the local zone.
fn iso_date_time(ctx: &Context, from: usize) -> Option<Step> {
    let t = &ctx.text;
    let number = |range: Range<usize>| t.slice(range).parse::<i32>().unwrap_or(0);
    struct Clock {
        hour: Range<usize>,
        minute: Range<usize>,
        second: Option<Range<usize>>,
        millisecond: Option<Range<usize>>,
        /// Minutes east of UTC.
        offset: Option<i32>,
    }
    // (?:T hh:mm (?::ss(?:\.s{1,4})?)? (Z|[+-]hh:?(mm)?)?)? then (?=\W|$)
    let clocks = |pos: usize| -> Vec<(usize, Option<Clock>)> {
        let mut found = Vec::new();
        if t.lit(pos, "t").is_some() {
            for hour in t.digit_runs(pos + 1, 1, 2) {
                if t.at(hour.end) != Some(':') {
                    continue;
                }
                for minute in t.digit_runs(hour.end + 1, 1, 2) {
                    let mut seconds = Vec::new();
                    if t.at(minute.end) == Some(':') {
                        for second in t.digit_runs(minute.end + 1, 1, 2) {
                            if t.at(second.end) == Some('.') {
                                for ms in t.digit_runs(second.end + 1, 1, 4) {
                                    seconds.push((ms.end, Some(second.clone()), Some(ms)));
                                }
                            }
                            seconds.push((second.end, Some(second), None));
                        }
                    }
                    seconds.push((minute.end, None, None));
                    for (s_end, second, millisecond) in seconds {
                        let mut zones: Vec<(usize, Option<i32>)> = Vec::new();
                        zones.extend(t.lit(s_end, "z").map(|e| (e, Some(0))));
                        if matches!(t.at(s_end), Some('+' | '-')) && t.digits(s_end + 1) >= 2 {
                            let hours = s_end + 1..s_end + 3;
                            let hour_offset = number(hours.clone())
                                * if t.at(s_end) == Some('-') { -1 } else { 1 };
                            let with_minutes = |end: usize| {
                                let minutes = (t.digits(end) >= 2).then(|| end..end + 2);
                                let mut offset = hour_offset * 60;
                                let minute_offset = minutes.clone().map_or(0, number);
                                offset += if offset < 0 {
                                    -minute_offset
                                } else {
                                    minute_offset
                                };
                                (minutes.map_or(end, |m| m.end), offset)
                            };
                            for colon in t.lit(hours.end, ":").into_iter().chain([hours.end]) {
                                let (end, offset) = with_minutes(colon);
                                zones.push((end, Some(offset)));
                                if end != colon {
                                    zones.push((colon, Some(hour_offset * 60)));
                                }
                            }
                        }
                        zones.push((s_end, None));
                        for (end, offset) in zones {
                            let clock = Clock {
                                hour: hour.clone(),
                                minute: minute.clone(),
                                second: second.clone(),
                                millisecond: millisecond.clone(),
                                offset,
                            };
                            found.push((end, Some(clock)));
                        }
                    }
                }
            }
        }
        found.push((pos, None));
        found
    };
    let (q, (date, end, clock)) = word_bounded(t, from, |q| {
        if t.digits(q) < 4 || t.at(q + 4) != Some('-') {
            return None;
        }
        for month in t.digit_runs(q + 5, 1, 2) {
            if t.at(month.end) != Some('-') {
                continue;
            }
            for day in t.digit_runs(month.end + 1, 1, 2) {
                for (end, clock) in clocks(day.end) {
                    if t.ends_word(end) {
                        return Some(((q..q + 4, month.clone(), day.clone()), end, clock));
                    }
                }
            }
        }
        None
    })?;
    let (year, month, day) = date;
    let mut components = ctx.components();
    components.assign(Field::Year, number(year));
    components.assign(Field::Month, number(month));
    components.assign(Field::Day, number(day));
    if let Some(clock) = clock {
        components.assign(Field::Hour, number(clock.hour));
        components.assign(Field::Minute, number(clock.minute));
        if let Some(second) = clock.second {
            components.assign(Field::Second, number(second));
        }
        if let Some(millisecond) = clock.millisecond {
            components.assign(Field::Millisecond, number(millisecond));
        }
        if let Some(offset) = clock.offset {
            components.assign(Field::TimezoneOffset, offset);
        }
    }
    found(q, end, components)
}

/// `SlashDateFormatParser` (month first): `6/15`, `12/25/2026`, `25/12` (a
/// first number above 12 swaps), `1.2.2026`. Not a word-boundary parser: the
/// match starts after a non-digit and ends before a non-word char.
fn slash_date(ctx: &Context, from: usize) -> Option<Step> {
    let t = &ctx.text;
    let number = |pos: usize| -> Vec<usize> {
        // [0-3]{0,1}[0-9]{1}
        let mut ends = Vec::new();
        if matches!(t.at(pos), Some('0'..='3')) && t.at(pos + 1).is_some_and(|c| c.is_ascii_digit())
        {
            ends.push(pos + 2);
        }
        if t.at(pos).is_some_and(|c| c.is_ascii_digit()) {
            ends.push(pos + 1);
        }
        ends
    };
    let is_separator = |pos: usize| matches!(t.at(pos), Some('/' | '.' | '-'));
    let ends_match = |pos: usize| t.ends_word(pos);
    // The rest of the pattern at `s`: (first end, second end, year range).
    let rest = |s: usize| {
        for first in number(s) {
            if !is_separator(first) {
                continue;
            }
            for second in number(first + 1) {
                if is_separator(second) {
                    let y = second + 1;
                    let digits = t.digits(y);
                    for len in [4, 2] {
                        if digits >= len && ends_match(y + len) {
                            return Some((first, second, Some(y..y + len)));
                        }
                    }
                }
                if ends_match(second) {
                    return Some((first, second, None));
                }
            }
        }
        None
    };
    let mut found_at = None;
    for p in from..=t.len() {
        if t.at(p).is_some_and(|c| !c.is_ascii_digit())
            && let Some(m) = rest(p + 1)
        {
            found_at = Some((p, p + 1, m));
            break;
        }
        if p == from
            && let Some(m) = rest(p)
        {
            found_at = Some((p, p, m));
            break;
        }
    }
    let (p, s, (first, second, year)) = found_at?;
    let retry = Some(Step::Retry(p + 1));
    let end = year.clone().map_or(second, |y| y.end);

    // The char before or after may still be a digit (`1/2/3/4`): skip those.
    if s > 0 {
        let before = t.slice(0..s);
        let mut chars = before.chars().rev().peekable();
        if chars.peek() == Some(&'/') {
            chars.next();
        }
        if chars.next().is_some_and(|c| c.is_ascii_digit()) {
            return retry;
        }
    }
    if end < t.len() {
        let after = if t.at(end) == Some('/') { end + 1 } else { end };
        if t.at(after).is_some_and(|c| c.is_ascii_digit()) {
            return retry;
        }
    }
    let text = t.slice(s..end);
    // "1.2" and "1.12.12" read as version numbers.
    let parts: Vec<&str> = text.split('.').collect();
    let version_like = match parts.as_slice() {
        [major, minor] => major.len() == 1 && minor.len() == 1,
        [major, minor, patch] => major.len() == 1 && minor.len() <= 2 && patch.len() <= 2,
        _ => false,
    } && parts.iter().all(|p| p.chars().all(|c| c.is_ascii_digit()));
    // Without a year only `/` makes a date ("6-15" is not one).
    if version_like || (year.is_none() && !text.contains('/')) {
        return retry;
    }

    let mut month: i32 = t.slice(s..first).parse().ok()?;
    let mut day: i32 = t.slice(first + 1..second).parse().ok()?;
    if month > 12 {
        if (1..=12).contains(&day) && month <= 31 {
            (month, day) = (day, month);
        } else {
            return retry;
        }
    }
    if !(1..=31).contains(&day) {
        return retry;
    }
    let mut components = ctx.components();
    components.assign(Field::Day, day);
    components.assign(Field::Month, month);
    match year {
        Some(range) => {
            let raw: i32 = t.slice(range).parse().ok()?;
            let year = match raw {
                0..=50 => raw + 2000,
                51..=99 => raw + 1900,
                _ => raw,
            };
            components.assign(Field::Year, year);
        }
        None => components.imply(Field::Year, closest_year(ctx.reference, day, month)),
    }
    found(s, end, components)
}

/// `ENSlashMonthFormatParser`: `6/2026`.
fn slash_month(ctx: &Context, from: usize) -> Option<Step> {
    let t = &ctx.text;
    let (q, (month_end, end)) = word_bounded(t, from, |q| {
        // [0-9] | 0[1-9] | 1[012], then /[0-9]{4}
        let mut months = Vec::new();
        if t.digits(q) >= 1 {
            months.push(q + 1);
        }
        if t.at(q) == Some('0') && matches!(t.at(q + 1), Some('1'..='9')) {
            months.push(q + 2);
        }
        if t.at(q) == Some('1') && matches!(t.at(q + 1), Some('0'..='2')) {
            months.push(q + 2);
        }
        months
            .into_iter()
            .find(|&m| t.at(m) == Some('/') && t.digits(m + 1) >= 4)
            .map(|m| (m, m + 5))
    })?;
    let mut components = ctx.components();
    components.imply(Field::Day, 1);
    components.assign(Field::Month, t.slice(q..month_end).parse().ok()?);
    components.assign(Field::Year, t.slice(month_end + 1..end).parse().ok()?);
    found(q, end, components)
}

// ---------------------------------------------------------------- month names

/// `ENMonthNameLittleEndianParser`: `15 june`, `on 15th of June 2027`,
/// `3 to 5 june`.
fn month_name_little_endian(ctx: &Context, from: usize) -> Option<Step> {
    let t = &ctx.text;
    struct Match {
        end: usize,
        day: i32,
        day_len: usize,
        day_to: Option<i32>,
        month: i32,
        year: Option<i32>,
    }
    let inner = |q: usize| -> Option<Match> {
        let mut starts: Vec<usize> = t
            .lit(q, "on")
            .map(|e| t.spaces(e, 0, 3).collect())
            .unwrap_or_default();
        starts.push(q);
        for s in starts {
            for (day_end, day) in ordinal(t, s) {
                // (?:\s{0,3}(?:to|-|–|until|through|till)?\s{0,3}ORDINAL)?
                let mut ranges: Vec<(usize, Option<i32>)> = Vec::new();
                for a in t.spaces(day_end, 0, 3) {
                    let mut connectors = t.alts(a, &["to", "-", "–", "until", "through", "till"]);
                    connectors.push(a);
                    for c in connectors {
                        for b in t.spaces(c, 0, 3) {
                            ranges.extend(ordinal(t, b).into_iter().map(|(e, v)| (e, Some(v))));
                        }
                    }
                }
                ranges.push((day_end, None));
                for (range_end, day_to) in ranges {
                    // (?:-|/|\s{0,3}(?:of)?\s{0,3})
                    let mut seps = t.alts(range_end, &["-", "/"]);
                    for a in t.spaces(range_end, 0, 3) {
                        for o in t.lit(a, "of").into_iter().chain([a]) {
                            seps.extend(t.spaces(o, 0, 3));
                        }
                    }
                    for sep in seps {
                        for (month_end, month) in t.words(sep, MONTHS) {
                            // (?:(?:-|/|,?\s{0,3})(YEAR(?!\w)))?, the `(?!\w)` being the
                            // final `(?=\W|$)` again
                            let mut year_starts = t.alts(month_end, &["-", "/"]);
                            for c in t.lit(month_end, ",").into_iter().chain([month_end]) {
                                year_starts.extend(t.spaces(c, 0, 3));
                            }
                            let mut years: Vec<(usize, Option<i32>)> = year_starts
                                .into_iter()
                                .flat_map(|y| year(t, y))
                                .map(|(e, v)| (e, Some(v)))
                                .collect();
                            years.push((month_end, None));
                            for (end, year) in years {
                                if t.ends_word(end) {
                                    return Some(Match {
                                        end,
                                        day,
                                        day_len: day_end - s,
                                        day_to,
                                        month,
                                        year,
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }
        None
    };
    let (q, m) = word_bounded(t, from, inner)?;
    if m.day > 31 {
        // "[96 Aug]" → "9[6 Aug]": skip past the number.
        return Some(Step::Retry(q + m.day_len + 1));
    }
    let mut start = ctx.components();
    start.assign(Field::Month, m.month);
    start.assign(Field::Day, m.day);
    match m.year {
        Some(year) => start.assign(Field::Year, year),
        None => start.imply(Field::Year, closest_year(ctx.reference, m.day, m.month)),
    }
    let end = m.day_to.map(|day_to| {
        let mut end = start.clone();
        end.assign(Field::Day, day_to);
        end
    });
    Some(Step::Found(ParsedDate {
        span: q..m.end,
        start,
        end,
    }))
}

/// `ENMonthNameMiddleEndianParser`: `june 15`, `Jun 15th, 2027`,
/// `june 3 - 5`. Not before `am`/`pm` (`june 3pm`) or `:\d` (`Jan 12:00`).
fn month_name_middle_endian(ctx: &Context, from: usize) -> Option<Step> {
    let t = &ctx.text;
    struct Match {
        end: usize,
        month: i32,
        day: i32,
        day_to: Option<i32>,
        year: Option<i32>,
    }
    let inner = |q: usize| -> Option<Match> {
        for (month_end, month) in t.words(q, MONTHS) {
            // (?:-|/|\s*,?\s*)
            let mut seps = t.alts(month_end, &["-", "/"]);
            for a in t.any_spaces(month_end) {
                for c in t.lit(a, ",").into_iter().chain([a]) {
                    seps.extend(t.any_spaces(c));
                }
            }
            for sep in seps {
                for (day_end, day) in ordinal(t, sep) {
                    // (?!\s*(?:am|pm))
                    let after = t.skip_spaces(day_end);
                    if t.lit(after, "am").is_some() || t.lit(after, "pm").is_some() {
                        continue;
                    }
                    for a in t.any_spaces(day_end) {
                        // (?:(?:to|-)\s*(ORDINAL)\s*)?
                        let mut ranges: Vec<(usize, Option<i32>)> = Vec::new();
                        for c in t.alts(a, &["to", "-"]) {
                            for b in t.any_spaces(c) {
                                for (e, v) in ordinal(t, b) {
                                    ranges.extend(t.any_spaces(e).map(|e| (e, Some(v))));
                                }
                            }
                        }
                        ranges.push((a, None));
                        for (range_end, day_to) in ranges {
                            // (?:(?:-|/|\s*,\s*|\s+)(YEAR))?
                            let mut year_starts = t.alts(range_end, &["-", "/"]);
                            for b in t.any_spaces(range_end) {
                                if let Some(c) = t.lit(b, ",") {
                                    year_starts.extend(t.any_spaces(c));
                                }
                            }
                            year_starts.extend(t.spaces(range_end, 1, usize::MAX));
                            let mut years: Vec<(usize, Option<i32>)> = year_starts
                                .into_iter()
                                .flat_map(|y| year(t, y))
                                .map(|(e, v)| (e, Some(v)))
                                .collect();
                            years.push((range_end, None));
                            for (end, year) in years {
                                let time_follows = t.at(end) == Some(':')
                                    && t.at(end + 1).is_some_and(|c| c.is_ascii_digit());
                                if t.ends_word(end) && !time_follows {
                                    return Some(Match {
                                        end,
                                        month,
                                        day,
                                        day_to,
                                        year,
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }
        None
    };
    let (q, m) = word_bounded(t, from, inner)?;
    if m.day > 31 {
        return Some(Step::Retry(q + 1));
    }
    let mut start = ctx.components();
    start.assign(Field::Day, m.day);
    start.assign(Field::Month, m.month);
    match m.year {
        Some(year) => start.assign(Field::Year, year),
        None => start.imply(Field::Year, closest_year(ctx.reference, m.day, m.month)),
    }
    let end = m.day_to.map(|day_to| {
        let mut end = start.clone();
        end.assign(Field::Day, day_to);
        end
    });
    Some(Step::Found(ParsedDate {
        span: q..m.end,
        start,
        end,
    }))
}

/// `ENMonthNameParser`: a month on its own, `in June`, `June 2027`. Bare
/// three-letter abbreviations (`mar`, `jan`) are skipped.
fn month_name(ctx: &Context, from: usize) -> Option<Step> {
    let t = &ctx.text;
    // (?=[^\s\w]|\s+[^0-9]|\s+$|$)
    let followed_ok = |pos: usize| {
        let spaces = t.run(pos, is_space);
        match t.at(pos) {
            None => true,
            Some(c) if spaces == 0 => !is_word(c),
            _ => spaces >= 2 || t.at(pos + 1).is_none_or(|c| !c.is_ascii_digit()),
        }
    };
    struct Match {
        month_start: usize,
        month_end: usize,
        end: usize,
        month: i32,
        year: Option<i32>,
    }
    let inner = |q: usize| -> Option<Match> {
        let mut starts: Vec<usize> = t
            .lit(q, "in")
            .map(|e| t.any_spaces(e).collect())
            .unwrap_or_default();
        starts.push(q);
        for month_start in starts {
            for (month_end, month) in t.words(month_start, MONTHS) {
                for a in t.any_spaces(month_end) {
                    // (?:(?:,|-|of)?\s*(YEAR)?)?
                    let mut tails: Vec<(usize, Option<i32>)> = Vec::new();
                    let mut connectors = t.alts(a, &[",", "-", "of"]);
                    connectors.push(a);
                    for c in connectors {
                        for b in t.any_spaces(c) {
                            tails.extend(year(t, b).into_iter().map(|(e, v)| (e, Some(v))));
                            tails.push((b, None));
                        }
                    }
                    tails.push((a, None));
                    for (end, year) in tails {
                        if followed_ok(end) {
                            return Some(Match {
                                month_start,
                                month_end,
                                end,
                                month,
                                year,
                            });
                        }
                    }
                }
            }
        }
        None
    };
    let (q, m) = word_bounded(t, from, inner)?;
    // Skip unlikely words: "mar", "jan" on their own.
    if m.end - q <= 3 && !is_full_month_name(&t.slice(m.month_start..m.month_end)) {
        return Some(Step::Retry(q + 1));
    }
    let Match {
        month_start,
        end,
        month,
        year,
        ..
    } = m;
    let mut components = ctx.components();
    components.imply(Field::Day, 1);
    components.assign(Field::Month, month);
    match year {
        Some(year) => components.assign(Field::Year, year),
        None => components.imply(Field::Year, closest_year(ctx.reference, 1, month)),
    }
    found(month_start, end, components)
}

// ---------------------------------------------------------------- weekdays and casual words

/// `ENWeekdayParser`: `friday`, `on fri`, `next monday`, `this weekend`,
/// `(tue)`, `monday next week`.
fn weekday_name(ctx: &Context, from: usize) -> Option<Step> {
    let t = &ctx.text;
    let modifiers = |pos: usize| -> Vec<(usize, Modifier)> {
        [
            ("this", Modifier::This),
            ("last", Modifier::Last),
            ("past", Modifier::Last),
            ("next", Modifier::Next),
        ]
        .into_iter()
        .filter_map(|(word, modifier)| Some((t.lit(pos, word)?, modifier)))
        .collect()
    };
    #[derive(Clone, Copy)]
    enum Day {
        Named(u32),
        Weekend,
        Weekday,
    }
    let inner = |q: usize| -> Option<(usize, Option<Modifier>, Day)> {
        // (?:(?:,|\(|（)\s*)?
        let mut starts: Vec<usize> = t
            .alts(q, &[",", "(", "（"])
            .into_iter()
            .flat_map(|e| t.any_spaces(e))
            .collect();
        starts.push(q);
        for s in starts {
            // (?:on\s*?)?  (lazy spaces)
            let mut ons: Vec<usize> = t
                .lit(s, "on")
                .map(|e| (0..=t.run(e, is_space)).map(|k| e + k).collect())
                .unwrap_or_default();
            ons.push(s);
            for o in ons {
                // (?:(this|last|past|next)\s*)?
                let mut prefixed: Vec<(usize, Option<Modifier>)> = Vec::new();
                for (e, modifier) in modifiers(o) {
                    prefixed.extend(t.any_spaces(e).map(|e| (e, Some(modifier))));
                }
                prefixed.push((o, None));
                for (w, prefix) in prefixed {
                    let mut days: Vec<(usize, Day)> = t
                        .words(w, WEEKDAYS)
                        .into_iter()
                        .map(|(e, d)| (e, Day::Named(d)))
                        .collect();
                    days.extend(t.lit(w, "weekend").map(|e| (e, Day::Weekend)));
                    days.extend(t.lit(w, "weekday").map(|e| (e, Day::Weekday)));
                    for (day_end, day) in days {
                        // (?:\s*(?:,|\)|）))?
                        let mut closes: Vec<usize> = t
                            .any_spaces(day_end)
                            .flat_map(|a| t.alts(a, &[",", ")", "）"]))
                            .collect();
                        closes.push(day_end);
                        for c in closes {
                            // (?:\s*(this|last|past|next)\s*week)?
                            let mut tails: Vec<(usize, Option<Modifier>)> = Vec::new();
                            for a in t.any_spaces(c) {
                                for (e, modifier) in modifiers(a) {
                                    for b in t.any_spaces(e) {
                                        tails.extend(t.lit(b, "week").map(|e| (e, Some(modifier))));
                                    }
                                }
                            }
                            tails.push((c, None));
                            for (end, postfix) in tails {
                                if t.ends_word(end) {
                                    return Some((end, prefix.or(postfix), day));
                                }
                            }
                        }
                    }
                }
            }
        }
        None
    };
    let (q, (end, modifier, day)) = word_bounded(t, from, inner)?;
    let target = match day {
        Day::Named(day) => day as i32,
        // "this/next weekend" is the coming Saturday, "last weekend" last Sunday.
        Day::Weekend => {
            if modifier == Some(Modifier::Last) {
                0
            } else {
                6
            }
        }
        // The next (or last) working day.
        Day::Weekday => {
            let today = weekday(ctx.reference.now);
            let last = modifier == Some(Modifier::Last);
            if today == 0 || today == 6 {
                if last { 5 } else { 1 }
            } else {
                // JS `%` keeps the sign: "last weekday" on a Monday is 0 (Sunday).
                let shifted = if last { today - 2 } else { today };
                shifted % 5 + 1
            }
        }
    };
    found(q, end, at_weekday(ctx.reference, target, modifier))
}

/// `ENCasualDateParser`: `now`, `today`, `tonight`, `tomorrow`/`tmr`/`tmrw`,
/// `overmorrow`, `yesterday`, `last night`.
fn casual_date(ctx: &Context, from: usize) -> Option<Step> {
    let t = &ctx.text;
    let words = [
        "now",
        "today",
        "tonight",
        "tomorrow",
        "overmorrow",
        "tmr",
        "tmrw",
        "yesterday",
    ];
    let (q, (end, word)) = word_bounded(t, from, |q| {
        for word in words {
            if let Some(end) = t.lit(q, word)
                && t.ends_word(end)
            {
                return Some((end, word));
            }
        }
        let last = t.lit(q, "last")?;
        let end = t.lit(t.skip_spaces(last), "night")?;
        t.ends_word(end).then_some((end, "last night"))
    })?;
    let reference = ctx.reference;
    let now = reference.now;
    let mut components = Components::new(reference);
    match word {
        "now" => {
            components.assign_similar_date(now);
            components.assign_similar_time(now);
            components.assign(Field::TimezoneOffset, reference.offset_minutes());
        }
        "today" | "tomorrow" | "tmr" | "tmrw" | "overmorrow" | "yesterday" => {
            let days = match word {
                "today" => 0,
                "yesterday" => -1,
                "overmorrow" => 2,
                _ => 1,
            };
            let date = add_days(reference.tz, now, days);
            components.assign_similar_date(date);
            components.imply_similar_time(date);
            components.delete(Field::Meridiem);
        }
        "tonight" => {
            components.assign_similar_date(now);
            components.imply(Field::Hour, 22);
            components.imply(Field::Meridiem, PM);
        }
        _ => {
            // last night
            let date = if now.hour() > 6 {
                add_days(reference.tz, now, -1)
            } else {
                now
            };
            components.assign_similar_date(date);
            components.imply(Field::Hour, 0);
        }
    }
    found(q, end, components)
}

/// `ENCasualTimeParser`: `(this) morning`, `afternoon`, `evening`, `night`,
/// `midnight`, `midday`, `noon`.
fn casual_time(ctx: &Context, from: usize) -> Option<Step> {
    let t = &ctx.text;
    let words = [
        "morning",
        "afternoon",
        "evening",
        "night",
        "midnight",
        "midday",
        "noon",
    ];
    let (q, (end, word)) = word_bounded(t, from, |q| {
        for s in t.lit(q, "this").into_iter().chain([q]) {
            for a in t.spaces(s, 0, 3) {
                for word in words {
                    if let Some(end) = t.lit(a, word)
                        && t.ends_word(end)
                    {
                        return Some((end, word));
                    }
                }
            }
        }
        None
    })?;
    let reference = ctx.reference;
    let mut components = Components::new(reference);
    match word {
        "morning" => {
            components.imply(Field::Meridiem, AM);
            components.imply(Field::Hour, 6);
        }
        "afternoon" => {
            components.imply(Field::Meridiem, PM);
            components.imply(Field::Hour, 15);
        }
        "noon" | "midday" => {
            components.imply(Field::Meridiem, AM);
            components.assign(Field::Hour, 12);
        }
        "evening" | "night" => {
            components.imply(Field::Meridiem, PM);
            components.imply(Field::Hour, 20);
        }
        _ => {
            // midnight: the coming one, unless it is just past midnight.
            if reference.now.hour() > 2 {
                components.add_duration_as_implied(Duration::days(1.0));
            }
            components.assign(Field::Hour, 0);
        }
    }
    // Minute/second/ms are already implied 0 by `Components::new`, as the
    // chrono-node helpers re-imply them.
    found(q, end, components)
}

/// `ENRelativeDateFormatParser`: `next week`, `last month`, `this year`.
fn relative_date(ctx: &Context, from: usize) -> Option<Step> {
    let t = &ctx.text;
    let (q, (end, modifier, unit)) = word_bounded(t, from, |q| {
        let mut prefixes: Vec<(usize, &str)> = ["this", "last", "past", "next"]
            .into_iter()
            .filter_map(|w| Some((t.lit(q, w)?, w)))
            .collect();
        if let Some(after) = t.lit(q, "after") {
            prefixes.extend(
                t.any_spaces(after)
                    .filter_map(|s| Some((t.lit(s, "this")?, "after"))),
            );
        }
        for (e, modifier) in prefixes {
            for s in t.any_spaces(e) {
                for (end, unit) in t.words(s, UNITS) {
                    if t.ends_word(end) {
                        return Some((end, modifier, unit));
                    }
                }
            }
        }
        None
    })?;
    let reference = ctx.reference;
    let components = match modifier {
        "next" | "after" => Components::relative(reference, Duration::of(unit, 1.0)),
        "last" | "past" => Components::relative(reference, Duration::of(unit, -1.0)),
        _ => {
            // this week/month/year: implied start of that period.
            let now = reference.now;
            let mut components = ctx.components();
            match unit {
                Unit::Week => {
                    let start = add_days(reference.tz, now, -i64::from(weekday(now)));
                    components.imply_similar_date(start);
                }
                Unit::Month => {
                    components.imply(Field::Day, 1);
                    components.assign(Field::Year, now.year());
                    components.assign(Field::Month, now.month() as i32);
                }
                Unit::Year => {
                    components.imply(Field::Day, 1);
                    components.imply(Field::Month, 1);
                    components.assign(Field::Year, now.year());
                }
                _ => {}
            }
            Some(components)
        }
    };
    match components {
        Some(components) => found(q, end, components),
        None => Some(Step::Retry(q + 1)),
    }
}

// ---------------------------------------------------------------- durations

/// A duration result relative to the reference, or a retry past `q`.
fn relative_step(ctx: &Context, q: usize, end: usize, duration: Option<Duration>) -> Option<Step> {
    match duration.and_then(|d| Components::relative(ctx.reference, d)) {
        Some(components) => found(q, end, components),
        None => Some(Step::Retry(q + 1)),
    }
}

/// `ENTimeUnitWithinFormatParser` (with `forwardDate`, the prefix is
/// optional): `in 2 hours`, `within a week`, `for 3 days`, `5 minutes`.
fn time_unit_within(ctx: &Context, from: usize) -> Option<Step> {
    let t = &ctx.text;
    let (q, (units, end)) = word_bounded(t, from, |q| {
        let mut starts: Vec<usize> = t
            .alts(q, &["within", "in", "for"])
            .into_iter()
            .flat_map(|e| t.any_spaces(e))
            .collect();
        starts.push(q);
        for s in starts {
            let mut unit_starts = Vec::new();
            for e in t.alts(s, &["about", "around", "roughly", "approximately", "just"]) {
                for a in t.any_spaces(e) {
                    if let Some(tilde) = t.lit(a, "~") {
                        unit_starts.extend(t.any_spaces(tilde));
                    }
                    unit_starts.push(a);
                }
            }
            unit_starts.push(s);
            for u in unit_starts {
                for end in time_units(t, u) {
                    if t.ends_word(end) {
                        return Some((u, end));
                    }
                }
            }
        }
        None
    })?;
    // "for the year" is not a duration.
    let matched = t.slice(q..end);
    if let Some(rest) = matched.strip_prefix("for") {
        let rest = rest.trim_start_matches(is_space);
        if let Some(rest) = rest.strip_prefix("the") {
            let rest = rest.trim_start_matches(is_space);
            if rest.starts_with(is_word) {
                return Some(Step::Retry(q + 1));
            }
        }
    }
    relative_step(ctx, q, end, parse_duration(&t.slice(units..end)))
}

/// `ENTimeUnitAgoFormatParser`: `2 days ago`, `a week before`.
fn time_unit_ago(ctx: &Context, from: usize) -> Option<Step> {
    let t = &ctx.text;
    let (q, (units_end, end)) = word_bounded(t, from, |q| {
        for units_end in time_units(t, q) {
            for s in t.spaces(units_end, 0, 5) {
                for end in t.alts(s, &["ago", "before", "earlier"]) {
                    if t.ends_word(end) {
                        return Some((units_end, end));
                    }
                }
            }
        }
        None
    })?;
    let duration = parse_duration(&t.slice(q..units_end)).map(Duration::reversed);
    relative_step(ctx, q, end, duration)
}

/// `ENTimeUnitLaterFormatParser`: `2 days later`, `3 weeks from now`.
fn time_unit_later(ctx: &Context, from: usize) -> Option<Step> {
    let t = &ctx.text;
    let words = ["later", "after", "from now", "henceforth", "forward", "out"];
    let (q, (units_end, end)) = word_bounded(t, from, |q| {
        for units_end in time_units(t, q) {
            for s in t.spaces(units_end, 0, 5) {
                for end in t.alts(s, &words) {
                    if t.ends_word(end) {
                        return Some((units_end, end));
                    }
                }
            }
        }
        None
    })?;
    relative_step(ctx, q, end, parse_duration(&t.slice(q..units_end)))
}

/// `ENTimeUnitCasualRelativeFormatParser`: `next 2 weeks`, `last 3 days`,
/// `+2 hours`, `-1 day`.
fn time_unit_casual_relative(ctx: &Context, from: usize) -> Option<Step> {
    let t = &ctx.text;
    let (q, (backwards, units, end)) = word_bounded(t, from, |q| {
        let prefixes = [
            ("this", false),
            ("last", true),
            ("past", true),
            ("next", false),
            ("after", false),
            ("+", false),
            ("-", true),
        ];
        for (word, backwards) in prefixes {
            let Some(e) = t.lit(q, word) else { continue };
            for s in t.any_spaces(e) {
                for end in time_units(t, s) {
                    if t.ends_word(end) {
                        return Some((backwards, s, end));
                    }
                }
            }
        }
        None
    })?;
    let duration =
        parse_duration(&t.slice(units..end)).map(|d| if backwards { d.reversed() } else { d });
    relative_step(ctx, q, end, duration)
}
