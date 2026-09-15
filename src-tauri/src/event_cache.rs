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
use parking_lot::RwLock;
use std::collections::HashMap;
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};

#[derive(Default)]
pub struct EventCache {
    inner: RwLock<HashMap<String, Arc<Vec<Event>>>>,
    /// Bumped by every invalidation so a parse that raced one is not cached.
    generation: AtomicU64,
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
        if let Some(hit) = self.inner.read().get(slug).cloned() {
            return Ok(hit);
        }

        let generation = self.generation.load(Ordering::Acquire);
        let parsed = Arc::new(parse()?);

        let mut map = self.inner.write();
        if self.generation.load(Ordering::Acquire) != generation {
            // Invalidated while we parsed: serve the result, don't cache it.
            return Ok(parsed);
        }
        Ok(map.entry(slug.to_owned()).or_insert(parsed).clone())
    }

    pub fn invalidate(&self, slug: &str) {
        self.generation.fetch_add(1, Ordering::AcqRel);
        self.inner.write().remove(slug);
    }

    pub fn invalidate_all(&self) {
        self.generation.fetch_add(1, Ordering::AcqRel);
        self.inner.write().clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use caldir_core::EventTime;
    use chrono::NaiveDate;
    use std::convert::Infallible;

    fn events(summary: &str) -> Result<Vec<Event>, Infallible> {
        let start = EventTime::Date(NaiveDate::from_ymd_opt(2026, 9, 15).unwrap());
        Ok(vec![Event::new(summary, start)])
    }

    #[test]
    fn caches_until_invalidated() {
        let cache = EventCache::default();

        let first = cache.get_or_parse("work", || events("first")).unwrap();
        let hit = cache.get_or_parse("work", || events("second")).unwrap();
        assert!(Arc::ptr_eq(&first, &hit));

        cache.invalidate("work");
        let reparsed = cache.get_or_parse("work", || events("third")).unwrap();
        assert_eq!(reparsed[0].summary.as_deref(), Some("third"));
    }

    #[test]
    fn a_parse_that_raced_an_invalidation_is_served_but_not_cached() {
        let cache = EventCache::default();

        let stale = cache
            .get_or_parse("work", || {
                cache.invalidate_all();
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
