//! Named time zones for TSX: QuickJS's `Intl` knows only the device's zone and
//! UTC, so `app/lib/temporal.ts` asks here.

use caldir_core::Tz;
use chrono::{DateTime, Offset, TimeZone, Utc};

pub fn offset_ms(tz: &str, epoch_ms: f64) -> Option<f64> {
    let tz: Tz = tz.parse().ok()?;
    let instant = DateTime::<Utc>::from_timestamp_millis(epoch_ms as i64)?;
    let offset = tz.offset_from_utc_datetime(&instant.naive_utc()).fix();
    Some(f64::from(offset.local_minus_utc()) * 1000.0)
}

pub fn instants_ms(tz: &str, local_ms: f64) -> Vec<f64> {
    let Ok(tz) = tz.parse::<Tz>() else {
        return Vec::new();
    };
    let Some(local) = DateTime::<Utc>::from_timestamp_millis(local_ms as i64) else {
        return Vec::new();
    };
    tz.from_local_datetime(&local.naive_utc())
        .earliest()
        .into_iter()
        .chain(tz.from_local_datetime(&local.naive_utc()).latest())
        .map(|instant| instant.timestamp_millis() as f64)
        .fold(Vec::new(), |mut all, instant| {
            if !all.contains(&instant) {
                all.push(instant);
            }
            all
        })
}

/// The zone's abbreviation at `epoch_ms` in the tz database ("EST", "CET"), or
/// its offset where the database has none ("+0530").
pub fn abbreviation(tz: &str, epoch_ms: f64) -> Option<String> {
    let zone = jiff::tz::db().get(tz).ok()?;
    let instant = jiff::Timestamp::from_millisecond(epoch_ms as i64).ok()?;
    Some(zone.to_offset_info(instant).abbreviation().to_owned())
}

/// Every zone name the tz database knows.
pub fn names() -> Vec<String> {
    let mut names: Vec<String> = jiff::tz::db()
        .available()
        .map(|name| name.to_string())
        .collect();
    names.sort();
    names
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn offsets_follow_daylight_saving() {
        // 2026-01-15 and 2026-07-15, 12:00 UTC.
        assert_eq!(
            offset_ms("Europe/Stockholm", 1768478400000.0),
            Some(3_600_000.0)
        );
        assert_eq!(
            offset_ms("Europe/Stockholm", 1784116800000.0),
            Some(7_200_000.0)
        );
        assert_eq!(offset_ms("Not/AZone", 0.0), None);
    }

    #[test]
    fn abbreviations_follow_daylight_saving() {
        assert_eq!(
            abbreviation("America/New_York", 1768478400000.0).as_deref(),
            Some("EST")
        );
        assert_eq!(
            abbreviation("America/New_York", 1784116800000.0).as_deref(),
            Some("EDT")
        );
        assert_eq!(abbreviation("Not/AZone", 0.0), None);
    }

    #[test]
    fn names_hold_the_common_zones() {
        let names = names();
        assert!(names.iter().any(|name| name == "Europe/Stockholm"));
        assert!(names.iter().any(|name| name == "UTC"));
    }

    #[test]
    fn a_gap_has_no_instant_and_a_fold_has_two() {
        // 2026-03-29 02:30 doesn't exist in Stockholm; 2026-10-25 02:30 happens twice.
        assert!(instants_ms("Europe/Stockholm", 1774751400000.0).is_empty());
        assert_eq!(instants_ms("Europe/Stockholm", 1792895400000.0).len(), 2);
    }
}
