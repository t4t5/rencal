//! Process-wide backend state. Created once in `run()`, shared as
//! `Arc<AppState>` with every RPC surface and background task. Nothing else in
//! the backend holds statics.
//!
//! `AppState` is Tauri-free: it never holds an `AppHandle` and never emits
//! webview events. It exposes change notifications as tokio `watch` channels;
//! `state_bridge` turns those into Tauri events. That keeps it constructible
//! and testable without an app.

use std::path::{Path, PathBuf};
use std::sync::Arc;

use caldir_core::{Caldir, CaldirConfig, CaldirError, Event, ProviderRegistry};
use parking_lot::{RwLock, RwLockReadGuard};
use tokio::sync::watch;

use crate::deep_links::DeepLinkInbox;
use crate::event_cache::EventCache;

pub struct AppState {
    caldir: RwLock<Caldir>,
    caldir_config: watch::Sender<CaldirConfig>,
    caldir_config_path: PathBuf,
    bundled_providers: Option<PathBuf>,
    pub events: EventCache,
    pub deep_links: DeepLinkInbox,
}

impl AppState {
    /// Load from the system caldir config, overlaying the providers bundled
    /// with this build (if any) on top of those found in `PATH`.
    pub fn load(bundled_providers: Option<PathBuf>) -> Result<Self, CaldirError> {
        let config_path = CaldirConfig::default_system_config_path()?;
        Self::load_from(config_path, bundled_providers)
    }

    /// Like `load`, but with an explicit config path (tests, `gen_types`).
    pub fn load_from(
        config_path: PathBuf,
        bundled_providers: Option<PathBuf>,
    ) -> Result<Self, CaldirError> {
        let caldir = open_caldir(&config_path, bundled_providers.as_deref())?;
        let (caldir_config, _) = watch::channel(caldir.config().clone());

        Ok(Self {
            caldir: RwLock::new(caldir),
            caldir_config,
            caldir_config_path: config_path,
            bundled_providers,
            events: EventCache::default(),
            deep_links: DeepLinkInbox::default(),
        })
    }

    /// Shared access to the caldir handle. The guard is `!Send`, so it cannot
    /// be held across an `.await`: clone what you need (a `Provider`,
    /// `connections()`, the config) and let it drop before talking to a
    /// provider. Never call a `&self` mutation below while holding it.
    pub fn caldir(&self) -> RwLockReadGuard<'_, Caldir> {
        self.caldir.read()
    }

    /// Parsed events for `slug`, served from the cache. Parses outside every
    /// lock.
    pub fn events(&self, slug: &str) -> Result<Arc<Vec<Event>>, CaldirError> {
        self.events.get_or_parse(slug, || {
            let calendar = self.caldir().calendar(slug)?;
            let events = calendar
                .events()?
                .into_iter()
                .map(|ce| ce.event().clone())
                .collect();
            Ok(events)
        })
    }

    /// Persist and adopt a new caldir config (time format, default calendar,
    /// reminders, data dir). Invalidates the cache and notifies subscribers
    /// when the data dir moved.
    pub fn save_caldir_config(&self, config: CaldirConfig) -> Result<(), CaldirError> {
        let mut caldir = self.caldir.write();
        caldir.save_config(config)?;
        self.publish(&caldir);
        Ok(())
    }

    /// Re-read caldir's config.toml (hand edits, the caldir CLI). On failure
    /// the previous config stays in place.
    pub fn reload_caldir_config(&self) -> Result<(), CaldirError> {
        let mut caldir = self.caldir.write();
        caldir.reload_config()?;
        self.publish(&caldir);
        Ok(())
    }

    /// Rescan `PATH` for provider binaries. The scan runs outside the lock.
    pub fn rescan_providers(&self) {
        let mut providers = ProviderRegistry::from_system_path();
        if let Some(dir) = &self.bundled_providers {
            providers.add_from_dir(dir);
        }
        self.caldir.write().set_providers(providers);
    }

    /// Latest caldir config; wakes on every change. Backend tasks subscribe to
    /// this instead of listening to webview events.
    pub fn subscribe_caldir_config(&self) -> watch::Receiver<CaldirConfig> {
        self.caldir_config.subscribe()
    }

    pub fn caldir_config_path(&self) -> &Path {
        &self.caldir_config_path
    }

    /// Both mutation paths funnel through here so the order is guaranteed:
    /// the cache is invalidated before anyone is told the dir moved, and both
    /// happen while the write lock is held. Our own `save_config` echoing back
    /// through the file watcher compares equal and wakes nobody.
    fn publish(&self, caldir: &Caldir) {
        self.caldir_config.send_if_modified(|current| {
            if current == caldir.config() {
                return false;
            }
            if current.data_dir() != caldir.data_dir() {
                self.events.invalidate_all();
            }
            *current = caldir.config().clone();
            true
        });
    }
}

/// Read config.toml and scan `PATH`, overlaying the bundled providers so they
/// win over same-named binaries the user has installed.
fn open_caldir(
    config_path: &Path,
    bundled_providers: Option<&Path>,
) -> Result<Caldir, CaldirError> {
    let caldir = Caldir::load_from(config_path)?;
    Ok(match bundled_providers {
        Some(dir) => caldir.with_bundled_providers(dir),
        None => caldir,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use caldir_core::{CalendarConfig, EventTime};
    use chrono::NaiveDate;
    use tempfile::TempDir;

    struct TestCaldir {
        _tmp: TempDir,
        config_path: PathBuf,
        data_dir: PathBuf,
    }

    impl TestCaldir {
        fn new() -> Self {
            let tmp = TempDir::new().unwrap();
            let data_dir = tmp.path().join("data");
            let config_path = tmp.path().join("config.toml");
            write_config(&config_path, &data_dir);
            Self {
                _tmp: tmp,
                config_path,
                data_dir,
            }
        }

        fn state(&self) -> AppState {
            AppState::load_from(self.config_path.clone(), None).unwrap()
        }

        fn add_event(&self, state: &AppState, slug: &str, summary: &str) {
            let calendar = match state.caldir().calendar(slug) {
                Ok(calendar) => calendar,
                Err(_) => state
                    .caldir()
                    .create_calendar(slug, Some(CalendarConfig::new(None, None, None, None)))
                    .unwrap(),
            };
            let start = EventTime::Date(NaiveDate::from_ymd_opt(2026, 9, 15).unwrap());
            calendar.create_event(Event::new(summary, start)).unwrap();
        }
    }

    fn write_config(path: &Path, data_dir: &Path) {
        std::fs::write(path, format!("calendar_dir = \"{}\"\n", data_dir.display())).unwrap();
    }

    fn summaries(events: &[Event]) -> Vec<&str> {
        events
            .iter()
            .filter_map(|event| event.summary.as_deref())
            .collect()
    }

    #[test]
    fn events_are_cached_per_slug_until_invalidated() {
        let caldir = TestCaldir::new();
        let state = caldir.state();
        caldir.add_event(&state, "work", "standup");
        caldir.add_event(&state, "home", "dentist");

        let work = state.events("work").unwrap();
        assert_eq!(summaries(&work), ["standup"]);
        assert_eq!(summaries(&state.events("home").unwrap()), ["dentist"]);

        // A write the cache was not told about is invisible until invalidated.
        caldir.add_event(&state, "work", "retro");
        assert!(Arc::ptr_eq(&work, &state.events("work").unwrap()));

        state.events.invalidate("work");
        let reparsed = state.events("work").unwrap();
        let mut reparsed = summaries(&reparsed);
        reparsed.sort();
        assert_eq!(reparsed, ["retro", "standup"]);
    }

    #[test]
    fn events_for_a_missing_calendar_is_an_error() {
        let caldir = TestCaldir::new();
        let state = caldir.state();

        assert!(matches!(
            state.events("nope"),
            Err(CaldirError::Calendar(_))
        ));
    }

    #[test]
    fn saving_a_new_data_dir_empties_the_cache_and_wakes_subscribers() {
        let caldir = TestCaldir::new();
        let state = caldir.state();
        caldir.add_event(&state, "work", "standup");
        state.events("work").unwrap();
        let mut subscriber = state.subscribe_caldir_config();

        let mut config = state.caldir().config().clone();
        config.set_data_dir(caldir.data_dir.join("elsewhere"));
        state.save_caldir_config(config.clone()).unwrap();

        assert!(subscriber.has_changed().unwrap());
        assert_eq!(*subscriber.borrow_and_update(), config);
        assert_eq!(
            CaldirConfig::load_or_default(&caldir.config_path).unwrap(),
            config
        );
        // The old dir's events are gone from the cache; the new dir has no calendar.
        assert!(state.events("work").is_err());
    }

    #[test]
    fn saving_an_unrelated_setting_keeps_the_cache() {
        let caldir = TestCaldir::new();
        let state = caldir.state();
        caldir.add_event(&state, "work", "standup");
        let cached = state.events("work").unwrap();
        let subscriber = state.subscribe_caldir_config();

        let mut config = state.caldir().config().clone();
        config.set_default_calendar_slug(Some("work".into()));
        state.save_caldir_config(config).unwrap();

        assert!(subscriber.has_changed().unwrap());
        assert!(Arc::ptr_eq(&cached, &state.events("work").unwrap()));
    }

    #[test]
    fn reload_picks_up_disk_edits_and_ignores_echoes_of_our_own_writes() {
        let caldir = TestCaldir::new();
        let state = caldir.state();
        let mut subscriber = state.subscribe_caldir_config();

        // Our own save, echoed back by a file watcher: no wakeup.
        let mut config = state.caldir().config().clone();
        config.set_default_calendar_slug(Some("work".into()));
        state.save_caldir_config(config).unwrap();
        subscriber.borrow_and_update();
        state.reload_caldir_config().unwrap();
        assert!(!subscriber.has_changed().unwrap());

        // A hand edit that moves the data dir: adopted and published.
        let moved = caldir.data_dir.join("moved");
        write_config(&caldir.config_path, &moved);
        state.reload_caldir_config().unwrap();
        assert!(subscriber.has_changed().unwrap());
        assert_eq!(state.caldir().data_dir(), moved);
    }

    #[test]
    fn reload_keeps_the_previous_config_when_the_file_is_malformed() {
        let caldir = TestCaldir::new();
        let state = caldir.state();
        let before = state.caldir().config().clone();
        let subscriber = state.subscribe_caldir_config();

        std::fs::write(&caldir.config_path, "not = [valid").unwrap();

        assert!(matches!(
            state.reload_caldir_config(),
            Err(CaldirError::Config(_))
        ));
        assert_eq!(*state.caldir().config(), before);
        assert!(!subscriber.has_changed().unwrap());
    }

    #[test]
    fn load_from_rejects_a_malformed_config() {
        let caldir = TestCaldir::new();
        std::fs::write(&caldir.config_path, "not = [valid").unwrap();

        assert!(matches!(
            AppState::load_from(caldir.config_path.clone(), None),
            Err(CaldirError::Config(_))
        ));
    }
}
