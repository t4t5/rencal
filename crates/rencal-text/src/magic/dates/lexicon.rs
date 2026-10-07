//! Word lists and the shared sub-patterns of chrono-node's English locale
//! (`locales/en/constants.ts`): ordinals, years, numbers, time units and
//! durations.

use super::scan::{Text, dedup, js_trim};

pub(crate) const WEEKDAYS: &[(&str, u32)] = &[
    ("sunday", 0),
    ("sun", 0),
    ("sun.", 0),
    ("monday", 1),
    ("mon", 1),
    ("mon.", 1),
    ("tuesday", 2),
    ("tue", 2),
    ("tue.", 2),
    ("wednesday", 3),
    ("wed", 3),
    ("wed.", 3),
    ("thursday", 4),
    ("thurs", 4),
    ("thurs.", 4),
    ("thur", 4),
    ("thur.", 4),
    ("thu", 4),
    ("thu.", 4),
    ("friday", 5),
    ("fri", 5),
    ("fri.", 5),
    ("saturday", 6),
    ("sat", 6),
    ("sat.", 6),
];

/// Full month names first: `FULL_MONTHS` is a prefix of this list.
pub(crate) const MONTHS: &[(&str, i32)] = &[
    ("january", 1),
    ("february", 2),
    ("march", 3),
    ("april", 4),
    ("may", 5),
    ("june", 6),
    ("july", 7),
    ("august", 8),
    ("september", 9),
    ("october", 10),
    ("november", 11),
    ("december", 12),
    ("jan", 1),
    ("jan.", 1),
    ("feb", 2),
    ("feb.", 2),
    ("mar", 3),
    ("mar.", 3),
    ("apr", 4),
    ("apr.", 4),
    ("jun", 6),
    ("jun.", 6),
    ("jul", 7),
    ("jul.", 7),
    ("aug", 8),
    ("aug.", 8),
    ("sep", 9),
    ("sep.", 9),
    ("sept", 9),
    ("sept.", 9),
    ("oct", 10),
    ("oct.", 10),
    ("nov", 11),
    ("nov.", 11),
    ("dec", 12),
    ("dec.", 12),
];

pub(crate) fn is_full_month_name(word: &str) -> bool {
    MONTHS[..12]
        .iter()
        .any(|(name, _)| name.eq_ignore_ascii_case(word))
}

const INTEGER_WORDS: &[(&str, f64)] = &[
    ("one", 1.0),
    ("two", 2.0),
    ("three", 3.0),
    ("four", 4.0),
    ("five", 5.0),
    ("six", 6.0),
    ("seven", 7.0),
    ("eight", 8.0),
    ("nine", 9.0),
    ("ten", 10.0),
    ("eleven", 11.0),
    ("twelve", 12.0),
];

const ORDINAL_WORDS: &[(&str, i32)] = &[
    ("first", 1),
    ("second", 2),
    ("third", 3),
    ("fourth", 4),
    ("fifth", 5),
    ("sixth", 6),
    ("seventh", 7),
    ("eighth", 8),
    ("ninth", 9),
    ("tenth", 10),
    ("eleventh", 11),
    ("twelfth", 12),
    ("thirteenth", 13),
    ("fourteenth", 14),
    ("fifteenth", 15),
    ("sixteenth", 16),
    ("seventeenth", 17),
    ("eighteenth", 18),
    ("nineteenth", 19),
    ("twentieth", 20),
    ("twenty first", 21),
    ("twenty-first", 21),
    ("twenty second", 22),
    ("twenty-second", 22),
    ("twenty third", 23),
    ("twenty-third", 23),
    ("twenty fourth", 24),
    ("twenty-fourth", 24),
    ("twenty fifth", 25),
    ("twenty-fifth", 25),
    ("twenty sixth", 26),
    ("twenty-sixth", 26),
    ("twenty seventh", 27),
    ("twenty-seventh", 27),
    ("twenty eighth", 28),
    ("twenty-eighth", 28),
    ("twenty ninth", 29),
    ("twenty-ninth", 29),
    ("thirtieth", 30),
    ("thirty first", 31),
    ("thirty-first", 31),
];

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Unit {
    Second,
    Minute,
    Hour,
    Day,
    Week,
    Month,
    Quarter,
    Year,
}

/// `TIME_UNIT_DICTIONARY`, abbreviations included (casual mode).
pub(crate) const UNITS: &[(&str, Unit)] = &[
    ("s", Unit::Second),
    ("sec", Unit::Second),
    ("second", Unit::Second),
    ("seconds", Unit::Second),
    ("m", Unit::Minute),
    ("min", Unit::Minute),
    ("mins", Unit::Minute),
    ("minute", Unit::Minute),
    ("minutes", Unit::Minute),
    ("h", Unit::Hour),
    ("hr", Unit::Hour),
    ("hrs", Unit::Hour),
    ("hour", Unit::Hour),
    ("hours", Unit::Hour),
    ("d", Unit::Day),
    ("day", Unit::Day),
    ("days", Unit::Day),
    ("w", Unit::Week),
    ("week", Unit::Week),
    ("weeks", Unit::Week),
    ("mo", Unit::Month),
    ("mon", Unit::Month),
    ("mos", Unit::Month),
    ("month", Unit::Month),
    ("months", Unit::Month),
    ("qtr", Unit::Quarter),
    ("quarter", Unit::Quarter),
    ("quarters", Unit::Quarter),
    ("y", Unit::Year),
    ("yr", Unit::Year),
    ("year", Unit::Year),
    ("years", Unit::Year),
];

/// `ORDINAL_NUMBER_PATTERN`: an ordinal word, or `\d{1,2}` with an optional
/// `st|nd|rd|th`. Candidates carry `parseOrdinalNumberPattern`'s value.
pub(crate) fn ordinal(t: &Text, pos: usize) -> Vec<(usize, i32)> {
    let mut found = t.words(pos, ORDINAL_WORDS);
    for len in (1..=t.digits(pos).min(2)).rev() {
        let end = pos + len;
        let value = t.slice(pos..end).parse().unwrap_or(0);
        found.extend(
            t.alts(end, &["st", "nd", "rd", "th"])
                .into_iter()
                .map(|e| (e, value)),
        );
        found.push((end, value));
    }
    found
}

/// `YEAR_PATTERN`: `2026`, `26`, `1999 AD`, `500 BC`, … Candidates carry
/// `parseYear`'s value (two-digit years: `> 50` → 19xx, else 20xx).
pub(crate) fn year(t: &Text, pos: usize) -> Vec<(usize, i32)> {
    let digits = t.digits(pos);
    let number = |len: usize| t.slice(pos..pos + len).parse::<i32>().unwrap_or(0);
    let first = t.at(pos).unwrap_or(' ');
    let mut found = Vec::new();
    // [1-9][0-9]{0,3}\s{0,2}(?:BE|AD|BC|BCE|CE)
    if ('1'..='9').contains(&first) {
        for len in (1..=digits.min(4)).rev() {
            let n = number(len);
            for s in t.spaces(pos + len, 0, 2) {
                for (era, value) in [
                    ("be", n - 543),
                    ("ad", n),
                    ("bc", -n),
                    ("bce", -n),
                    ("ce", n),
                ] {
                    if let Some(end) = t.lit(s, era) {
                        found.push((end, value));
                    }
                }
            }
        }
    }
    // [1-2][0-9]{3} | [5-9][0-9] | 2[0-5]
    if digits >= 4 && matches!(first, '1' | '2') {
        found.push((pos + 4, number(4)));
    }
    if digits >= 2 && ('5'..='9').contains(&first) {
        found.push((pos + 2, most_likely_ad_year(number(2))));
    }
    if digits >= 2 && first == '2' && matches!(t.at(pos + 1), Some('0'..='5')) {
        found.push((pos + 2, most_likely_ad_year(number(2))));
    }
    found
}

/// `findMostLikelyADYear`.
fn most_likely_ad_year(year: i32) -> i32 {
    match year {
        0..=50 => year + 2000,
        51..=99 => year + 1900,
        _ => year,
    }
}

/// `NUMBER_PATTERN`: `one`…`twelve`, `3`, `1.5`, `half (an)`, `a`, `an`,
/// `a few`, `few`, `several`, `the`, `a couple of`. Candidate ends.
fn number(t: &Text, pos: usize) -> Vec<usize> {
    let mut found: Vec<usize> = t
        .words(pos, INTEGER_WORDS)
        .into_iter()
        .map(|(end, _)| end)
        .collect();
    let digits = t.digits(pos);
    found.extend((1..=digits).rev().map(|len| pos + len));
    if digits > 0 && t.at(pos + digits) == Some('.') {
        let point = pos + digits + 1;
        found.extend((1..=t.digits(point)).rev().map(|len| point + len));
    }
    if let Some(end) = t.lit(pos, "half") {
        for s in t.spaces(end, 0, 2) {
            found.extend(t.alts(s, &["an", "a"]));
        }
        found.push(end);
    }
    for article in t.alts(pos, &["an", "a"]) {
        if t.is_boundary(article) {
            for s in t.spaces(article, 0, 2) {
                found.extend(t.lit(s, "few"));
            }
            found.push(article);
        }
    }
    found.extend(t.alts(pos, &["few", "several", "the"]));
    for s in t.lit(pos, "a").into_iter().chain([pos]) {
        for s in t.spaces(s, 0, 2) {
            if let Some(couple) = t.lit(s, "couple") {
                for s in t.spaces(couple, 0, 2) {
                    found.extend(t.lit(s, "of"));
                    found.push(s);
                }
            }
        }
    }
    found
}

/// `parseNumberPattern`.
fn number_value(text: &str) -> f64 {
    let lower = text.to_ascii_lowercase();
    if let Some(&(_, value)) = INTEGER_WORDS.iter().find(|(word, _)| *word == lower) {
        value
    } else if matches!(lower.as_str(), "a" | "an" | "the") {
        1.0
    } else if lower.contains("few") {
        3.0
    } else if lower.contains("half") {
        0.5
    } else if lower.contains("couple") {
        2.0
    } else if lower.contains("several") {
        7.0
    } else {
        lower.parse().unwrap_or(f64::NAN)
    }
}

/// One `NUMBER\s{0,3}UNIT`: `(number end, end, unit)` candidates.
fn single_unit(t: &Text, pos: usize) -> Vec<(usize, usize, Unit)> {
    let mut found = Vec::new();
    for number_end in number(t, pos) {
        for s in t.spaces(number_end, 0, 3) {
            for (end, unit) in t.words(s, UNITS) {
                found.push((number_end, end, unit));
            }
        }
    }
    found
}

/// `TIME_UNITS_PATTERN`: `(about|around)? 2 hours (, and 30 min)…`, up to
/// eleven units. Candidate ends.
pub(crate) fn time_units(t: &Text, pos: usize) -> Vec<usize> {
    let mut starts = Vec::new();
    for end in t.alts(pos, &["about", "around"]) {
        starts.extend(t.spaces(end, 0, 3));
    }
    starts.push(pos);
    let mut found = Vec::new();
    for start in starts {
        for (_, end, _) in single_unit(t, start) {
            more_units(t, end, 10, &mut found);
        }
    }
    dedup(found)
}

/// `(?:CONNECTOR UNIT){0,budget}` after `end`, greedy.
fn more_units(t: &Text, end: usize, budget: usize, found: &mut Vec<usize>) {
    if budget > 0 {
        for next in unit_connector(t, end) {
            for (_, unit_end, _) in single_unit(t, next) {
                more_units(t, unit_end, budget - 1, found);
            }
        }
    }
    found.push(end);
}

/// `\s{0,5},?(?:\s*and)?\s{0,5}`
fn unit_connector(t: &Text, pos: usize) -> Vec<usize> {
    let mut found = Vec::new();
    for s in t.spaces(pos, 0, 5) {
        for s in t.lit(s, ",").into_iter().chain([s]) {
            let mut ands: Vec<usize> = t.any_spaces(s).filter_map(|a| t.lit(a, "and")).collect();
            ands.push(s);
            for a in ands {
                found.extend(t.spaces(a, 0, 5));
            }
        }
    }
    dedup(found)
}

/// A relative amount of time, by unit (chrono-node's `Duration`). Values may
/// be fractional; `add_duration` carries fractions into smaller units.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub(crate) struct Duration {
    pub year: Option<f64>,
    pub quarter: Option<f64>,
    pub month: Option<f64>,
    pub week: Option<f64>,
    pub day: Option<f64>,
    pub hour: Option<f64>,
    pub minute: Option<f64>,
    pub second: Option<f64>,
    pub millisecond: Option<f64>,
}

impl Duration {
    pub fn days(days: f64) -> Self {
        Self {
            day: Some(days),
            ..Self::default()
        }
    }

    pub fn of(unit: Unit, value: f64) -> Self {
        let mut duration = Self::default();
        duration.set(unit, value);
        duration
    }

    fn set(&mut self, unit: Unit, value: f64) {
        let slot = match unit {
            Unit::Second => &mut self.second,
            Unit::Minute => &mut self.minute,
            Unit::Hour => &mut self.hour,
            Unit::Day => &mut self.day,
            Unit::Week => &mut self.week,
            Unit::Month => &mut self.month,
            Unit::Quarter => &mut self.quarter,
            Unit::Year => &mut self.year,
        };
        *slot = Some(value);
    }

    /// `reverseDuration`.
    pub fn reversed(self) -> Self {
        let neg = |v: Option<f64>| v.map(|v| -v);
        Self {
            year: neg(self.year),
            quarter: neg(self.quarter),
            month: neg(self.month),
            week: neg(self.week),
            day: neg(self.day),
            hour: neg(self.hour),
            minute: neg(self.minute),
            second: neg(self.second),
            millisecond: neg(self.millisecond),
        }
    }

    pub fn has_time(&self) -> bool {
        self.hour.is_some()
            || self.minute.is_some()
            || self.second.is_some()
            || self.millisecond.is_some()
    }
}

/// `parseDuration`: collect every `NUMBER UNIT` in `text`. Like chrono-node it
/// searches anywhere in the text but skips ahead by the match's length only.
pub(crate) fn parse_duration(text: &str) -> Option<Duration> {
    let mut duration = Duration::default();
    let mut found_any = false;
    let mut remaining = text.to_owned();
    loop {
        let t = Text::new(&remaining);
        let Some((start, number_end, end, unit)) = (0..t.len()).find_map(|p| {
            let &(number_end, end, unit) = single_unit(&t, p).first()?;
            Some((p, number_end, end, unit))
        }) else {
            break;
        };
        // Skip letter-only matches such as "them" ("the" + "m").
        if !t.slice(start..end).chars().all(|c| c.is_ascii_alphabetic()) {
            duration.set(unit, number_value(&t.slice(start..number_end)));
            found_any = true;
        }
        remaining = js_trim(&t.slice(end - start..t.len())).to_owned();
    }
    found_any.then_some(duration)
}
