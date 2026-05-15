//! Process-wide cache of parsed events, keyed by calendar slug.
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

use caldir_core::{Caldir, Event};
use std::collections::HashMap;
use std::sync::{Arc, LazyLock, RwLock};

pub static EVENT_CACHE: LazyLock<EventCache> = LazyLock::new(EventCache::new);

pub struct EventCache {
    inner: RwLock<HashMap<String, Arc<Vec<Event>>>>,
}

impl EventCache {
    fn new() -> Self {
        Self {
            inner: RwLock::new(HashMap::new()),
        }
    }

    /// Returns parsed events for `slug`, parsing from disk on a miss.
    pub fn events(&self, caldir: &Caldir, slug: &str) -> Result<Arc<Vec<Event>>, String> {
        if let Some(events) = self.inner.read().unwrap().get(slug).cloned() {
            return Ok(events);
        }
        let mut guard = self.inner.write().unwrap();
        if let Some(events) = guard.get(slug).cloned() {
            return Ok(events);
        }
        let calendar = caldir.calendar(slug).map_err(|e| e.to_string())?;
        let events: Vec<Event> = calendar
            .events()
            .map_err(|e| e.to_string())?
            .into_iter()
            .map(|ce| ce.event().clone())
            .collect();
        let arc = Arc::new(events);
        guard.insert(slug.to_string(), arc.clone());
        Ok(arc)
    }

    pub fn invalidate(&self, slug: &str) {
        self.inner.write().unwrap().remove(slug);
    }

    pub fn invalidate_all(&self) {
        self.inner.write().unwrap().clear();
    }
}
