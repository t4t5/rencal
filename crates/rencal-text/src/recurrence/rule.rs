//! `RRule`: an RRULE value as rrule.js parses (`rrulestr`) and prints
//! (`toString`) it.
//!
//! The parts are kept in the order they were given, like rrule.js's
//! `origOptions`, because that order decides both the printed string and
//! `to_text`'s "(~ approximate)" suffix. Nothing is defaulted from a DTSTART
//! here; that happens in `RRule::anchor`.

use std::fmt;
use std::mem::discriminant;
use std::str::FromStr;

use chrono::{NaiveDate, NaiveDateTime, Weekday};
use rencal_time::event::Recurrence;

use super::RRuleError;

/// `FREQ`, ordered like rrule.js's numeric frequencies (yearly lowest), so
/// `freq > Frequency::Monthly` reads as in rrule.js.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum Frequency {
    Yearly,
    Monthly,
    Weekly,
    Daily,
    Hourly,
    Minutely,
    Secondly,
}

impl Frequency {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Yearly => "YEARLY",
            Self::Monthly => "MONTHLY",
            Self::Weekly => "WEEKLY",
            Self::Daily => "DAILY",
            Self::Hourly => "HOURLY",
            Self::Minutely => "MINUTELY",
            Self::Secondly => "SECONDLY",
        }
    }

    fn parse(s: &str) -> Option<Self> {
        [
            Self::Yearly,
            Self::Monthly,
            Self::Weekly,
            Self::Daily,
            Self::Hourly,
            Self::Minutely,
            Self::Secondly,
        ]
        .into_iter()
        .find(|f| f.as_str().eq_ignore_ascii_case(s))
    }
}

/// A `BYDAY` entry: a weekday, optionally the nth one (`2TU`, `-1FR`).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct NWeekday {
    pub weekday: Weekday,
    pub n: Option<i32>,
}

impl NWeekday {
    pub fn every(weekday: Weekday) -> Self {
        Self { weekday, n: None }
    }

    pub fn nth(n: i32, weekday: Weekday) -> Self {
        Self {
            weekday,
            n: Some(n),
        }
    }
}

impl fmt::Display for NWeekday {
    /// rrule.js `Weekday.toString`: positive ordinals get a `+` (`+2TU`).
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self.n {
            Some(n) if n > 0 => write!(f, "+{n}{}", weekday_code(self.weekday)),
            Some(n) => write!(f, "{n}{}", weekday_code(self.weekday)),
            None => f.write_str(weekday_code(self.weekday)),
        }
    }
}

pub(crate) fn weekday_code(weekday: Weekday) -> &'static str {
    match weekday {
        Weekday::Mon => "MO",
        Weekday::Tue => "TU",
        Weekday::Wed => "WE",
        Weekday::Thu => "TH",
        Weekday::Fri => "FR",
        Weekday::Sat => "SA",
        Weekday::Sun => "SU",
    }
}

fn parse_weekday_code(s: &str) -> Option<Weekday> {
    [
        Weekday::Mon,
        Weekday::Tue,
        Weekday::Wed,
        Weekday::Thu,
        Weekday::Fri,
        Weekday::Sat,
        Weekday::Sun,
    ]
    .into_iter()
    .find(|w| weekday_code(*w).eq_ignore_ascii_case(s))
}

/// One `KEY=value` part of a rule.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Part {
    Freq(Frequency),
    Interval(u32),
    Count(u32),
    /// Read as a UTC wallclock; rrule.js compares it against its "fake UTC"
    /// occurrence wallclocks.
    Until(NaiveDateTime),
    Wkst(Weekday),
    ByDay(Vec<NWeekday>),
    BySetPos(Vec<i32>),
    ByMonth(Vec<i32>),
    ByMonthDay(Vec<i32>),
    ByYearDay(Vec<i32>),
    ByWeekNo(Vec<i32>),
    ByHour(Vec<i32>),
    ByMinute(Vec<i32>),
    BySecond(Vec<i32>),
}

impl Part {
    /// rrule.js's option name, as `to_text` checks it.
    pub(crate) fn option_name(&self) -> &'static str {
        match self {
            Self::Freq(_) => "freq",
            Self::Interval(_) => "interval",
            Self::Count(_) => "count",
            Self::Until(_) => "until",
            Self::Wkst(_) => "wkst",
            Self::ByDay(_) => "byweekday",
            Self::BySetPos(_) => "bysetpos",
            Self::ByMonth(_) => "bymonth",
            Self::ByMonthDay(_) => "bymonthday",
            Self::ByYearDay(_) => "byyearday",
            Self::ByWeekNo(_) => "byweekno",
            Self::ByHour(_) => "byhour",
            Self::ByMinute(_) => "byminute",
            Self::BySecond(_) => "bysecond",
        }
    }
}

impl fmt::Display for Part {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let list = |name: &str, values: &[i32], f: &mut fmt::Formatter<'_>| {
            write!(f, "{name}={}", join(values))
        };
        match self {
            Self::Freq(freq) => write!(f, "FREQ={}", freq.as_str()),
            Self::Interval(n) => write!(f, "INTERVAL={n}"),
            Self::Count(n) => write!(f, "COUNT={n}"),
            Self::Until(until) => write!(f, "UNTIL={}", format_utc_stamp(until)),
            Self::Wkst(weekday) => write!(f, "WKST={}", weekday_code(*weekday)),
            Self::ByDay(days) => write!(f, "BYDAY={}", join(days)),
            Self::BySetPos(v) => list("BYSETPOS", v, f),
            Self::ByMonth(v) => list("BYMONTH", v, f),
            Self::ByMonthDay(v) => list("BYMONTHDAY", v, f),
            Self::ByYearDay(v) => list("BYYEARDAY", v, f),
            Self::ByWeekNo(v) => list("BYWEEKNO", v, f),
            Self::ByHour(v) => list("BYHOUR", v, f),
            Self::ByMinute(v) => list("BYMINUTE", v, f),
            Self::BySecond(v) => list("BYSECOND", v, f),
        }
    }
}

pub(crate) fn join<T: fmt::Display>(values: &[T]) -> String {
    values
        .iter()
        .map(ToString::to_string)
        .collect::<Vec<_>>()
        .join(",")
}

/// `20260625T000000Z`, rrule.js `timeToUntilString`.
pub(crate) fn format_utc_stamp(wallclock: &NaiveDateTime) -> String {
    wallclock.format("%Y%m%dT%H%M%SZ").to_string()
}

/// A recurrence rule, its parts in the order they were given.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RRule {
    parts: Vec<Part>,
}

impl RRule {
    pub fn new(freq: Frequency) -> Self {
        Self {
            parts: vec![Part::Freq(freq)],
        }
    }

    /// Set a part. A part of the same kind is replaced where it stands, as
    /// assigning an existing key of a JS object keeps its position.
    pub fn with(mut self, part: Part) -> Self {
        match self
            .parts
            .iter_mut()
            .find(|p| discriminant(*p) == discriminant(&part))
        {
            Some(existing) => *existing = part,
            None => self.parts.push(part),
        }
        self
    }

    pub fn parts(&self) -> &[Part] {
        &self.parts
    }

    fn find<T>(&self, f: impl Fn(&Part) -> Option<T>) -> Option<T> {
        self.parts.iter().find_map(f)
    }

    pub fn freq(&self) -> Frequency {
        self.find(|p| match p {
            Part::Freq(freq) => Some(*freq),
            _ => None,
        })
        .expect("a rule always has FREQ")
    }

    /// `INTERVAL`, defaulting to 1.
    pub fn interval(&self) -> u32 {
        self.find(|p| match p {
            Part::Interval(n) => Some(*n),
            _ => None,
        })
        .unwrap_or(1)
    }

    pub fn count(&self) -> Option<u32> {
        self.find(|p| match p {
            Part::Count(n) => Some(*n),
            _ => None,
        })
    }

    pub fn until(&self) -> Option<NaiveDateTime> {
        self.find(|p| match p {
            Part::Until(until) => Some(*until),
            _ => None,
        })
    }

    pub fn wkst(&self) -> Option<Weekday> {
        self.find(|p| match p {
            Part::Wkst(weekday) => Some(*weekday),
            _ => None,
        })
    }

    pub fn by_day(&self) -> Option<&[NWeekday]> {
        self.parts.iter().find_map(|p| match p {
            Part::ByDay(days) => Some(days.as_slice()),
            _ => None,
        })
    }

    /// The values of a numeric `BY*` part, e.g. `rule.list(Part::ByHour)`.
    pub fn list(&self, kind: fn(Vec<i32>) -> Part) -> Option<&[i32]> {
        let kind = discriminant(&kind(Vec::new()));
        self.parts.iter().find_map(|p| {
            if discriminant(p) != kind {
                return None;
            }
            match p {
                Part::BySetPos(v)
                | Part::ByMonth(v)
                | Part::ByMonthDay(v)
                | Part::ByYearDay(v)
                | Part::ByWeekNo(v)
                | Part::ByHour(v)
                | Part::ByMinute(v)
                | Part::BySecond(v) => Some(v.as_slice()),
                _ => None,
            }
        })
    }

    /// The RRULE value without the `RRULE:` prefix, as caldir stores it.
    pub fn value(&self) -> String {
        self.parts
            .iter()
            .map(ToString::to_string)
            .collect::<Vec<_>>()
            .join(";")
    }

    /// A recurrence with this rule and no exceptions or additions.
    pub fn to_recurrence(&self) -> Recurrence {
        Recurrence {
            rrule: self.value(),
            exdates: Vec::new(),
            rdates: Vec::new(),
        }
    }
}

impl fmt::Display for RRule {
    /// rrule.js `RRule.toString()` for a rule without DTSTART: `RRULE:…`.
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "RRULE:{}", self.value())
    }
}

impl FromStr for RRule {
    type Err = RRuleError;

    /// rrule.js `rrulestr` for a single RRULE value, with or without the
    /// `RRULE:` prefix. Unlike rrule.js, lowercase weekday codes are accepted
    /// and empty parts (a trailing `;`) skipped where it threw, and an unknown
    /// `WKST` is an error where it silently fell back to Monday.
    fn from_str(s: &str) -> Result<Self, RRuleError> {
        let s = s.trim();
        let s = match s.get(..6) {
            Some(prefix) if prefix.eq_ignore_ascii_case("RRULE:") => &s[6..],
            _ => s,
        };

        let mut rule = RRule { parts: Vec::new() };
        for attr in s.split(';').filter(|a| !a.is_empty()) {
            let mut kv = attr.split('=');
            let key = kv.next().unwrap_or_default();
            let value = kv
                .next()
                .ok_or_else(|| RRuleError(format!("Missing value for RRULE property '{key}'")))?;
            rule = rule.with(parse_part(key, value)?);
        }

        if !rule.parts.iter().any(|p| matches!(p, Part::Freq(_))) {
            return Err(RRuleError(format!("Invalid frequency in RRULE: {s}")));
        }
        if let Some(positions) = rule.list(Part::BySetPos)
            && positions
                .iter()
                .any(|&p| p == 0 || !(-366..=366).contains(&p))
        {
            return Err(RRuleError(
                "bysetpos must be between 1 and 366, or between -366 and -1".into(),
            ));
        }
        Ok(rule)
    }
}

fn parse_part(key: &str, value: &str) -> Result<Part, RRuleError> {
    let invalid = || RRuleError(format!("Invalid RRULE value: {key}={value}"));
    let numbers = || -> Result<Vec<i32>, RRuleError> {
        value
            .split(',')
            .map(|n| parse_int(n).ok_or_else(invalid))
            .collect()
    };
    let unsigned = || {
        parse_int(value)
            .and_then(|n| u32::try_from(n).ok())
            .ok_or_else(invalid)
    };

    Ok(match key.to_ascii_uppercase().as_str() {
        "FREQ" => Part::Freq(Frequency::parse(value).ok_or_else(invalid)?),
        "INTERVAL" => Part::Interval(unsigned()?),
        "COUNT" => Part::Count(unsigned()?),
        "UNTIL" => Part::Until(parse_until(value).ok_or_else(invalid)?),
        "WKST" => Part::Wkst(parse_weekday_code(value).ok_or_else(invalid)?),
        "BYDAY" | "BYWEEKDAY" => Part::ByDay(
            value
                .split(',')
                .map(|day| parse_nweekday(day).ok_or_else(invalid))
                .collect::<Result<_, _>>()?,
        ),
        "BYSETPOS" => Part::BySetPos(numbers()?),
        "BYMONTH" => Part::ByMonth(numbers()?),
        "BYMONTHDAY" => Part::ByMonthDay(numbers()?),
        "BYYEARDAY" => Part::ByYearDay(numbers()?),
        "BYWEEKNO" => Part::ByWeekNo(numbers()?),
        "BYHOUR" => Part::ByHour(numbers()?),
        "BYMINUTE" => Part::ByMinute(numbers()?),
        "BYSECOND" => Part::BySecond(numbers()?),
        _ => return Err(RRuleError(format!("Unknown RRULE property '{key}'"))),
    })
}

/// JS `/^[+-]?\d+$/` then `Number`.
fn parse_int(s: &str) -> Option<i32> {
    let digits = s.strip_prefix(['+', '-']).unwrap_or(s);
    if digits.is_empty() || !digits.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    s.parse().ok()
}

/// `MO`, or `[+-]n` (one or two digits, non-zero) followed by a weekday code.
fn parse_nweekday(s: &str) -> Option<NWeekday> {
    if s.len() == 2 {
        return parse_weekday_code(s).map(NWeekday::every);
    }
    let split = s.len().checked_sub(2)?;
    let (n, code) = (s.get(..split)?, s.get(split..)?);
    let digits = n.strip_prefix(['+', '-']).unwrap_or(n);
    if !(1..=2).contains(&digits.len()) {
        return None;
    }
    let n = parse_int(n).filter(|&n| n != 0)?;
    Some(NWeekday::nth(n, parse_weekday_code(code)?))
}

/// rrule.js `untilStringToDate`: `YYYYMMDD` or `YYYYMMDDTHHMMSS[Z]`, read as UTC.
fn parse_until(s: &str) -> Option<NaiveDateTime> {
    let num = |range: std::ops::Range<usize>| -> Option<u32> {
        let part = s.get(range)?;
        if !part.bytes().all(|b| b.is_ascii_digit()) {
            return None;
        }
        part.parse().ok()
    };
    let date = NaiveDate::from_ymd_opt(num(0..4)? as i32, num(4..6)?, num(6..8)?)?;
    let time = s.get(8..)?;
    match time.strip_suffix('Z').unwrap_or(time) {
        "" if time.is_empty() => date.and_hms_opt(0, 0, 0),
        t if t.len() == 7 && t.starts_with('T') => {
            date.and_hms_opt(num(9..11)?, num(11..13)?, num(13..15)?)
        }
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_part_order_and_rrule_js_weekday_form() {
        let rule: RRule = "RRULE:BYDAY=2TU,-1FR;FREQ=MONTHLY".parse().unwrap();
        assert_eq!(rule.to_string(), "RRULE:BYDAY=+2TU,-1FR;FREQ=MONTHLY");
    }

    #[test]
    fn until_is_printed_as_utc() {
        let rule: RRule = "FREQ=WEEKLY;UNTIL=20260625".parse().unwrap();
        assert_eq!(rule.value(), "FREQ=WEEKLY;UNTIL=20260625T000000Z");
    }

    #[test]
    fn rejects_malformed_rules() {
        for bad in [
            "",
            "FREQ=NOPE",
            "INTERVAL=2",
            "FREQ=DAILY;FOO=1",
            "FREQ=DAILY;COUNT=x",
            "FREQ=WEEKLY;BYDAY=0MO",
            "FREQ=MONTHLY;BYSETPOS=0;BYDAY=MO",
            "FREQ=DAILY;UNTIL=2026",
            "not-an-rrule",
        ] {
            assert!(bad.parse::<RRule>().is_err(), "{bad}");
        }
    }

    #[test]
    fn repeated_key_keeps_first_position() {
        let rule: RRule = "FREQ=DAILY;COUNT=2;INTERVAL=3;COUNT=5".parse().unwrap();
        assert_eq!(rule.value(), "FREQ=DAILY;COUNT=5;INTERVAL=3");
    }
}
