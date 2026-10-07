//! chrono-node's refiners, in its English casual configuration order: merge
//! neighbouring results (date + time, ranges, relative offsets), move
//! ambiguous dates into the future (`forwardDate`), drop unlikely ones.
//!
//! Not ported: `ExtractTimezoneOffsetRefiner` / `ExtractTimezoneAbbrRefiner`
//! (`3pm UTC+2`, `3pm EST`); zone suffixes stay in the summary.

use chrono::Datelike;

use super::Context;
use super::components::{Components, Field, PM, ParsedDate, Reference, add_days, weekday};
use super::lexicon::parse_duration;
use super::scan::{is_space, is_word, js_trim};

pub(crate) fn refine(ctx: &Context, results: Vec<ParsedDate>) -> Vec<ParsedDate> {
    let results = remove_overlaps(results);
    let results = merge(
        ctx,
        results,
        should_merge_relative_after,
        merge_relative_after,
    );
    let results = merge(
        ctx,
        results,
        should_merge_relative_before,
        merge_relative_before,
    );
    let results = remove_overlaps(results);
    let results = merge(ctx, results, should_merge_weekday, merge_weekday);
    let results = merge(ctx, results, should_merge_date_time, merge_date_time);
    let mut results = remove_overlaps(results);
    forward_dates(ctx, &mut results);
    results.retain(|r| is_likely(ctx, r));
    let mut results = merge(ctx, results, should_merge_date_time, merge_date_time);
    extract_year_suffix(ctx, &mut results);
    let mut results = merge(ctx, results, should_merge_range, merge_range);
    results.retain(|r| is_likely_english(ctx, r));
    results
}

/// `OverlapRemovalRefiner`: of two overlapping results keep the longer (the
/// earlier on a tie).
fn remove_overlaps(results: Vec<ParsedDate>) -> Vec<ParsedDate> {
    let mut kept: Vec<ParsedDate> = Vec::with_capacity(results.len());
    for result in results {
        match kept.last_mut() {
            Some(prev) if result.span.start < prev.span.end => {
                if result.span.len() > prev.span.len() {
                    *prev = result;
                }
            }
            _ => kept.push(result),
        }
    }
    kept
}

/// `MergingRefiner`: fold each result into the previous one while
/// `should_merge(text between, previous, next)` holds.
fn merge(
    ctx: &Context,
    results: Vec<ParsedDate>,
    should_merge: fn(&Context, &str, &ParsedDate, &ParsedDate) -> bool,
    merge: fn(&Context, &str, ParsedDate, ParsedDate) -> ParsedDate,
) -> Vec<ParsedDate> {
    let mut merged = Vec::with_capacity(results.len());
    let mut results = results.into_iter();
    let Some(mut current) = results.next() else {
        return merged;
    };
    for next in results {
        // `substring` swaps its arguments when they are reversed.
        let (a, b) = (current.span.end, next.span.start);
        let between = ctx.text.slice(a.min(b)..a.max(b));
        if should_merge(ctx, &between, &current, &next) {
            current = merge(ctx, &between, current, next);
        } else {
            merged.push(std::mem::replace(&mut current, next));
        }
    }
    merged.push(current);
    merged
}

fn is_blank(s: &str) -> bool {
    s.chars().all(is_space)
}

/// `ENMergeRelativeAfterDateRefiner`: `[tomorrow] [+2 days]`.
fn should_merge_relative_after(
    ctx: &Context,
    between: &str,
    _: &ParsedDate,
    next: &ParsedDate,
) -> bool {
    let text = ctx.text.slice(next.span.clone());
    is_blank(between) && text.starts_with(['+', '-']) && parse_duration(&text).is_some()
}

fn merge_relative_after(
    ctx: &Context,
    _: &str,
    current: ParsedDate,
    next: ParsedDate,
) -> ParsedDate {
    let text = ctx.text.slice(next.span.clone());
    let mut duration = parse_duration(&text).unwrap_or_default();
    if text.starts_with('-') {
        duration = duration.reversed();
    }
    let reference = Reference::new(current.start.date(), ctx.reference.tz);
    let start = Components::relative(reference, duration).unwrap_or(current.start);
    ParsedDate::new(current.span.start..next.span.end, start)
}

/// `[2 weeks before] [june 15]`, `[3 days after] [next friday]`.
fn relative_direction(text: &str) -> Option<bool> {
    let lower = text.to_ascii_lowercase();
    let word_after_space = |word: &str| {
        lower
            .strip_suffix(word)
            .is_some_and(|rest| rest.ends_with(is_space))
    };
    if word_after_space("before") || word_after_space("from") {
        Some(true)
    } else if word_after_space("after") || word_after_space("since") {
        Some(false)
    } else {
        None
    }
}

/// `ENMergeRelativeFollowByDateRefiner`.
fn should_merge_relative_before(
    ctx: &Context,
    between: &str,
    current: &ParsedDate,
    next: &ParsedDate,
) -> bool {
    let text = ctx.text.slice(current.span.clone());
    let truthy = |field| next.start.get(field).is_some_and(|v| v != 0);
    is_blank(between)
        && relative_direction(&text).is_some()
        && parse_duration(&text).is_some()
        && truthy(Field::Day)
        && truthy(Field::Month)
        && truthy(Field::Year)
}

fn merge_relative_before(
    ctx: &Context,
    _: &str,
    current: ParsedDate,
    next: ParsedDate,
) -> ParsedDate {
    let text = ctx.text.slice(current.span.clone());
    let mut duration = parse_duration(&text).unwrap_or_default();
    if relative_direction(&text) == Some(true) {
        duration = duration.reversed();
    }
    let reference = Reference::new(next.start.date(), ctx.reference.tz);
    let start = Components::relative(reference, duration).unwrap_or(next.start);
    ParsedDate::new(current.span.start..next.span.end, start)
}

/// `MergeWeekdayComponentRefiner`: `[Sunday] [12/7/2014]`.
fn should_merge_weekday(
    _: &Context,
    between: &str,
    current: &ParsedDate,
    next: &ParsedDate,
) -> bool {
    current.start.is_only_weekday()
        && !current.start.is_certain(Field::Hour)
        && next.start.is_certain(Field::Day)
        && is_blank(between.strip_prefix(',').unwrap_or(between))
}

fn merge_weekday(_: &Context, _: &str, current: ParsedDate, mut next: ParsedDate) -> ParsedDate {
    let weekday = current.start.get(Field::Weekday).unwrap_or(0);
    next.span.start = current.span.start;
    next.start.assign(Field::Weekday, weekday);
    if let Some(end) = &mut next.end {
        end.assign(Field::Weekday, weekday);
    }
    next
}

/// `ENMergeDateTimeRefiner`: a date-only and a time-only result joined by
/// nothing, `at`, `on`, `of`, `,`, … (case-sensitive): `tomorrow at 3pm`,
/// `3pm tomorrow`, `friday 10am`.
fn should_merge_date_time(
    _: &Context,
    between: &str,
    current: &ParsedDate,
    next: &ParsedDate,
) -> bool {
    let connector = js_trim(between);
    let joined = matches!(
        connector,
        "" | "T" | "at" | "after" | "before" | "on" | "of" | "," | "-" | "." | "∙" | ":"
    );
    joined
        && ((current.start.is_only_date() && next.start.is_only_time())
            || (next.start.is_only_date() && current.start.is_only_time()))
}

fn merge_date_time(ctx: &Context, _: &str, current: ParsedDate, next: ParsedDate) -> ParsedDate {
    let span = current.span.start..next.span.end;
    let mut result = if current.start.is_only_date() {
        merge_date_with_time(ctx, &current, &next)
    } else {
        merge_date_with_time(ctx, &next, &current)
    };
    result.span = span;
    result
}

/// `mergeDateTimeResult`.
fn merge_date_with_time(ctx: &Context, date: &ParsedDate, time: &ParsedDate) -> ParsedDate {
    let mut result = date.clone();
    result.start = merge_components(&date.start, &time.start);
    if date.end.is_some() || time.end.is_some() {
        let end_date = date.end.as_ref().unwrap_or(&date.start);
        let end_time = time.end.as_ref().unwrap_or(&time.start);
        let mut end = merge_components(end_date, end_time);
        if date.end.is_none() && end.date() < result.start.date() {
            // "Tuesday 9pm - 1am" ends on Wednesday.
            let next_day = add_days(ctx.reference.tz, end.date(), 1);
            if end.is_certain(Field::Day) {
                end.assign_similar_date(next_day);
            } else {
                end.imply_similar_date(next_day);
            }
        }
        result.end = Some(end);
    }
    result
}

/// `mergeDateTimeComponent`: the date's fields with the time's clock.
fn merge_components(date: &Components, time: &Components) -> Components {
    let mut merged = date.clone();
    let get = |field| time.get(field).unwrap_or(0);
    if time.is_certain(Field::Hour) {
        merged.assign(Field::Hour, get(Field::Hour));
        merged.assign(Field::Minute, get(Field::Minute));
        if time.is_certain(Field::Second) {
            merged.assign(Field::Second, get(Field::Second));
            if time.is_certain(Field::Millisecond) {
                merged.assign(Field::Millisecond, get(Field::Millisecond));
            } else {
                merged.imply(Field::Millisecond, get(Field::Millisecond));
            }
        } else {
            merged.imply(Field::Second, get(Field::Second));
            merged.imply(Field::Millisecond, get(Field::Millisecond));
        }
    } else {
        merged.imply(Field::Hour, get(Field::Hour));
        merged.imply(Field::Minute, get(Field::Minute));
        merged.imply(Field::Second, get(Field::Second));
        merged.imply(Field::Millisecond, get(Field::Millisecond));
    }
    if time.is_certain(Field::TimezoneOffset) {
        merged.assign(Field::TimezoneOffset, get(Field::TimezoneOffset));
    }
    if time.is_certain(Field::Meridiem) {
        merged.assign(Field::Meridiem, get(Field::Meridiem));
    } else if let Some(meridiem) = time.get(Field::Meridiem)
        && merged.get(Field::Meridiem).is_none()
    {
        merged.imply(Field::Meridiem, meridiem);
    }
    let hour = merged.get(Field::Hour).unwrap_or(0);
    if merged.get(Field::Meridiem) == Some(PM) && hour < 12 {
        if time.is_certain(Field::Hour) {
            merged.assign(Field::Hour, hour + 12);
        } else {
            merged.imply(Field::Hour, hour + 12);
        }
    }
    merged
}

/// `ForwardDateRefiner`: a time already past today moves to tomorrow, a past
/// weekday to next week, a past month/day without a year to next year.
fn forward_dates(ctx: &Context, results: &mut [ParsedDate]) {
    let tz = ctx.reference.tz;
    for result in results {
        let mut reference = ctx.reference.now;
        if result.start.is_only_time() && reference > result.start.date() {
            let mut following = add_days(tz, reference, 1);
            result.start.imply_similar_date(following);
            if let Some(end) = &mut result.end
                && end.is_only_time()
            {
                end.imply_similar_date(following);
                if result.start.date() > end.date() {
                    following = add_days(tz, following, 1);
                    end.imply_similar_date(following);
                }
            }
        }
        if result.start.is_only_weekday() && reference > result.start.date() {
            let days_ahead = |target: i32, from: i32| {
                let days = target - from;
                i64::from(if days <= 0 { days + 7 } else { days })
            };
            let target = result.start.get(Field::Weekday).unwrap_or(0);
            reference = add_days(tz, reference, days_ahead(target, weekday(reference)));
            result.start.imply_similar_date(reference);
            if let Some(end) = &mut result.end
                && end.is_only_weekday()
            {
                let target = end.get(Field::Weekday).unwrap_or(0);
                reference = add_days(tz, reference, days_ahead(target, weekday(reference)));
                end.imply_similar_date(reference);
            }
        }
        if result.start.is_date_with_unknown_year() {
            for _ in 0..3 {
                if reference <= result.start.date() {
                    break;
                }
                let year = result.start.get(Field::Year).unwrap_or(reference.year());
                result.start.imply(Field::Year, year + 1);
                if let Some(end) = &mut result.end
                    && !end.is_certain(Field::Year)
                {
                    let year = end.get(Field::Year).unwrap_or(reference.year());
                    end.imply(Field::Year, year + 1);
                }
            }
        }
    }
}

/// `UnlikelyFormatFilter`: bare numbers and impossible dates (April 31st, a
/// wallclock inside a DST gap).
fn is_likely(ctx: &Context, result: &ParsedDate) -> bool {
    // `text.replace(" ", "")` only drops the first space.
    let text = ctx.text.slice(result.span.clone()).replacen(' ', "", 1);
    let (whole, fraction) = text.split_once('.').unwrap_or((&text, ""));
    let numeric =
        whole.chars().all(|c| c.is_ascii_digit()) && fraction.chars().all(|c| c.is_ascii_digit());
    !numeric
        && result.start.is_valid_date()
        && result.end.as_ref().is_none_or(Components::is_valid_date)
}

/// `ENExtractYearSuffixRefiner`: `[june 15] 2027`.
fn extract_year_suffix(ctx: &Context, results: &mut [ParsedDate]) {
    let t = &ctx.text;
    for result in results {
        if !result.start.is_date_with_unknown_year() {
            continue;
        }
        let Some((end, year)) = t
            .any_spaces(result.span.end)
            .flat_map(|s| super::lexicon::year(t, s))
            .next()
        else {
            continue;
        };
        // A short number ("14/4 90") is not taken as a year.
        if js_trim(&t.slice(result.span.end..end)).chars().count() <= 3 {
            continue;
        }
        if let Some(range_end) = &mut result.end {
            range_end.assign(Field::Year, year);
        }
        result.start.assign(Field::Year, year);
        result.span.end = end;
    }
}

/// `ENMergeDateRangeRefiner`: `june 15 to june 18`, `monday - wednesday`,
/// `10am to noon`.
fn should_merge_range(_: &Context, between: &str, current: &ParsedDate, next: &ParsedDate) -> bool {
    let connector = js_trim(between).to_lowercase();
    current.end.is_none()
        && next.end.is_none()
        && matches!(
            connector.as_str(),
            "to" | "-" | "–" | "until" | "through" | "till"
        )
}

/// `AbstractMergeDateRangeRefiner.mergeResults`: share known fields between the
/// two ends, then fix an end before the start (next week, next year, or swap).
fn merge_range(ctx: &Context, _: &str, mut from: ParsedDate, mut to: ParsedDate) -> ParsedDate {
    let tz = ctx.reference.tz;
    if !from.start.is_only_weekday() && !to.start.is_only_weekday() {
        for field in to.start.certain_fields() {
            if !from.start.is_certain(field) {
                from.start.imply(field, to.start.get(field).unwrap_or(0));
            }
        }
        for field in from.start.certain_fields() {
            if !to.start.is_certain(field) {
                to.start.imply(field, from.start.get(field).unwrap_or(0));
            }
        }
    }
    if from.start.date() > to.start.date() {
        let from_date = from.start.date();
        let to_date = to.start.date();
        let year_shift = |date, years: f64| {
            let mut duration = super::lexicon::Duration {
                year: Some(years),
                ..Default::default()
            };
            super::components::add_duration(tz, date, &mut duration).unwrap_or(date)
        };
        if to.start.is_only_weekday() && add_days(tz, to_date, 7) > from_date {
            to.start.imply_similar_date(add_days(tz, to_date, 7));
        } else if from.start.is_only_weekday() && add_days(tz, from_date, -7) < to_date {
            from.start.imply_similar_date(add_days(tz, from_date, -7));
        } else if to.start.is_date_with_unknown_year() && year_shift(to_date, 1.0) > from_date {
            to.start.imply(Field::Year, year_shift(to_date, 1.0).year());
        } else if from.start.is_date_with_unknown_year() && year_shift(from_date, -1.0) < to_date {
            from.start
                .imply(Field::Year, year_shift(from_date, -1.0).year());
        } else {
            std::mem::swap(&mut from, &mut to);
        }
    }
    let span = from.span.start.min(to.span.start)..from.span.end.max(to.span.end);
    ParsedDate {
        span,
        start: from.start,
        end: Some(to.start),
    }
}

/// `ENUnlikelyFormatFilter`: a lone `may` (unless after `in`) and anything
/// ending in `the second` are not dates, unless they are the whole input.
fn is_likely_english(ctx: &Context, result: &ParsedDate) -> bool {
    let full = ctx.text.slice(0..ctx.text.len());
    let text = ctx.text.slice(result.span.clone());
    let text = js_trim(&text);
    if text == js_trim(&full) {
        return true;
    }
    let lower = text.to_ascii_lowercase();
    if lower == "may" {
        let before = ctx.text.slice(0..result.span.start);
        let before = js_trim(&before).to_ascii_lowercase();
        let after_in = before
            .strip_suffix("in")
            .is_some_and(|rest| !rest.ends_with(is_word));
        if !after_in {
            return false;
        }
    }
    !lower.ends_with("the second")
}
