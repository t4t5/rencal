//! Time zone labels for pickers and event details.

use chrono_tz::{TZ_VARIANTS, Tz};

use crate::EventTime;
use crate::zoned::offset_secs;

/// Top-level regions of canonical IANA ids; drops legacy aliases such as
/// `US/Eastern` that `Intl.supportedValuesOf` never listed.
const REGIONS: [&str; 10] = [
    "Africa",
    "America",
    "Antarctica",
    "Arctic",
    "Asia",
    "Atlantic",
    "Australia",
    "Europe",
    "Indian",
    "Pacific",
];

/// Zones offered by the time zone picker: regional ids, then `UTC`.
pub fn list_time_zones() -> Vec<Tz> {
    let mut zones: Vec<Tz> = TZ_VARIANTS
        .iter()
        .copied()
        .filter(|tz| {
            tz.name()
                .split_once('/')
                .is_some_and(|(region, _)| REGIONS.contains(&region))
        })
        .collect();
    zones.sort_by_key(|tz| tz.name());
    zones.push(Tz::UTC);
    zones
}

/// The city part of a zone id: `America/Argentina/Buenos_Aires` → `Buenos Aires`.
pub fn time_zone_city(tzid: &str) -> String {
    tzid.rsplit('/').next().unwrap_or(tzid).replace('_', " ")
}

/// The zone's UTC offset at `at`'s instant, e.g. `GMT+1`, `GMT-3`, `GMT+5:30`.
/// All-day and floating values are anchored in the viewer's zone.
pub fn time_zone_offset_label(tz: Tz, at: &EventTime, viewer: Tz) -> String {
    let offset = offset_secs(&at.instant_for_ordering(viewer).with_timezone(&tz));
    let sign = if offset < 0 { '-' } else { '+' };
    let abs = offset.unsigned_abs();
    let (hours, minutes) = (abs / 3600, abs / 60 % 60);
    if minutes == 0 {
        format!("GMT{sign}{hours}")
    } else {
        format!("GMT{sign}{hours}:{minutes:02}")
    }
}
