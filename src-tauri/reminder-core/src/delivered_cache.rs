//! Per-reminder dedup cache. Replaces the old global `last_check` checkpoint.
//!
//! Each tick scans triggers in `(now - CATCHUP_CAP_HOURS, now]` and fires any
//! that aren't already in the cache. Keying per-reminder (rather than tracking
//! a single "last evaluated" timestamp) closes a race that was visible whenever
//! an event landed in caldir *after* a tick had already passed its trigger
//! time — sync, manual create, or the file watcher picking up an external
//! write. The old model would advance `last_check` past the trigger and the
//! reminder was lost; here, the trigger is still in the scan window and the
//! cache is the only thing that can mark it delivered.
//!
//! Eviction drops entries whose trigger is older than the catchup cap. They
//! can never re-fire (the scan window stops at the cap), so keeping them is
//! pure bloat.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::Path;

/// Identifies one fire-decision: which event, at which trigger instant.
///
/// Including the trigger time (rather than just the reminder's `minutes`
/// offset) means that moving an event produces a new key — the cache won't
/// suppress the new fire even though `event_id` is unchanged.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct DeliveryKey {
    /// `Event::unique_id()` — stable across the event's lifetime,
    /// distinguishes occurrences of a recurring series via recurrence-id.
    pub event_id: String,
    pub trigger: DateTime<Utc>,
}

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct DeliveredCache {
    deliveries: HashSet<DeliveryKey>,
}

impl DeliveredCache {
    pub fn new() -> Self {
        Self::default()
    }

    /// Returns `true` if the key was newly inserted. The caller can use the
    /// return value to decide whether to fire — `insert(...) == false` means
    /// "already delivered, don't re-fire."
    pub fn insert(&mut self, key: DeliveryKey) -> bool {
        self.deliveries.insert(key)
    }

    #[cfg(test)]
    pub fn contains(&self, key: &DeliveryKey) -> bool {
        self.deliveries.contains(key)
    }

    pub fn evict_older_than(&mut self, cutoff: DateTime<Utc>) {
        self.deliveries.retain(|k| k.trigger >= cutoff);
    }

    /// Missing or corrupt files yield an empty cache. We'd rather re-fire a
    /// few reminders (loud, recoverable) than silently swallow them.
    pub fn load(path: &Path) -> Self {
        let Ok(contents) = std::fs::read_to_string(path) else {
            return Self::new();
        };
        match serde_json::from_str(&contents) {
            Ok(cache) => cache,
            Err(e) => {
                log::warn!("delivered-reminders parse failed: {e}; starting fresh");
                Self::new()
            }
        }
    }

    pub fn save(&self, path: &Path) {
        if let Some(parent) = path.parent()
            && std::fs::create_dir_all(parent).is_err()
        {
            return;
        }
        match serde_json::to_string(self) {
            Ok(s) => {
                let _ = std::fs::write(path, s);
            }
            Err(e) => log::warn!("delivered-reminders serialize failed: {e}"),
        }
    }

    #[cfg(test)]
    pub fn len(&self) -> usize {
        self.deliveries.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{Duration, TimeZone};

    fn t(year: i32, month: u32, day: u32, hour: u32, min: u32) -> DateTime<Utc> {
        Utc.with_ymd_and_hms(year, month, day, hour, min, 0)
            .unwrap()
    }

    fn key(id: &str, dt: DateTime<Utc>) -> DeliveryKey {
        DeliveryKey {
            event_id: id.to_string(),
            trigger: dt,
        }
    }

    #[test]
    fn dedupes_same_key() {
        let mut c = DeliveredCache::new();
        let k = key("evt-1", t(2026, 4, 29, 11, 30));
        assert!(c.insert(k.clone()));
        assert!(!c.insert(k.clone()));
        assert!(c.contains(&k));
        assert_eq!(c.len(), 1);
    }

    #[test]
    fn different_trigger_is_different_key() {
        // Same event, two triggers (e.g. user moved it). Both should be
        // recordable independently.
        let mut c = DeliveredCache::new();
        assert!(c.insert(key("evt-1", t(2026, 4, 29, 11, 30))));
        assert!(c.insert(key("evt-1", t(2026, 4, 29, 12, 30))));
        assert_eq!(c.len(), 2);
    }

    #[test]
    fn evicts_entries_older_than_cutoff() {
        let mut c = DeliveredCache::new();
        let now = t(2026, 4, 29, 12, 0);
        c.insert(key("old", now - Duration::hours(5)));
        c.insert(key("recent", now - Duration::hours(1)));
        c.evict_older_than(now - Duration::hours(4));
        assert_eq!(c.len(), 1);
        assert!(c.contains(&key("recent", now - Duration::hours(1))));
    }

    #[test]
    fn eviction_keeps_entries_at_exact_cutoff() {
        let mut c = DeliveredCache::new();
        let now = t(2026, 4, 29, 12, 0);
        let cutoff = now - Duration::hours(4);
        c.insert(key("at-cutoff", cutoff));
        c.evict_older_than(cutoff);
        assert_eq!(c.len(), 1);
    }

    #[test]
    fn round_trips_through_disk() {
        let path = std::env::temp_dir().join(format!(
            "rencal-cache-roundtrip-{}-{}.json",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));

        let mut c = DeliveredCache::new();
        c.insert(key("evt-1", t(2026, 4, 29, 11, 30)));
        c.insert(key("evt-2", t(2026, 4, 29, 12, 0)));
        c.save(&path);

        let loaded = DeliveredCache::load(&path);
        let _ = std::fs::remove_file(&path);

        assert_eq!(loaded.len(), 2);
        assert!(loaded.contains(&key("evt-1", t(2026, 4, 29, 11, 30))));
        assert!(loaded.contains(&key("evt-2", t(2026, 4, 29, 12, 0))));
    }

    #[test]
    fn load_returns_empty_for_missing_file() {
        let path = std::env::temp_dir().join(format!(
            "rencal-cache-missing-{}-{}.json",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        assert_eq!(DeliveredCache::load(&path).len(), 0);
    }

    #[test]
    fn load_returns_empty_for_corrupt_file() {
        let path = std::env::temp_dir().join(format!(
            "rencal-cache-corrupt-{}-{}.json",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::write(&path, "{not valid json").unwrap();
        let loaded = DeliveredCache::load(&path);
        let _ = std::fs::remove_file(&path);
        assert_eq!(loaded.len(), 0);
    }
}
