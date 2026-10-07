//! `ENTimeExpressionParser` (on `AbstractTimeExpressionParser`): clock times
//! and time ranges. `3pm`, `at 15:00`, `9:45am`, `at 7`, `from 2 to 4pm`,
//! `3pm-4pm`, `22:00 to 06:00`, `10 o'clock`, `9 at night`,
//! `3 in the afternoon`.
//!
//! A bare number needs context: `at 9` / `from 9` are times, `9` alone or
//! `9-10` are not.

use std::ops::Range;

use super::Context;
use super::components::{AM, Components, Field, PM, ParsedDate};
use super::parsers::Step;
use super::scan::{Text, is_space, is_word};

/// The numeric groups of a matched clock time.
struct Clock {
    hour: Range<usize>,
    minute: Option<Range<usize>>,
    second: Option<Range<usize>>,
    millisecond: Option<Range<usize>>,
    /// `a` or `p` (`am`, `a.m.`, `p`, …).
    meridiem: Option<char>,
}

/// Which seconds syntax the minute part allows.
#[derive(Clone, Copy, PartialEq, Eq)]
enum Part {
    /// `(?:[.:：](\d{1,2})(?:[:：](\d{2})(?:\.(\d{1,6}))?)?)?`
    Primary,
    /// `(?:[.:：](\d{1,2})(?:[.:：](\d{1,2})(?:\.(\d{1,6}))?)?)?`
    Following,
}

type MinuteParts = (
    usize,
    Option<Range<usize>>,
    Option<Range<usize>>,
    Option<Range<usize>>,
);

/// The optional `:mm(:ss(.sss))` after the hour, longest first.
fn minute_parts(t: &Text, pos: usize, part: Part) -> Vec<MinuteParts> {
    let mut found = Vec::new();
    if matches!(t.at(pos), Some('.' | ':' | '：')) {
        let m = pos + 1;
        for len in (1..=t.digits(m).min(2)).rev() {
            let minute_end = m + len;
            let second_sep = match part {
                Part::Primary => matches!(t.at(minute_end), Some(':' | '：')),
                Part::Following => matches!(t.at(minute_end), Some('.' | ':' | '：')),
            };
            if second_sep {
                let s = minute_end + 1;
                let second_lens: &[usize] = match part {
                    Part::Primary => &[2],
                    Part::Following => &[2, 1],
                };
                for &second_len in second_lens {
                    if t.digits(s) < second_len {
                        continue;
                    }
                    let second_end = s + second_len;
                    if t.at(second_end) == Some('.') {
                        let ms = second_end + 1;
                        for ms_len in (1..=t.digits(ms).min(6)).rev() {
                            found.push((
                                ms + ms_len,
                                Some(m..minute_end),
                                Some(s..second_end),
                                Some(ms..ms + ms_len),
                            ));
                        }
                    }
                    found.push((second_end, Some(m..minute_end), Some(s..second_end), None));
                }
            }
            found.push((minute_end, Some(m..minute_end), None, None));
        }
    }
    found.push((pos, None, None, None));
    found
}

/// `(?:\s*(a\.m\.|p\.m\.|am?|pm?))?`
fn meridiem_parts(t: &Text, pos: usize) -> Vec<(usize, Option<char>)> {
    let mut found = Vec::new();
    for s in t.any_spaces(pos) {
        for word in ["a.m.", "p.m.", "am", "a", "pm", "p"] {
            if let Some(end) = t.lit(s, word) {
                found.push((end, word.chars().next()));
            }
        }
    }
    found.push((pos, None));
    found
}

/// `(?:\s*(?:o\W*clock|at\s*night|in\s*the\s*(?:morning|afternoon)))?`
fn suffix_parts(t: &Text, pos: usize) -> Vec<usize> {
    let mut found = Vec::new();
    for s in t.any_spaces(pos) {
        if let Some(o) = t.lit(s, "o") {
            let gap = t.run(o, |c| !is_word(c));
            found.extend((0..=gap).rev().filter_map(|k| t.lit(o + k, "clock")));
        }
        if let Some(at) = t.lit(s, "at") {
            found.extend(t.any_spaces(at).filter_map(|a| t.lit(a, "night")));
        }
        if let Some(in_) = t.lit(s, "in") {
            for a in t.any_spaces(in_) {
                if let Some(the) = t.lit(a, "the") {
                    for b in t.any_spaces(the) {
                        found.extend(t.alts(b, &["morning", "afternoon"]));
                    }
                }
            }
        }
    }
    found.push(pos);
    found
}

/// `(?!/)(?=\W|$)`
fn time_ends(t: &Text, pos: usize) -> bool {
    t.at(pos) != Some('/') && t.ends_word(pos)
}

/// The primary pattern after its left boundary, at `q`:
/// `(?:(?:at|from)\s*)??(\d{1,4})<minute parts><meridiem><suffix>`.
fn primary(t: &Text, q: usize) -> Option<(usize, Clock)> {
    // The prefix is lazy: try without it first.
    let mut starts = vec![q];
    for word in ["at", "from"] {
        if let Some(end) = t.lit(q, word) {
            starts.extend(t.any_spaces(end));
        }
    }
    for s in starts {
        for hour_len in (1..=t.digits(s).min(4)).rev() {
            let hour = s..s + hour_len;
            for (m_end, minute, second, millisecond) in minute_parts(t, hour.end, Part::Primary) {
                for (a_end, meridiem) in meridiem_parts(t, m_end) {
                    if let Some(end) = suffix_parts(t, a_end)
                        .into_iter()
                        .find(|&e| time_ends(t, e))
                    {
                        let clock = Clock {
                            hour,
                            minute,
                            second,
                            millisecond,
                            meridiem,
                        };
                        return Some((end, clock));
                    }
                }
            }
        }
    }
    None
}

/// The first primary match from `from`: `(match start, start of the time
/// text, end, clock)`. The left boundary is `(^|\s|T|\b)`.
fn find_primary(t: &Text, from: usize) -> Option<(usize, usize, usize, Clock)> {
    for p in from..=t.len() {
        let mut starts = Vec::new();
        if p == from {
            starts.push(p);
        }
        if t.at(p)
            .is_some_and(|c| is_space(c) || c.eq_ignore_ascii_case(&'t'))
        {
            starts.push(p + 1);
        }
        if t.is_boundary(p) {
            starts.push(p);
        }
        for q in starts {
            if let Some((end, clock)) = primary(t, q) {
                return Some((p, q, end, clock));
            }
        }
    }
    None
}

/// The following pattern anchored at `pos`: `\s*(?:-|–|~|〜|to|until|through|till|\?)\s*`
/// then a clock time.
fn following(t: &Text, pos: usize) -> Option<(usize, Clock)> {
    let connectors = ["-", "–", "~", "〜", "to", "until", "through", "till", "?"];
    for a in t.any_spaces(pos) {
        for c in t.alts(a, &connectors) {
            for s in t.any_spaces(c) {
                for hour_len in (1..=t.digits(s).min(4)).rev() {
                    let hour = s..s + hour_len;
                    for (m_end, minute, second, millisecond) in
                        minute_parts(t, hour.end, Part::Following)
                    {
                        for (end, meridiem) in meridiem_parts(t, m_end) {
                            if time_ends(t, end) {
                                let clock = Clock {
                                    hour,
                                    minute,
                                    second,
                                    millisecond,
                                    meridiem,
                                };
                                return Some((end, clock));
                            }
                        }
                    }
                }
            }
        }
    }
    None
}

fn number(t: &Text, range: &Range<usize>) -> i32 {
    t.slice(range.clone()).parse().unwrap_or(0)
}

/// `ENTimeExpressionParser`: one time or time range.
pub(crate) fn time_expression(ctx: &Context, from: usize) -> Option<Step> {
    let t = &ctx.text;
    let (p, q, end, clock) = find_primary(t, from)?;
    let matched = t.slice(p..end);
    let retry = Some(Step::Retry(end + 1));
    let Some(start) = primary_components(ctx, &clock, &matched) else {
        // A year-like "2019…": skip just its digits.
        let skip = if matched.chars().take(4).filter(char::is_ascii_digit).count() == 4 {
            p + 4
        } else {
            end
        };
        return Some(Step::Retry(skip + 1));
    };
    let text = t.slice(q..end);
    let mut result = ParsedDate::new(q..end, start);

    let following = following(t, end);
    let following_text = following.as_ref().map(|(e, _)| t.slice(end..*e));
    // "456-12", "2022-12" are not times without context.
    if leading_digits(&text) >= 3
        && let Some(f) = &following_text
        && let Some(rest) = after_sign(f)
    {
        let digits = leading_digits(rest);
        if (2..=4).contains(&digits) && digits == rest.chars().count() {
            return retry;
        }
        let chars: Vec<char> = rest.chars().collect();
        if digits >= 2
            && chars.len() >= 5
            && !is_word(chars[2])
            && chars[3].is_ascii_digit()
            && chars[4].is_ascii_digit()
        {
            return retry;
        }
    }
    // "YY.YY -XXXX" is more like a zone offset.
    let offset_like = following_text
        .as_deref()
        .and_then(after_sign)
        .is_some_and(|rest| {
            let digits = leading_digits(rest);
            (3..=4).contains(&digits) && digits == rest.chars().count()
        });
    let Some((following_end, following_clock)) = following.filter(|_| !offset_like) else {
        return if accept_without_following(&text) {
            Some(Step::Found(result))
        } else {
            retry
        };
    };
    if let Some(end_components) = following_components(ctx, &following_clock, &mut result.start) {
        result.end = Some(end_components);
        result.span.end = following_end;
    }
    if accept_with_following(&t.slice(result.span.clone())) {
        Some(Step::Found(result))
    } else {
        retry
    }
}

/// `extractPrimaryTimeComponents` (with the English `night`/`morning`/
/// `afternoon` suffix rules); `matched` is the whole regex match.
fn primary_components(ctx: &Context, clock: &Clock, matched: &str) -> Option<Components> {
    let t = &ctx.text;
    let mut components = ctx.components();
    let hour_digits = clock.hour.len();
    let mut hour = number(t, &clock.hour);
    let mut minute = 0;
    let mut meridiem = None;
    if hour > 100 {
        // "2019" is a year; "930" is 9:30.
        if hour_digits == 4 && clock.minute.is_none() && clock.meridiem.is_none() {
            return None;
        }
        if clock.minute.is_some() {
            return None;
        }
        minute = hour % 100;
        hour /= 100;
    }
    if hour > 24 {
        return None;
    }
    if let Some(range) = &clock.minute {
        // "at 1.1" is not a time.
        if range.len() == 1 && clock.meridiem.is_none() {
            return None;
        }
        minute = number(t, range);
    }
    if minute >= 60 {
        return None;
    }
    if hour > 12 {
        meridiem = Some(PM);
    }
    match clock.meridiem {
        Some(_) if hour > 12 => return None,
        Some('a') => {
            meridiem = Some(AM);
            if hour == 12 {
                hour = 0;
            }
        }
        Some(_) => {
            meridiem = Some(PM);
            if hour != 12 {
                hour += 12;
            }
        }
        None => {}
    }
    components.assign(Field::Hour, hour);
    components.assign(Field::Minute, minute);
    match meridiem {
        Some(meridiem) => components.assign(Field::Meridiem, meridiem),
        None => components.imply(Field::Meridiem, if hour < 12 { AM } else { PM }),
    }
    if let Some(range) = &clock.millisecond {
        let digits = t.slice(range.clone());
        components.assign(
            Field::Millisecond,
            digits[..digits.len().min(3)].parse().unwrap_or(0),
        );
    }
    if let Some(range) = &clock.second {
        let second = number(t, range);
        if second >= 60 {
            return None;
        }
        components.assign(Field::Second, second);
    }

    // Case-sensitive, like chrono-node's `endsWith`.
    let hour = components.get(Field::Hour).unwrap_or(0);
    if matched.ends_with("night") {
        if (6..12).contains(&hour) {
            components.assign(Field::Hour, hour + 12);
            components.assign(Field::Meridiem, PM);
        } else if hour < 6 {
            components.assign(Field::Meridiem, AM);
        }
    }
    if matched.ends_with("afternoon") {
        components.assign(Field::Meridiem, PM);
        if (0..=6).contains(&hour) {
            components.assign(Field::Hour, hour + 12);
        }
    }
    if matched.ends_with("morning") {
        components.assign(Field::Meridiem, AM);
    }
    Some(components)
}

/// `extractFollowingTimeComponents`: the end of a range. A meridiem on the end
/// carries back to an unqualified start (`3-4pm`); an end before the start
/// moves to the next day (`22:00 to 06:00`).
fn following_components(
    ctx: &Context,
    clock: &Clock,
    start: &mut Components,
) -> Option<Components> {
    let t = &ctx.text;
    let mut components = ctx.components();
    if let Some(range) = &clock.millisecond {
        let digits = t.slice(range.clone());
        components.assign(
            Field::Millisecond,
            digits[..digits.len().min(3)].parse().unwrap_or(0),
        );
    }
    if let Some(range) = &clock.second {
        let second = number(t, range);
        if second >= 60 {
            return None;
        }
        components.assign(Field::Second, second);
    }
    let mut hour = number(t, &clock.hour);
    let mut minute = 0;
    if let Some(range) = &clock.minute {
        minute = number(t, range);
    } else if hour > 100 {
        minute = hour % 100;
        hour /= 100;
    }
    if minute >= 60 || hour > 24 {
        return None;
    }
    let mut meridiem = (hour >= 12).then_some(PM);
    if let Some(letter) = clock.meridiem {
        if hour > 12 {
            return None;
        }
        if letter == 'a' {
            meridiem = Some(AM);
            if hour == 12 {
                hour = 0;
                if !components.is_certain(Field::Day) {
                    let day = components.get(Field::Day).unwrap_or(0);
                    components.imply(Field::Day, day + 1);
                }
            }
        } else {
            meridiem = Some(PM);
            if hour != 12 {
                hour += 12;
            }
        }
        if !start.is_certain(Field::Meridiem) {
            let start_hour = start.get(Field::Hour).unwrap_or(0);
            if meridiem == Some(AM) {
                start.imply(Field::Meridiem, AM);
                if start_hour == 12 {
                    start.assign(Field::Hour, 0);
                }
            } else {
                start.imply(Field::Meridiem, PM);
                if start_hour != 12 {
                    start.assign(Field::Hour, start_hour + 12);
                }
            }
        }
    }
    components.assign(Field::Hour, hour);
    components.assign(Field::Minute, minute);
    match meridiem {
        Some(meridiem) => components.assign(Field::Meridiem, meridiem),
        None => {
            let start_hour = start.get(Field::Hour).unwrap_or(0);
            if start.is_certain(Field::Meridiem) && start_hour > 12 {
                if start_hour - 12 > hour {
                    // 10pm - 1 (am)
                    components.imply(Field::Meridiem, AM);
                } else if hour <= 12 {
                    components.assign(Field::Hour, hour + 12);
                    components.assign(Field::Meridiem, PM);
                }
            } else if hour > 12 {
                components.imply(Field::Meridiem, PM);
            } else {
                components.imply(Field::Meridiem, AM);
            }
        }
    }
    if components.date() < start.date() {
        let day = components.get(Field::Day).unwrap_or(0);
        components.imply(Field::Day, day + 1);
    }
    Some(components)
}

fn leading_digits(s: &str) -> usize {
    s.chars().take_while(char::is_ascii_digit).count()
}

/// What follows `^\s*[+-]\s*`, if `s` starts that way.
fn after_sign(s: &str) -> Option<&str> {
    let s = s.trim_start_matches(is_space);
    let rest = s.strip_prefix(['+', '-'])?;
    Some(rest.trim_start_matches(is_space))
}

/// The trailing run of digits and dots, if it is preceded by a char other
/// than a digit, `:` or `.` (`/[^\d:.](\d[\d.]+)$/`).
fn ending_number(text: &str) -> Option<&str> {
    let run_start = text
        .char_indices()
        .rev()
        .take_while(|&(_, c)| c.is_ascii_digit() || c == '.')
        .last()
        .map(|(i, _)| i)?;
    let run = &text[run_start..];
    let before = text[..run_start].chars().next_back()?;
    (run.len() >= 2 && run.starts_with(|c: char| c.is_ascii_digit()) && before != ':')
        .then_some(run)
}

/// `/\d(\.\d{2})+$/`
fn ends_with_dotted_pairs(s: &str) -> bool {
    let bytes = s.as_bytes();
    let mut end = bytes.len();
    let mut pairs = 0;
    while end >= 3
        && bytes[end - 3] == b'.'
        && bytes[end - 2].is_ascii_digit()
        && bytes[end - 1].is_ascii_digit()
    {
        end -= 3;
        pairs += 1;
    }
    pairs > 0 && end >= 1 && bytes[end - 1].is_ascii_digit()
}

/// A number that is a plausible hour in a lone time: not "1.2", not above 24.
fn plausible_number(numbers: &str) -> bool {
    if numbers.contains('.') && !ends_with_dotted_pairs(numbers) {
        return false;
    }
    leading_digits(numbers) == 0
        || numbers[..leading_digits(numbers)]
            .parse::<u64>()
            .is_ok_and(|n| n <= 24)
}

/// `checkAndReturnWithoutFollowingPattern`: reject `1`, `203`, `1a`, `at 25`.
fn accept_without_following(text: &str) -> bool {
    let all_digits = !text.is_empty() && text.chars().all(|c| c.is_ascii_digit());
    if all_digits && (text.len() == 1 || text.len() >= 3) {
        return false;
    }
    let mut tail = text.chars().rev();
    if let (Some(last), Some(before)) = (tail.next(), tail.next())
        && matches!(last, 'a' | 'p' | 'A' | 'P')
        && before.is_ascii_digit()
    {
        return false;
    }
    ending_number(text).is_none_or(plausible_number)
}

/// `checkAndReturnWithFollowingPattern`: reject `9-10` and out-of-range
/// `at 10-25`.
fn accept_with_following(text: &str) -> bool {
    if let Some((a, b)) = text.split_once('-')
        && !a.is_empty()
        && !b.is_empty()
        && a.chars().all(|c| c.is_ascii_digit())
        && b.chars().all(|c| c.is_ascii_digit())
    {
        return false;
    }
    match dashed_numbers(text) {
        Some((start, end)) => plausible_number(end) && plausible_number(start),
        None => true,
    }
}

/// `/[^\d:.](\d[\d.]+)\s*-\s*(\d[\d.]+)$/`: the two numbers of a trailing
/// `N - M`.
fn dashed_numbers(text: &str) -> Option<(&str, &str)> {
    let end = ending_run(text)?;
    let rest = text[..text.len() - end.len()].trim_end_matches(is_space);
    let rest = rest.strip_suffix('-')?.trim_end_matches(is_space);
    let start = ending_number(rest)?;
    Some((start, end))
}

/// The trailing `\d[\d.]+` run (any preceding char).
fn ending_run(text: &str) -> Option<&str> {
    let run_start = text
        .char_indices()
        .rev()
        .take_while(|&(_, c)| c.is_ascii_digit() || c == '.')
        .last()
        .map(|(i, _)| i)?;
    let run = &text[run_start..];
    (run.len() >= 2 && run.starts_with(|c: char| c.is_ascii_digit())).then_some(run)
}
