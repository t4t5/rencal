//! Cache of merged busy time per set of calendars, for the availability
//! routes. Lives in `AppState`.
//!
//! caldir-core's busy scan parses every event file in the named calendars, so
//! re-running it on every draft edit made the availability preview lag by up
//! to seconds. Busy time doesn't depend on the draft, so it's cached per
//! calendar set and zone over a window that grows to cover what's been asked
//! for. Every event or calendar invalidation clears it.

use std::collections::HashMap;

use caldir_core::Interval;
use chrono::Duration;
use chrono_tz::Tz;
use parking_lot::Mutex;

/// Fetched either side of a miss, so buffers and scrolling a week still hit.
const PADDING: Duration = Duration::days(7);

/// Sorted slugs, and the zone that places all-day and floating events.
type Key = (Vec<String>, Tz);

struct Entry {
    covered: Interval,
    busy: Vec<Interval>,
}

#[derive(Default)]
struct Entries {
    /// Bumped by every invalidation so a fetch that raced one is served but
    /// not cached.
    generation: u64,
    map: HashMap<Key, Entry>,
}

#[derive(Default)]
pub struct BusyCache {
    entries: Mutex<Entries>,
}

impl BusyCache {
    /// Busy time from `slugs` within `window`, calling `fetch` on a miss. The
    /// fetch runs without the lock held.
    pub fn get_or_fetch<E>(
        &self,
        slugs: &[String],
        window: Interval,
        tz: Tz,
        fetch: impl FnOnce(Interval) -> Result<Vec<Interval>, E>,
    ) -> Result<Vec<Interval>, E> {
        let mut slugs = slugs.to_vec();
        slugs.sort();
        slugs.dedup();
        let key = (slugs, tz);

        let (generation, wanted) = {
            let entries = self.entries.lock();
            let existing = entries.map.get(&key);
            if let Some(entry) = existing
                && entry.covered.start <= window.start
                && window.end <= entry.covered.end
            {
                return Ok(clip(&entry.busy, window));
            }
            // Parsing dominates the scan whatever the range, so widen rather
            // than replace what's covered.
            let padded = Interval::new(window.start - PADDING, window.end + PADDING);
            let wanted = match existing {
                Some(entry) => Interval::new(
                    entry.covered.start.min(padded.start),
                    entry.covered.end.max(padded.end),
                ),
                None => padded,
            };
            (entries.generation, wanted)
        };

        let busy = fetch(wanted)?;
        let clipped = clip(&busy, window);
        let mut entries = self.entries.lock();
        if entries.generation == generation {
            entries.map.insert(
                key,
                Entry {
                    covered: wanted,
                    busy,
                },
            );
        }
        Ok(clipped)
    }

    pub fn invalidate(&self) {
        let mut entries = self.entries.lock();
        entries.generation += 1;
        entries.map.clear();
    }
}

fn clip(busy: &[Interval], window: Interval) -> Vec<Interval> {
    busy.iter().filter_map(|b| b.intersect(&window)).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{DateTime, TimeZone, Utc};
    use chrono_tz::Europe::Stockholm;
    use std::cell::Cell;
    use std::convert::Infallible;

    fn utc(day: u32, hour: u32) -> DateTime<Utc> {
        Utc.with_ymd_and_hms(2026, 11, day, hour, 0, 0).unwrap()
    }

    fn slugs(names: &[&str]) -> Vec<String> {
        names.iter().map(|name| name.to_string()).collect()
    }

    /// A busy hour at 10:00 on every day of `wanted`, counting calls.
    fn hourly(calls: &Cell<usize>) -> impl Fn(Interval) -> Result<Vec<Interval>, Infallible> {
        |wanted| {
            calls.set(calls.get() + 1);
            let mut busy = Vec::new();
            let mut day = wanted.start.date_naive();
            while day <= wanted.end.date_naive() {
                let start = Utc.from_utc_datetime(&day.and_hms_opt(10, 0, 0).unwrap());
                if let Some(b) = Interval::new(start, start + Duration::hours(1)).intersect(&wanted)
                {
                    busy.push(b);
                }
                day = day.succ_opt().unwrap();
            }
            Ok(busy)
        }
    }

    #[test]
    fn a_window_inside_what_was_fetched_hits_and_is_clipped() {
        let cache = BusyCache::default();
        let calls = Cell::new(0);
        let fetch = hourly(&calls);

        cache
            .get_or_fetch(
                &slugs(&["work"]),
                Interval::new(utc(2, 0), utc(9, 0)),
                Stockholm,
                &fetch,
            )
            .unwrap();
        let hit = cache
            .get_or_fetch(
                &slugs(&["work"]),
                Interval::new(utc(3, 10), utc(4, 0)),
                Stockholm,
                &fetch,
            )
            .unwrap();

        assert_eq!(calls.get(), 1);
        assert_eq!(hit, [Interval::new(utc(3, 10), utc(3, 11))]);
    }

    #[test]
    fn calendar_sets_are_keyed_regardless_of_order() {
        let cache = BusyCache::default();
        let calls = Cell::new(0);
        let fetch = hourly(&calls);
        let week = Interval::new(utc(2, 0), utc(9, 0));

        cache
            .get_or_fetch(&slugs(&["work", "home"]), week, Stockholm, &fetch)
            .unwrap();
        cache
            .get_or_fetch(&slugs(&["home", "work"]), week, Stockholm, &fetch)
            .unwrap();
        assert_eq!(calls.get(), 1);

        cache
            .get_or_fetch(&slugs(&["work"]), week, Stockholm, &fetch)
            .unwrap();
        assert_eq!(calls.get(), 2);
    }

    #[test]
    fn a_miss_widens_what_is_covered() {
        let cache = BusyCache::default();
        let calls = Cell::new(0);
        let fetch = hourly(&calls);
        let work = slugs(&["work"]);

        cache
            .get_or_fetch(
                &work,
                Interval::new(utc(2, 0), utc(3, 0)),
                Stockholm,
                &fetch,
            )
            .unwrap();
        cache
            .get_or_fetch(
                &work,
                Interval::new(utc(20, 0), utc(21, 0)),
                Stockholm,
                &fetch,
            )
            .unwrap();
        cache
            .get_or_fetch(
                &work,
                Interval::new(utc(2, 0), utc(21, 0)),
                Stockholm,
                &fetch,
            )
            .unwrap();

        assert_eq!(calls.get(), 2);
    }

    #[test]
    fn invalidation_clears_and_a_fetch_that_raced_it_is_not_cached() {
        let cache = BusyCache::default();
        let calls = Cell::new(0);
        let fetch = hourly(&calls);
        let work = slugs(&["work"]);
        let week = Interval::new(utc(2, 0), utc(9, 0));

        cache
            .get_or_fetch(&work, week, Stockholm, |wanted| {
                cache.invalidate();
                fetch(wanted)
            })
            .unwrap();
        cache.get_or_fetch(&work, week, Stockholm, &fetch).unwrap();
        assert_eq!(calls.get(), 2);

        cache.invalidate();
        cache.get_or_fetch(&work, week, Stockholm, &fetch).unwrap();
        assert_eq!(calls.get(), 3);
    }
}
