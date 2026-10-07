//! `EventTime`: the four shapes of time calendar data uses, and its RPC wire
//! form (`{ "kind": "date", "date" }`, …), which is caldir-core's serde shape.

use std::fmt;
use std::str::FromStr;

use chrono::{DateTime, NaiveDate, NaiveDateTime, SecondsFormat, Utc};
use chrono_tz::Tz;
use serde::{Deserialize, Deserializer, Serialize, Serializer};

use crate::zoned::{offset_secs, resolve_local};

/// One end of an event.
///
/// - `Date`: an all-day calendar date with no clock and no zone.
/// - `Utc`: a genuine UTC instant.
/// - `Floating`: a wallclock date/time with no zone.
/// - `Zoned`: an instant plus its IANA zone (a Temporal `ZonedDateTime`). Parsing
///   a zoned wallclock that falls in a DST gap moves it forward (see `zoned`).
///
/// `PartialEq` is `isSameEventTime`: same kind and same value, zone included.
#[derive(Clone, Debug)]
pub enum EventTime {
    Date(NaiveDate),
    Utc(DateTime<Utc>),
    Floating(NaiveDateTime),
    Zoned(DateTime<Tz>),
}

impl PartialEq for EventTime {
    fn eq(&self, other: &Self) -> bool {
        match (self, other) {
            (Self::Date(a), Self::Date(b)) => a == b,
            (Self::Utc(a), Self::Utc(b)) => a == b,
            (Self::Floating(a), Self::Floating(b)) => a == b,
            (Self::Zoned(a), Self::Zoned(b)) => a == b && a.timezone() == b.timezone(),
            _ => false,
        }
    }
}

impl Eq for EventTime {}

/// A `[start, end)` pair of event times.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct EventTimeRange {
    pub start: EventTime,
    pub end: EventTime,
}

impl EventTimeRange {
    pub fn new(start: EventTime, end: EventTime) -> Self {
        Self { start, end }
    }
}

impl EventTime {
    /// A timed value in `tz` at `wallclock` ("compatible" resolution).
    pub fn zoned(wallclock: NaiveDateTime, tz: Tz) -> Self {
        Self::Zoned(resolve_local(wallclock, tz))
    }

    pub fn is_all_day(&self) -> bool {
        matches!(self, Self::Date(_))
    }
}

/// Error for an RPC event time that can't be parsed.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ParseError(pub String);

impl fmt::Display for ParseError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for ParseError {}

/// Parse an IANA zone id. Case-insensitive like Temporal; the result carries the
/// canonical spelling.
pub fn parse_tz(tzid: &str) -> Result<Tz, ParseError> {
    Tz::from_str(tzid)
        .ok()
        .or_else(|| {
            chrono_tz::TZ_VARIANTS
                .iter()
                .copied()
                .find(|tz| tz.name().eq_ignore_ascii_case(tzid))
        })
        .ok_or_else(|| ParseError(format!("Invalid time zone: {tzid}")))
}

pub(crate) fn parse_date(s: &str) -> Result<NaiveDate, ParseError> {
    NaiveDate::parse_from_str(s, "%Y-%m-%d").map_err(|_| ParseError(format!("Invalid date: {s}")))
}

pub(crate) fn parse_wallclock(s: &str) -> Result<NaiveDateTime, ParseError> {
    ["%Y-%m-%dT%H:%M:%S%.f", "%Y-%m-%dT%H:%M"]
        .iter()
        .find_map(|format| NaiveDateTime::parse_from_str(s, format).ok())
        .ok_or_else(|| ParseError(format!("Invalid wallclock: {s}")))
}

fn parse_instant(s: &str) -> Result<DateTime<Utc>, ParseError> {
    DateTime::parse_from_rfc3339(s)
        .map(|dt| dt.with_timezone(&Utc))
        .map_err(|_| ParseError(format!("Invalid instant: {s}")))
}

/// `PlainDateTime.toString({ smallestUnit: "second" })`.
pub(crate) fn format_wallclock(wallclock: &NaiveDateTime) -> String {
    wallclock.format("%Y-%m-%dT%H:%M:%S").to_string()
}

/// `Instant.toString()`: seconds always, fractional digits only when non-zero.
pub(crate) fn format_instant(instant: &DateTime<Utc>) -> String {
    let base = instant.to_rfc3339_opts(SecondsFormat::Secs, true);
    let nanos = instant.timestamp_subsec_nanos();
    if nanos == 0 {
        return base;
    }
    let fraction = format!("{nanos:09}");
    format!(
        "{}.{}Z",
        base.trim_end_matches('Z'),
        fraction.trim_end_matches('0')
    )
}

/// `±HH:MM` offset string as Temporal prints it.
pub fn format_offset(offset_secs: i32) -> String {
    let sign = if offset_secs < 0 { '-' } else { '+' };
    let abs = offset_secs.unsigned_abs();
    let (hours, minutes, seconds) = (abs / 3600, abs / 60 % 60, abs % 60);
    if seconds == 0 {
        format!("{sign}{hours:02}:{minutes:02}")
    } else {
        format!("{sign}{hours:02}:{minutes:02}:{seconds:02}")
    }
}

/// Offset string of a zoned value, e.g. `"+02:00"`.
pub fn zoned_offset(dt: &DateTime<Tz>) -> String {
    format_offset(offset_secs(dt))
}

/// The RPC wire form of an `EventTime`.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum WireEventTime {
    Date { date: String },
    DatetimeUtc { instant: String },
    DatetimeFloating { wallclock: String },
    DatetimeZoned { wallclock: String, tzid: String },
}

impl TryFrom<&WireEventTime> for EventTime {
    type Error = ParseError;

    fn try_from(wire: &WireEventTime) -> Result<Self, ParseError> {
        Ok(match wire {
            WireEventTime::Date { date } => Self::Date(parse_date(date)?),
            WireEventTime::DatetimeUtc { instant } => Self::Utc(parse_instant(instant)?),
            WireEventTime::DatetimeFloating { wallclock } => {
                Self::Floating(parse_wallclock(wallclock)?)
            }
            WireEventTime::DatetimeZoned { wallclock, tzid } => {
                Self::zoned(parse_wallclock(wallclock)?, parse_tz(tzid)?)
            }
        })
    }
}

impl From<&EventTime> for WireEventTime {
    fn from(time: &EventTime) -> Self {
        match time {
            EventTime::Date(date) => Self::Date {
                date: date.to_string(),
            },
            EventTime::Utc(instant) => Self::DatetimeUtc {
                instant: format_instant(instant),
            },
            EventTime::Floating(wallclock) => Self::DatetimeFloating {
                wallclock: format_wallclock(wallclock),
            },
            EventTime::Zoned(dt) => Self::DatetimeZoned {
                wallclock: format_wallclock(&dt.naive_local()),
                tzid: dt.timezone().name().to_owned(),
            },
        }
    }
}

impl Serialize for EventTime {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        WireEventTime::from(self).serialize(serializer)
    }
}

impl<'de> Deserialize<'de> for EventTime {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let wire = WireEventTime::deserialize(deserializer)?;
        EventTime::try_from(&wire).map_err(serde::de::Error::custom)
    }
}
