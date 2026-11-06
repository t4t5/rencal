//! Cache of parsed events, keyed by calendar slug. Lives in `AppState`.
//!
//! caldir-core is intentionally stateless — every call to `calendar.events()`
//! walks the directory and parses every .ics file. RenCal calls those reads on
//! every list_events / list_invites / search_events / get_event / reminder
//! tick, which adds up to nontrivial CPU on machines with thousands of events.
//!
//! This cache memoizes the parsed `Vec<Event>` per slug. Reads serve from the
//! cache; mutations invalidate the affected slug inline; the caldir watcher
//! invalidates on any external change (CLI edit, git pull, sync from remote).
//!
//! Stored as `Arc<Vec<Event>>` so a hit is a cheap pointer clone.

use caldir_core::Event;
use parking_lot::{Mutex, RwLock};
use std::collections::HashMap;
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};

#[derive(Default)]
struct Slot {
    /// Held while one caller parses; concurrent misses wait here and then hit.
    parsing: Mutex<()>,
    /// Bumped by every invalidation of this slug so a parse that raced one is
    /// served but not cached.
    generation: AtomicU64,
    events: RwLock<Option<Arc<Vec<Event>>>>,
}

#[derive(Default)]
pub struct EventCache {
    slots: RwLock<HashMap<String, Arc<Slot>>>,
}

impl EventCache {
    /// Returns the cached events for `slug`, calling `parse` on a miss. The
    /// parse runs without the lock held, so readers of other slugs and
    /// invalidations are never blocked behind disk I/O.
    pub fn get_or_parse<E>(
        &self,
        slug: &str,
        parse: impl FnOnce() -> Result<Vec<Event>, E>,
    ) -> Result<Arc<Vec<Event>>, E> {
        let slot = self.slot(slug);
        if let Some(hit) = slot.events.read().clone() {
            return Ok(hit);
        }

        let _parsing = slot.parsing.lock();
        if let Some(hit) = slot.events.read().clone() {
            return Ok(hit);
        }

        let generation = slot.generation.load(Ordering::Acquire);
        let parsed = Arc::new(parse()?);
        let mut events = slot.events.write();
        if slot.generation.load(Ordering::Acquire) != generation {
            // Invalidated while we parsed: serve the result, don't cache it.
            return Ok(parsed);
        }
        *events = Some(parsed.clone());
        Ok(parsed)
    }

    pub fn invalidate(&self, slug: &str) {
        let Some(slot) = self.slots.read().get(slug).cloned() else {
            return;
        };
        slot.generation.fetch_add(1, Ordering::AcqRel);
        *slot.events.write() = None;
    }

    pub fn invalidate_all(&self) {
        let slots: Vec<_> = self.slots.read().values().cloned().collect();
        for slot in slots {
            slot.generation.fetch_add(1, Ordering::AcqRel);
            *slot.events.write() = None;
        }
    }

    fn slot(&self, slug: &str) -> Arc<Slot> {
        if let Some(slot) = self.slots.read().get(slug).cloned() {
            return slot;
        }
        self.slots
            .write()
            .entry(slug.to_owned())
            .or_default()
            .clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use caldir_core::EventTime;
    use chrono::NaiveDate;
    use std::convert::Infallible;
    use std::sync::Barrier;
    use std::sync::atomic::{AtomicUsize, Ordering as AtomicOrdering};
    use std::thread;
    use std::time::Duration;

    fn events(summary: &str) -> Result<Vec<Event>, Infallible> {
        let start = EventTime::Date(NaiveDate::from_ymd_opt(2026, 9, 15).unwrap());
        Ok(vec![Event::new(summary, start)])
    }

    #[test]
    fn concurrent_misses_parse_once() {
        let cache = Arc::new(EventCache::default());
        let barrier = Arc::new(Barrier::new(2));
        let parses = Arc::new(AtomicUsize::new(0));

        let handles: Vec<_> = (0..2)
            .map(|_| {
                let cache = cache.clone();
                let barrier = barrier.clone();
                let parses = parses.clone();
                thread::spawn(move || {
                    barrier.wait();
                    cache
                        .get_or_parse("work", || {
                            parses.fetch_add(1, AtomicOrdering::SeqCst);
                            thread::sleep(Duration::from_millis(50));
                            events("standup")
                        })
                        .unwrap()
                })
            })
            .collect();

        let first = handles
            .into_iter()
            .map(|handle| handle.join().unwrap())
            .collect::<Vec<_>>();
        assert_eq!(parses.load(AtomicOrdering::SeqCst), 1);
        assert!(Arc::ptr_eq(&first[0], &first[1]));
    }

    #[test]
    fn invalidating_one_slug_does_not_discard_another_slugs_parse() {
        let cache = EventCache::default();
        cache.get_or_parse("work", || events("standup")).unwrap();

        let home = cache
            .get_or_parse("home", || {
                cache.invalidate("work");
                events("dentist")
            })
            .unwrap();
        let hit = cache
            .get_or_parse("home", || events("replacement"))
            .unwrap();

        assert!(Arc::ptr_eq(&home, &hit));
    }

    #[test]
    fn a_parse_that_raced_an_invalidation_is_served_but_not_cached() {
        let cache = EventCache::default();

        let stale = cache
            .get_or_parse("work", || {
                cache.invalidate("work");
                events("stale")
            })
            .unwrap();
        assert_eq!(stale[0].summary.as_deref(), Some("stale"));

        let fresh = cache.get_or_parse("work", || events("fresh")).unwrap();
        assert_eq!(fresh[0].summary.as_deref(), Some("fresh"));
    }

    #[test]
    fn parse_errors_are_not_cached() {
        let cache = EventCache::default();

        let failed = cache.get_or_parse("work", || Err::<Vec<Event>, _>("boom"));
        assert!(matches!(failed, Err("boom")));
        let ok = cache
            .get_or_parse("work", || events("ok").map_err(|_| ""))
            .unwrap();
        assert_eq!(ok[0].summary.as_deref(), Some("ok"));
    }
}
