//! chrono-node's `ParsingComponents` / `ParsingResult`, and the JS `Date`
//! arithmetic they are built on.
//!
//! A JS `Date` is modelled as the wallclock its local getters return: a
//! `NaiveDateTime` that exists in the reference zone (the JS process zone in the
//! TS app; the viewer's zone here). Constructing one carries out-of-range
//! fields over (`new Date(2026, 3, 31)` is May 1st) and moves a wallclock in a
//! DST gap forward, as V8 does.

use std::ops::Range;

use chrono::{Datelike, NaiveDate, NaiveDateTime, NaiveTime, TimeDelta, Timelike};
use rencal_time::Tz;
use rencal_time::zoned::{offset_secs, resolve_local};

use super::lexicon::Duration;

pub(crate) const AM: i32 = 0;
pub(crate) const PM: i32 = 1;

/// The parse's "now": the viewer's wallclock and zone.
#[derive(Clone, Copy, Debug)]
pub(crate) struct Reference {
    pub now: NaiveDateTime,
    pub tz: Tz,
}

impl Reference {
    pub fn new(now: NaiveDateTime, tz: Tz) -> Self {
        Self {
            now: local(tz, now),
            tz,
        }
    }

    /// `ReferenceWithTimezone.getTimezoneOffset()`: minutes east of UTC.
    pub fn offset_minutes(&self) -> i32 {
        offset_minutes(self.tz, self.now)
    }
}

/// The wallclock a JS `Date` built from `wallclock` reads back in `tz`.
fn local(tz: Tz, wallclock: NaiveDateTime) -> NaiveDateTime {
    resolve_local(wallclock, tz).naive_local()
}

fn offset_minutes(tz: Tz, wallclock: NaiveDateTime) -> i32 {
    offset_secs(&resolve_local(wallclock, tz)) / 60
}

/// The broken-down fields of a JS `Date` (month zero-based), any of which may
/// be out of range before `make`.
#[derive(Clone, Copy, Debug)]
struct Fields {
    year: i64,
    month0: i64,
    day: i64,
    hour: i64,
    minute: i64,
    second: i64,
    millisecond: i64,
}

impl Fields {
    fn of(dt: NaiveDateTime) -> Self {
        Self {
            year: i64::from(dt.year()),
            month0: i64::from(dt.month0()),
            day: i64::from(dt.day()),
            hour: i64::from(dt.hour()),
            minute: i64::from(dt.minute()),
            second: i64::from(dt.second()),
            millisecond: i64::from(dt.nanosecond() / 1_000_000),
        }
    }

    /// `new Date(y, m, d, h, min, s, ms)` (JS MakeDay/MakeTime), or `None` past
    /// chrono's range (an "Invalid Date").
    fn make(self, tz: Tz) -> Option<NaiveDateTime> {
        let year = self.year.checked_add(self.month0.div_euclid(12))?;
        let month = u32::try_from(self.month0.rem_euclid(12) + 1).ok()?;
        let first = NaiveDate::from_ymd_opt(i32::try_from(year).ok()?, month, 1)?;
        let millis = self
            .hour
            .checked_mul(60)?
            .checked_add(self.minute)?
            .checked_mul(60)?
            .checked_add(self.second)?
            .checked_mul(1000)?
            .checked_add(self.millisecond)?;
        let wallclock = first
            .checked_add_signed(TimeDelta::try_days(self.day - 1)?)?
            .and_time(NaiveTime::MIN)
            .checked_add_signed(TimeDelta::try_milliseconds(millis)?)?;
        Some(local(tz, wallclock))
    }
}

/// `date.setDate(date.getDate() + days)`.
pub(crate) fn add_days(tz: Tz, date: NaiveDateTime, days: i64) -> NaiveDateTime {
    add_duration(tz, date, &mut Duration::days(days as f64)).unwrap_or(date)
}

/// chrono-node's `addDuration`: each unit through the matching local `Date`
/// setter, largest first. Fractions carry into the next smaller unit, and that
/// unit is added to `duration` (callers look at which units it has afterwards).
pub(crate) fn add_duration(
    tz: Tz,
    date: NaiveDateTime,
    duration: &mut Duration,
) -> Option<NaiveDateTime> {
    /// Whole part (bounded so the field arithmetic can't overflow) and fraction.
    fn split(value: f64) -> Option<(i64, f64)> {
        let floor = value.floor();
        (floor.abs() < 1e9).then_some((floor as i64, value - floor))
    }
    fn carry(slot: &mut Option<f64>, amount: f64) {
        *slot = Some(slot.unwrap_or(0.0) + amount);
    }
    let shift = |date: NaiveDateTime, change: &dyn Fn(&mut Fields)| {
        let mut fields = Fields::of(date);
        change(&mut fields);
        fields.make(tz)
    };

    let mut date = date;
    if let Some(year) = duration.year {
        let (whole, fraction) = split(year)?;
        date = shift(date, &|f| f.year += whole)?;
        if fraction > 0.0 {
            carry(&mut duration.month, fraction * 12.0);
        }
    }
    if let Some(quarter) = duration.quarter {
        let (whole, _) = split(quarter)?;
        date = shift(date, &|f| f.month0 += whole * 3)?;
    }
    if let Some(month) = duration.month {
        let (whole, fraction) = split(month)?;
        date = shift(date, &|f| f.month0 += whole)?;
        if fraction > 0.0 {
            carry(&mut duration.week, fraction * 4.0);
        }
    }
    if let Some(week) = duration.week {
        let (whole, fraction) = split(week)?;
        date = shift(date, &|f| f.day += whole * 7)?;
        if fraction > 0.0 {
            carry(&mut duration.day, (fraction * 7.0).round());
        }
    }
    if let Some(day) = duration.day {
        let (whole, fraction) = split(day)?;
        date = shift(date, &|f| f.day += whole)?;
        if fraction > 0.0 {
            carry(&mut duration.hour, (fraction * 24.0).round());
        }
    }
    if let Some(hour) = duration.hour {
        let (whole, fraction) = split(hour)?;
        date = shift(date, &|f| f.hour += whole)?;
        if fraction > 0.0 {
            carry(&mut duration.minute, (fraction * 60.0).round());
        }
    }
    if let Some(minute) = duration.minute {
        let (whole, fraction) = split(minute)?;
        date = shift(date, &|f| f.minute += whole)?;
        if fraction > 0.0 {
            carry(&mut duration.second, (fraction * 60.0).round());
        }
    }
    if let Some(second) = duration.second {
        let (whole, fraction) = split(second)?;
        date = shift(date, &|f| f.second += whole)?;
        if fraction > 0.0 {
            carry(&mut duration.millisecond, (fraction * 1000.0).round());
        }
    }
    if let Some(millisecond) = duration.millisecond {
        let (whole, _) = split(millisecond)?;
        date = shift(date, &|f| f.millisecond += whole)?;
    }
    Some(date)
}

/// `findYearClosestToRef`: the year that puts `month`/`day` nearest the
/// reference (the reference's time of day kept).
pub(crate) fn closest_year(reference: Reference, day: i32, month: i32) -> i32 {
    let (tz, now) = (reference.tz, reference.now);
    // `date.setMonth(month - 1); date.setDate(day)`, one setter at a time.
    let date = Fields {
        month0: i64::from(month) - 1,
        ..Fields::of(now)
    }
    .make(tz)
    .and_then(|d| {
        Fields {
            day: i64::from(day),
            ..Fields::of(d)
        }
        .make(tz)
    });
    let Some(date) = date else {
        return now.year();
    };
    let distance = |d: NaiveDateTime| (d - now).num_milliseconds().abs();
    let shifted = |years: f64| {
        let mut duration = Duration {
            year: Some(years),
            ..Duration::default()
        };
        add_duration(tz, date, &mut duration).unwrap_or(date)
    };
    let (next, last) = (shifted(1.0), shifted(-1.0));
    if distance(next) < distance(date) {
        next.year()
    } else if distance(last) < distance(date) {
        last.year()
    } else {
        date.year()
    }
}

/// JS `Date.getDay()`: 0 = Sunday.
pub(crate) fn weekday(date: NaiveDateTime) -> i32 {
    date.weekday().num_days_from_sunday() as i32
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Field {
    Year,
    Month,
    Day,
    Weekday,
    Hour,
    Minute,
    Second,
    Millisecond,
    Meridiem,
    /// Minutes east of UTC; only relative expressions ("in 2 hours") set it.
    TimezoneOffset,
}

const FIELD_COUNT: usize = 10;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Slot {
    Empty,
    Known(i32),
    Implied(i32),
}

/// One end of a parsed date: each field is known (said in the text), implied
/// (filled from the reference or context) or empty. `Month` is 1-based.
#[derive(Clone, Debug)]
pub(crate) struct Components {
    slots: [Slot; FIELD_COUNT],
    reference: Reference,
}

impl Components {
    /// Everything implied: the reference's date at 12:00.
    pub fn new(reference: Reference) -> Self {
        let mut components = Self {
            slots: [Slot::Empty; FIELD_COUNT],
            reference,
        };
        components.imply_similar_date(reference.now);
        components.imply(Field::Hour, 12);
        components.imply(Field::Minute, 0);
        components.imply(Field::Second, 0);
        components.imply(Field::Millisecond, 0);
        components
    }

    /// `createRelativeFromReference`: the reference moved by `duration`.
    pub fn relative(reference: Reference, mut duration: Duration) -> Option<Self> {
        let date = add_duration(reference.tz, reference.now, &mut duration)?;
        let mut components = Self::new(reference);
        if duration.has_time() {
            components.assign_similar_time(date);
            components.assign_similar_date(date);
            components.assign(Field::TimezoneOffset, reference.offset_minutes());
            return Some(components);
        }
        components.imply_similar_time(date);
        components.imply(Field::TimezoneOffset, reference.offset_minutes());
        if duration.day.is_some() || duration.week.is_some() {
            components.assign_similar_date(date);
            if duration.day.is_some() {
                components.assign(Field::Weekday, weekday(date));
            } else {
                components.imply(Field::Weekday, weekday(date));
            }
        } else {
            components.imply(Field::Day, date.day() as i32);
            if duration.month.is_some() {
                components.assign(Field::Month, date.month() as i32);
                components.assign(Field::Year, date.year());
            } else {
                components.imply(Field::Month, date.month() as i32);
                if duration.year.is_some() {
                    components.assign(Field::Year, date.year());
                } else {
                    components.imply(Field::Year, date.year());
                }
            }
        }
        Some(components)
    }

    pub fn get(&self, field: Field) -> Option<i32> {
        match self.slots[field as usize] {
            Slot::Known(value) | Slot::Implied(value) => Some(value),
            Slot::Empty => None,
        }
    }

    fn get_or_zero(&self, field: Field) -> i64 {
        i64::from(self.get(field).unwrap_or(0))
    }

    pub fn is_certain(&self, field: Field) -> bool {
        matches!(self.slots[field as usize], Slot::Known(_))
    }

    pub fn certain_fields(&self) -> Vec<Field> {
        use Field::*;
        [
            Year,
            Month,
            Day,
            Weekday,
            Hour,
            Minute,
            Second,
            Millisecond,
            Meridiem,
            TimezoneOffset,
        ]
        .into_iter()
        .filter(|&field| self.is_certain(field))
        .collect()
    }

    /// Set `field` unless it is already known.
    pub fn imply(&mut self, field: Field, value: i32) {
        if !self.is_certain(field) {
            self.slots[field as usize] = Slot::Implied(value);
        }
    }

    pub fn assign(&mut self, field: Field, value: i32) {
        self.slots[field as usize] = Slot::Known(value);
    }

    pub fn delete(&mut self, field: Field) {
        self.slots[field as usize] = Slot::Empty;
    }

    pub fn assign_similar_date(&mut self, date: NaiveDateTime) {
        self.assign(Field::Day, date.day() as i32);
        self.assign(Field::Month, date.month() as i32);
        self.assign(Field::Year, date.year());
    }

    pub fn imply_similar_date(&mut self, date: NaiveDateTime) {
        self.imply(Field::Day, date.day() as i32);
        self.imply(Field::Month, date.month() as i32);
        self.imply(Field::Year, date.year());
    }

    pub fn assign_similar_time(&mut self, date: NaiveDateTime) {
        self.assign(Field::Hour, date.hour() as i32);
        self.assign(Field::Minute, date.minute() as i32);
        self.assign(Field::Second, date.second() as i32);
        self.assign(Field::Millisecond, (date.nanosecond() / 1_000_000) as i32);
        self.assign(Field::Meridiem, if date.hour() < 12 { AM } else { PM });
    }

    pub fn imply_similar_time(&mut self, date: NaiveDateTime) {
        self.imply(Field::Hour, date.hour() as i32);
        self.imply(Field::Minute, date.minute() as i32);
        self.imply(Field::Second, date.second() as i32);
        self.imply(Field::Millisecond, (date.nanosecond() / 1_000_000) as i32);
        self.imply(Field::Meridiem, if date.hour() < 12 { AM } else { PM });
    }

    /// `addDurationAsImplied`: re-imply the date and/or time moved by `duration`.
    pub fn add_duration_as_implied(&mut self, mut duration: Duration) {
        let Some(date) = add_duration(self.reference.tz, self.date_without_offset(), &mut duration)
        else {
            return;
        };
        let has_date = duration.day.is_some()
            || duration.week.is_some()
            || duration.month.is_some()
            || duration.year.is_some();
        if has_date {
            for field in [Field::Day, Field::Weekday, Field::Month, Field::Year] {
                self.delete(field);
            }
            self.imply(Field::Day, date.day() as i32);
            self.imply(Field::Weekday, weekday(date));
            self.imply(Field::Month, date.month() as i32);
            self.imply(Field::Year, date.year());
        }
        if duration.second.is_some() || duration.minute.is_some() || duration.hour.is_some() {
            for field in [Field::Second, Field::Minute, Field::Hour] {
                self.delete(field);
            }
            self.imply(Field::Second, date.second() as i32);
            self.imply(Field::Minute, date.minute() as i32);
            self.imply(Field::Hour, date.hour() as i32);
        }
    }

    pub fn is_only_date(&self) -> bool {
        !self.is_certain(Field::Hour)
            && !self.is_certain(Field::Minute)
            && !self.is_certain(Field::Second)
    }

    pub fn is_only_time(&self) -> bool {
        !self.is_certain(Field::Weekday)
            && !self.is_certain(Field::Day)
            && !self.is_certain(Field::Month)
            && !self.is_certain(Field::Year)
    }

    pub fn is_only_weekday(&self) -> bool {
        self.is_certain(Field::Weekday)
            && !self.is_certain(Field::Day)
            && !self.is_certain(Field::Month)
    }

    pub fn is_date_with_unknown_year(&self) -> bool {
        self.is_certain(Field::Month) && !self.is_certain(Field::Year)
    }

    /// The fields as a local `Date` (`dateWithoutTimezoneAdjustment`). Like
    /// chrono-node it ends with `setFullYear(year)`, which undoes a year carried
    /// over from day or month overflow.
    fn local_date(&self) -> Option<NaiveDateTime> {
        let tz = self.reference.tz;
        let year = self.get_or_zero(Field::Year);
        let date = Fields {
            year,
            month0: self.get_or_zero(Field::Month) - 1,
            day: self.get_or_zero(Field::Day),
            hour: self.get_or_zero(Field::Hour),
            minute: self.get_or_zero(Field::Minute),
            second: self.get_or_zero(Field::Second),
            millisecond: self.get_or_zero(Field::Millisecond),
        }
        .make(tz)?;
        Fields {
            year,
            ..Fields::of(date)
        }
        .make(tz)
    }

    fn date_without_offset(&self) -> NaiveDateTime {
        // Unreachable for grammar output: every field comes from a bounded
        // number or from checked arithmetic on the reference.
        self.local_date().unwrap_or(NaiveDateTime::MIN)
    }

    /// The local wallclock these components denote. A known/implied
    /// `TimezoneOffset` that differs from the zone's offset at that time (a
    /// relative date across a DST change) shifts it like chrono-node does.
    pub fn date(&self) -> NaiveDateTime {
        let date = self.date_without_offset();
        let Some(target) = self.get(Field::TimezoneOffset) else {
            return date;
        };
        let tz = self.reference.tz;
        let adjustment = offset_minutes(tz, date) - target;
        if adjustment == 0 {
            return date;
        }
        (resolve_local(date, tz) + TimeDelta::minutes(i64::from(adjustment))).naive_local()
    }

    /// `isValidDate`: the fields survive a round trip through a local `Date`
    /// (no day 31 in April, no wallclock inside a DST gap).
    pub fn is_valid_date(&self) -> bool {
        let Some(date) = self.local_date() else {
            return false;
        };
        let same =
            |field: Field, actual: i64| self.get(field).is_none_or(|v| i64::from(v) == actual);
        self.get(Field::Year) == Some(date.year())
            && self.get(Field::Month) == Some(date.month() as i32)
            && self.get(Field::Day) == Some(date.day() as i32)
            && same(Field::Hour, i64::from(date.hour()))
            && same(Field::Minute, i64::from(date.minute()))
    }
}

/// A `ParsingResult`: a span of the text (char indices) and the date or range
/// it denotes.
#[derive(Clone, Debug)]
pub(crate) struct ParsedDate {
    pub span: Range<usize>,
    pub start: Components,
    pub end: Option<Components>,
}

impl ParsedDate {
    pub fn new(span: Range<usize>, start: Components) -> Self {
        Self {
            span,
            start,
            end: None,
        }
    }
}
