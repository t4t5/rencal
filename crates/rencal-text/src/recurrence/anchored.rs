//! `AnchoredRule`: a rule bound to a DTSTART, for expanding occurrences (port of
//! `createRRuleWithDtstart` in `src/lib/rrule-utils.ts`).
//!
//! Like rrule.js, expansion runs in "fake UTC": DTSTART, UNTIL and every
//! occurrence are wallclocks in the event's own zone, so a weekly 09:00 event
//! stays at 09:00 across DST. Callers map occurrences back to the event's zone.
//! The `rrule` crate does the expansion; it follows the same RFC 5545 algorithm
//! as rrule.js (both are ports of python-dateutil).

use std::fmt;

use chrono::{Month, NaiveDateTime, TimeZone, Weekday};

use super::RRuleError;
use super::rule::{Frequency, NWeekday, Part, RRule, format_utc_stamp, join, weekday_code};

/// A rule reduced to the parts that define its recurrence, plus a DTSTART.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AnchoredRule {
    pub freq: Frequency,
    pub interval: u32,
    pub count: Option<u32>,
    pub until: Option<NaiveDateTime>,
    pub wkst: Weekday,
    /// Plain weekdays only; see `RRule::anchor`.
    pub by_weekday: Vec<Weekday>,
    pub by_month: Vec<i32>,
    /// Positive days only; see `RRule::anchor`.
    pub by_month_day: Vec<i32>,
    pub by_hour: Vec<i32>,
    pub by_minute: Vec<i32>,
    pub dtstart: NaiveDateTime,
}

impl RRule {
    /// Bind the rule to `dtstart` (a wallclock in the event's zone).
    ///
    /// Port of `createRRuleWithDtstart`, which rebuilt the rule from rrule.js's
    /// parsed options so that `BY*` parts the string didn't name default from
    /// DTSTART rather than from the current time. Its quirks are kept, because
    /// the fixtures pin them: nth weekdays in a monthly/yearly `BYDAY` (`2TU`)
    /// and negative `BYMONTHDAY`s are dropped (rrule.js keeps those in separate
    /// options the rebuild never copied), as are `BYSETPOS`, `BYYEARDAY`,
    /// `BYWEEKNO` and `BYSECOND`. A monthly "2nd Tuesday" rule therefore
    /// repeats on DTSTART's day of the month. (With only negative
    /// `BYMONTHDAY`s left, rrule.js went on to repeat every day of the month;
    /// here such a rule falls back to DTSTART's day too.)
    pub fn anchor(&self, dtstart: NaiveDateTime) -> AnchoredRule {
        let freq = self.freq();
        let list =
            |kind: fn(Vec<i32>) -> Part| self.list(kind).map(<[i32]>::to_vec).unwrap_or_default();
        AnchoredRule {
            freq,
            interval: self.interval(),
            count: self.count(),
            until: self.until(),
            wkst: self.wkst().unwrap_or(Weekday::Mon),
            // rrule.js drops the ordinal of a weekly/daily/… `BYDAY` entry.
            by_weekday: self
                .by_day()
                .unwrap_or_default()
                .iter()
                .filter(|d| d.n.is_none() || freq > Frequency::Monthly)
                .map(|d| d.weekday)
                .collect(),
            by_month: list(Part::ByMonth),
            by_month_day: list(Part::ByMonthDay)
                .into_iter()
                .filter(|d| *d > 0)
                .collect(),
            by_hour: list(Part::ByHour),
            by_minute: list(Part::ByMinute),
            dtstart,
        }
    }
}

impl fmt::Display for AnchoredRule {
    /// rrule.js `toString()`: `DTSTART:…Z` then `RRULE:` with the parts in the
    /// order `createRRuleWithDtstart` passed them.
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let mut parts = vec![
            format!("FREQ={}", self.freq.as_str()),
            format!("INTERVAL={}", self.interval),
        ];
        if let Some(count) = self.count {
            parts.push(format!("COUNT={count}"));
        }
        if let Some(until) = &self.until {
            parts.push(format!("UNTIL={}", format_utc_stamp(until)));
        }
        parts.push(format!("WKST={}", weekday_code(self.wkst)));
        let by_day: Vec<NWeekday> = self
            .by_weekday
            .iter()
            .copied()
            .map(NWeekday::every)
            .collect();
        for (name, values) in [
            ("BYDAY", join(&by_day)),
            ("BYMONTH", join(&self.by_month)),
            ("BYMONTHDAY", join(&self.by_month_day)),
            ("BYHOUR", join(&self.by_hour)),
            ("BYMINUTE", join(&self.by_minute)),
        ] {
            if !values.is_empty() {
                parts.push(format!("{name}={values}"));
            }
        }
        write!(
            f,
            "DTSTART:{}\nRRULE:{}",
            format_utc_stamp(&self.dtstart),
            parts.join(";")
        )
    }
}

/// Occurrence wallclocks in ascending order.
pub struct Occurrences(Option<rrule::RRuleSetIter>);

impl Iterator for Occurrences {
    type Item = NaiveDateTime;

    fn next(&mut self) -> Option<NaiveDateTime> {
        self.0.as_mut()?.next().map(|dt| dt.naive_utc())
    }
}

fn invalid(e: impl fmt::Display) -> RRuleError {
    RRuleError(e.to_string())
}

fn small<T: TryFrom<i32>>(values: &[i32]) -> Result<Vec<T>, RRuleError> {
    values
        .iter()
        .map(|v| T::try_from(*v).map_err(|_| RRuleError(format!("Out of range: {v}"))))
        .collect()
}

impl AnchoredRule {
    /// Every occurrence from DTSTART on (DTSTART itself only when it matches the
    /// rule). Errors when the rule can't be expanded, e.g. `BYMONTH=13`; rrule.js
    /// yielded nothing for those, and every caller treats both the same way.
    pub fn occurrences(&self) -> Result<Occurrences, RRuleError> {
        // The rrule crate rejects an UNTIL before DTSTART; rrule.js just ends.
        if self.until.is_some_and(|until| until < self.dtstart) {
            return Ok(Occurrences(None));
        }

        let utc = rrule::Tz::UTC;
        let freq = match self.freq {
            Frequency::Yearly => rrule::Frequency::Yearly,
            Frequency::Monthly => rrule::Frequency::Monthly,
            Frequency::Weekly => rrule::Frequency::Weekly,
            Frequency::Daily => rrule::Frequency::Daily,
            Frequency::Hourly => rrule::Frequency::Hourly,
            Frequency::Minutely => rrule::Frequency::Minutely,
            Frequency::Secondly => rrule::Frequency::Secondly,
        };
        let interval = u16::try_from(self.interval).map_err(invalid)?;
        let mut rule = rrule::RRule::new(freq)
            .interval(interval)
            .week_start(self.wkst)
            .by_weekday(
                self.by_weekday
                    .iter()
                    .map(|w| rrule::NWeekday::Every(*w))
                    .collect(),
            )
            .by_month(
                &small::<u8>(&self.by_month)?
                    .into_iter()
                    .map(|m| Month::try_from(m).map_err(invalid))
                    .collect::<Result<Vec<_>, _>>()?,
            )
            .by_month_day(small(&self.by_month_day)?)
            .by_hour(small(&self.by_hour)?)
            .by_minute(small(&self.by_minute)?);
        if let Some(count) = self.count {
            rule = rule.count(count);
        }
        if let Some(until) = &self.until {
            rule = rule.until(utc.from_utc_datetime(until));
        }

        let set = rule
            .build(utc.from_utc_datetime(&self.dtstart))
            .map_err(invalid)?
            // Bounds the search for a next match, so impossible rules
            // (`BYMONTH=2;BYMONTHDAY=30`) end instead of spinning.
            .limit();
        Ok(Occurrences(Some((&set).into_iter())))
    }

    /// rrule.js `all()` cut to the first `limit` occurrences.
    pub fn first(&self, limit: usize) -> Result<Vec<NaiveDateTime>, RRuleError> {
        Ok(self.occurrences()?.take(limit).collect())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn at(s: &str) -> NaiveDateTime {
        NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M").unwrap()
    }

    #[test]
    fn impossible_rule_ends() {
        let rule: RRule = "FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=30".parse().unwrap();
        assert!(
            rule.anchor(at("2026-01-01T09:00"))
                .first(3)
                .unwrap()
                .is_empty()
        );
    }

    #[test]
    fn until_before_dtstart_is_empty() {
        let rule: RRule = "FREQ=DAILY;UNTIL=20200101T000000Z".parse().unwrap();
        assert!(
            rule.anchor(at("2026-01-01T09:00"))
                .first(3)
                .unwrap()
                .is_empty()
        );
    }

    #[test]
    fn dropped_parts_fall_back_to_dtstart() {
        for rule in ["FREQ=MONTHLY;BYDAY=2TU", "FREQ=MONTHLY;BYMONTHDAY=-1"] {
            let anchored = rule
                .parse::<RRule>()
                .unwrap()
                .anchor(at("2026-06-15T09:00"));
            assert_eq!(
                anchored.to_string(),
                "DTSTART:20260615T090000Z\nRRULE:FREQ=MONTHLY;INTERVAL=1;WKST=MO"
            );
            assert_eq!(
                anchored.first(2).unwrap(),
                [at("2026-06-15T09:00"), at("2026-07-15T09:00")]
            );
        }
    }

    #[test]
    fn out_of_range_values_fail() {
        let rule: RRule = "FREQ=YEARLY;BYMONTH=13".parse().unwrap();
        assert!(rule.anchor(at("2026-01-01T09:00")).occurrences().is_err());
    }
}
