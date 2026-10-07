//! Temporal `ZonedDateTime` semantics on top of `DateTime<Tz>`.
//!
//! The TS app used the Temporal polyfill; its results are the fixtures. The two
//! rules that matter: a wallclock is resolved with the "compatible"
//! disambiguation (DST gap → shift forward by the gap, overlap → the earlier
//! instant), and `ZonedDateTime.with(…)` additionally prefers the value's
//! current offset when the new wallclock is ambiguous.

use chrono::{
    DateTime, Duration, LocalResult, NaiveDate, NaiveDateTime, NaiveTime, Offset, TimeZone, Utc,
};
use chrono_tz::Tz;

/// Resolve a wallclock in `tz` the way `PlainDateTime.toZonedDateTime(tz)` does
/// (disambiguation "compatible").
pub fn resolve_local(wallclock: NaiveDateTime, tz: Tz) -> DateTime<Tz> {
    match tz.from_local_datetime(&wallclock) {
        LocalResult::Single(dt) => dt,
        LocalResult::Ambiguous(earlier, _) => earlier,
        LocalResult::None => resolve_gap(wallclock, tz),
    }
}

/// `ZonedDateTime.with(…)` resolution: when the new wallclock is ambiguous, keep
/// the candidate whose offset matches `preferred_offset_secs`; otherwise
/// "compatible".
pub fn resolve_local_prefer_offset(
    wallclock: NaiveDateTime,
    tz: Tz,
    preferred_offset_secs: i32,
) -> DateTime<Tz> {
    match tz.from_local_datetime(&wallclock) {
        LocalResult::Single(dt) => dt,
        LocalResult::Ambiguous(earlier, later) => {
            if offset_secs(&later) == preferred_offset_secs {
                later
            } else {
                earlier
            }
        }
        LocalResult::None => resolve_gap(wallclock, tz),
    }
}

/// Temporal's gap rule (DisambiguatePossibleEpochNanoseconds, "later"): move the
/// wallclock forward by the size of the transition and take the last candidate.
fn resolve_gap(wallclock: NaiveDateTime, tz: Tz) -> DateTime<Tz> {
    let as_utc = wallclock.and_utc();
    let before = offset_at(tz, as_utc - Duration::days(1));
    let after = offset_at(tz, as_utc + Duration::days(1));
    let shifted = wallclock + Duration::seconds(i64::from(after - before));
    match tz.from_local_datetime(&shifted) {
        LocalResult::Single(dt) | LocalResult::Ambiguous(_, dt) => dt,
        // More than one transition inside the two-day window: fall back to the
        // offset in force before the gap.
        LocalResult::None => (wallclock - Duration::seconds(i64::from(before)))
            .and_utc()
            .with_timezone(&tz),
    }
}

fn offset_at(tz: Tz, instant: DateTime<Utc>) -> i32 {
    offset_secs(&instant.with_timezone(&tz))
}

/// UTC offset of a zoned value in seconds (east positive).
pub fn offset_secs(dt: &DateTime<Tz>) -> i32 {
    dt.offset().fix().local_minus_utc()
}

/// Start of a calendar day in `tz` (`PlainDate.toZonedDateTime(tz)`).
pub fn start_of_day(date: NaiveDate, tz: Tz) -> DateTime<Tz> {
    resolve_local(date.and_time(NaiveTime::MIN), tz)
}

/// `ZonedDateTime.add({ days })`: calendar arithmetic on the wallclock, then
/// "compatible" resolution.
pub fn add_days(dt: &DateTime<Tz>, days: i64) -> DateTime<Tz> {
    resolve_local(dt.naive_local() + Duration::days(days), dt.timezone())
}

/// `ZonedDateTime.with({ year, month, day })`.
pub fn with_date(dt: &DateTime<Tz>, date: NaiveDate) -> DateTime<Tz> {
    resolve_local_prefer_offset(date.and_time(dt.time()), dt.timezone(), offset_secs(dt))
}

/// `ZonedDateTime.with({ hour, minute, second: 0, millisecond: 0 })`. Sub-millisecond
/// digits survive, as in Temporal.
pub fn with_time(dt: &DateTime<Tz>, hour: u32, minute: u32) -> DateTime<Tz> {
    let wallclock = with_wallclock_time(dt.naive_local(), hour, minute);
    resolve_local_prefer_offset(wallclock, dt.timezone(), offset_secs(dt))
}

/// `PlainDateTime.with({ hour, minute, second: 0, millisecond: 0 })`.
pub fn with_wallclock_time(wallclock: NaiveDateTime, hour: u32, minute: u32) -> NaiveDateTime {
    let sub_milli = wallclock.and_utc().timestamp_subsec_nanos() % 1_000_000;
    let time = NaiveTime::from_hms_nano_opt(hour.min(23), minute.min(59), 0, sub_milli)
        .expect("clamped time is valid");
    wallclock.date().and_time(time)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ndt(s: &str) -> NaiveDateTime {
        NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%S").unwrap()
    }

    #[test]
    fn gap_moves_forward() {
        let dt = resolve_local(ndt("2026-03-29T02:30:00"), chrono_tz::Europe::Berlin);
        assert_eq!(dt.naive_local(), ndt("2026-03-29T03:30:00"));
        assert_eq!(offset_secs(&dt), 7200);
    }

    #[test]
    fn overlap_takes_earlier() {
        let dt = resolve_local(ndt("2026-10-25T02:30:00"), chrono_tz::Europe::Berlin);
        assert_eq!(offset_secs(&dt), 7200);
    }

    #[test]
    fn with_prefers_current_offset() {
        let later = resolve_local(ndt("2026-10-25T02:30:00"), chrono_tz::Europe::Berlin)
            + Duration::hours(1);
        assert_eq!(offset_secs(&later), 3600);
        let moved = with_time(&later, 2, 15);
        assert_eq!(offset_secs(&moved), 3600);
    }
}
