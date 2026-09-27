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
use crate::plugins;
use crate::signal::Signal;

/// Where renCal finds provider binaries besides `PATH`.
#[derive(Clone, Debug, Default)]
pub struct ProviderDirs {
    /// Shipped with this build.
    pub bundled: Option<PathBuf>,
    /// Installed plugin packages; each compatible one contributes its `bin/`.
    pub plugins: Option<PathBuf>,
}

impl ProviderDirs {
    fn registry(&self) -> ProviderRegistry {
        self.overlay(ProviderRegistry::from_system_path())
    }

    /// Precedence is bundled > plugin > `PATH`: renCal runs the binaries it
    /// shipped or pinned, so the icon shown matches the binary running.
    fn overlay(&self, mut providers: ProviderRegistry) -> ProviderRegistry {
        if let Some(root) = &self.plugins {
            for dir in plugins::provider_dirs(root) {
                providers.add_from_dir(dir);
            }
        }
        if let Some(dir) = &self.bundled {
            providers.add_from_dir(dir);
        }
        providers
    }
}

pub struct AppState {
    caldir: RwLock<Caldir>,
    caldir_config: watch::Sender<CaldirConfig>,
    caldir_config_path: PathBuf,
    provider_dirs: ProviderDirs,
    events: EventCache,
    calendars_changed: Signal,
    events_changed: Signal,
    providers_changed: Signal,
    pub deep_links: DeepLinkInbox,
}

impl AppState {
    /// Load from the system caldir config, overlaying `provider_dirs` on the
    /// providers found in `PATH`.
    pub fn load(provider_dirs: ProviderDirs) -> Result<Self, CaldirError> {
        let config_path = CaldirConfig::default_system_config_path()?;
        Self::load_from(config_path, provider_dirs)
    }

    /// Like `load`, but with an explicit config path (tests, `gen_types`).
    pub fn load_from(
        config_path: PathBuf,
        provider_dirs: ProviderDirs,
    ) -> Result<Self, CaldirError> {
        let mut caldir = Caldir::load_from(&config_path)?;
        caldir.set_providers(provider_dirs.registry());
        let (caldir_config, _) = watch::channel(caldir.config().clone());

        Ok(Self {
            caldir: RwLock::new(caldir),
            caldir_config,
            caldir_config_path: config_path,
            provider_dirs,
            events: EventCache::default(),
            calendars_changed: Signal::new(),
            events_changed: Signal::new(),
            providers_changed: Signal::new(),
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

    /// Rescan `PATH` and plugin packages for provider binaries. The scan runs
    /// outside the lock.
    pub fn rescan_providers(&self) {
        let providers = self.provider_dirs.registry();
        self.caldir.write().set_providers(providers);
    }

    /// Latest caldir config; wakes on every change. Backend tasks subscribe to
    /// this instead of listening to webview events.
    pub fn subscribe_caldir_config(&self) -> watch::Receiver<CaldirConfig> {
        self.caldir_config.subscribe()
    }

    pub fn notify_calendars_changed(&self) {
        self.calendars_changed.notify();
    }

    pub fn subscribe_calendars_changed(&self) -> watch::Receiver<u64> {
        self.calendars_changed.subscribe()
    }

    pub fn subscribe_events_changed(&self) -> watch::Receiver<u64> {
        self.events_changed.subscribe()
    }

    /// Not called by `rescan_providers`: `list_providers` rescans on every
    /// call, so a listener that refetches would wake itself forever.
    pub fn notify_providers_changed(&self) {
        self.providers_changed.notify();
    }

    pub fn subscribe_providers_changed(&self) -> watch::Receiver<u64> {
        self.providers_changed.subscribe()
    }

    /// Only the caldir watcher calls this; in-app edits already return their
    /// result to the caller and merely invalidate the affected cache entry.
    pub(crate) fn notify_events_changed(&self) {
        self.events_changed.notify();
    }

    pub fn invalidate_events(&self, slug: &str) {
        self.events.invalidate(slug);
    }

    pub fn invalidate_all_events(&self) {
        self.events.invalidate_all();
    }

    pub fn caldir_config_path(&self) -> &Path {
        &self.caldir_config_path
    }

    /// Both mutation paths funnel through here so the order is guaranteed:
    /// the cache is invalidated before anyone is told the dir moved, and both
    /// happen while the write lock is held. Our own `save_config` echoing back
    /// through the file watcher compares equal and wakes nobody.
    fn publish(&self, caldir: &Caldir) {
        let mut data_dir_moved = false;
        self.caldir_config.send_if_modified(|current| {
            if current == caldir.config() {
                return false;
            }
            if current.data_dir() != caldir.data_dir() {
                self.invalidate_all_events();
                data_dir_moved = true;
            }
            *current = caldir.config().clone();
            true
        });
        if data_dir_moved {
            self.notify_calendars_changed();
        }
    }
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
            AppState::load_from(self.config_path.clone(), ProviderDirs::default()).unwrap()
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

        state.invalidate_events("work");
        let reparsed = state.events("work").unwrap();
        let mut reparsed = summaries(&reparsed);
        reparsed.sort();
        assert_eq!(reparsed, ["retro", "standup"]);
    }

    #[test]
    fn notifying_a_calendar_change_wakes_a_subscriber() {
        let caldir = TestCaldir::new();
        let state = caldir.state();
        let subscriber = state.subscribe_calendars_changed();

        state.notify_calendars_changed();

        assert!(subscriber.has_changed().unwrap());
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
        let calendars_subscriber = state.subscribe_calendars_changed();

        let mut config = state.caldir().config().clone();
        config.set_data_dir(caldir.data_dir.join("elsewhere"));
        state.save_caldir_config(config.clone()).unwrap();

        assert!(subscriber.has_changed().unwrap());
        assert!(calendars_subscriber.has_changed().unwrap());
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
        let calendars_subscriber = state.subscribe_calendars_changed();

        let mut config = state.caldir().config().clone();
        config.set_default_calendar_slug(Some("work".into()));
        state.save_caldir_config(config).unwrap();

        assert!(subscriber.has_changed().unwrap());
        assert!(!calendars_subscriber.has_changed().unwrap());
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
            AppState::load_from(caldir.config_path.clone(), ProviderDirs::default()),
            Err(CaldirError::Config(_))
        ));
    }

    /// Stands in for `PATH`, bundled and plugin directories in one temp dir.
    #[cfg(unix)]
    struct ProviderFixture {
        tmp: TempDir,
        dirs: ProviderDirs,
    }

    #[cfg(unix)]
    impl ProviderFixture {
        fn new() -> Self {
            let tmp = TempDir::new().unwrap();
            let dirs = ProviderDirs {
                bundled: Some(tmp.path().join("bundled")),
                plugins: Some(tmp.path().join("plugins")),
            };
            Self { tmp, dirs }
        }

        fn binary(dir: &Path, slug: &str) -> PathBuf {
            use std::os::unix::fs::PermissionsExt;

            std::fs::create_dir_all(dir).unwrap();
            let binary = dir.join(format!("caldir-provider-{slug}"));
            std::fs::write(&binary, "#!/bin/sh\n").unwrap();
            std::fs::set_permissions(&binary, std::fs::Permissions::from_mode(0o755)).unwrap();
            binary
        }

        fn on_path(&self, slug: &str) -> PathBuf {
            Self::binary(&self.tmp.path().join("path"), slug)
        }

        fn bundled(&self, slug: &str) -> PathBuf {
            Self::binary(self.dirs.bundled.as_ref().unwrap(), slug)
        }

        /// Installs a plugin package contributing `slug`, built against `caldir_core`.
        fn plugin(&self, slug: &str, caldir_core: &str) -> PathBuf {
            let package = self.package(slug);
            std::fs::create_dir_all(&package).unwrap();
            std::fs::write(
                package.join(plugins::MANIFEST_FILE),
                format!(
                    r#"id = "alice.{slug}"
name = "{slug}"
version = "1.0.0"
description = "A provider"
min_rencal_version = "0.8.0"

[[contributes.providers]]
id = "{slug}"
name = "{slug}"
asset = "caldir-provider-{slug}-{{target}}.tar.gz"
caldir_core = "{caldir_core}"
"#
                ),
            )
            .unwrap();
            Self::binary(&package.join("bin"), slug)
        }

        fn package(&self, slug: &str) -> PathBuf {
            self.dirs
                .plugins
                .as_ref()
                .unwrap()
                .join(format!("alice.{slug}"))
        }

        /// A caldir whose registry layers `self.dirs` over the fake `PATH`.
        fn caldir(&self) -> Caldir {
            let mut path = ProviderRegistry::new();
            path.add_from_dir(self.tmp.path().join("path"));
            let mut caldir = Caldir::load_from(self.tmp.path().join("config.toml")).unwrap();
            caldir.set_providers(self.dirs.overlay(path));
            caldir
        }
    }

    /// The binary `slug` runs. caldir-core keeps it private; `Debug` shows it.
    #[cfg(unix)]
    fn resolved(caldir: &Caldir, slug: &str) -> Option<String> {
        caldir
            .provider(&caldir_core::ProviderSlug::from(slug))
            .ok()
            .map(|provider| format!("{provider:?}"))
    }

    #[cfg(unix)]
    fn resolves_to(caldir: &Caldir, slug: &str, binary: &Path) -> bool {
        resolved(caldir, slug).is_some_and(|debug| debug.contains(&format!("{binary:?}")))
    }

    #[cfg(unix)]
    #[test]
    fn providers_resolve_bundled_then_plugin_then_path() {
        let fixture = ProviderFixture::new();
        fixture.on_path("tuta");
        let plugin_tuta = fixture.plugin("tuta", "0.16.0");
        fixture.on_path("hooli");
        fixture.plugin("hooli", "0.16.0");
        let bundled_hooli = fixture.bundled("hooli");
        let path_only = fixture.on_path("etesync");

        let caldir = fixture.caldir();

        assert!(resolves_to(&caldir, "tuta", &plugin_tuta));
        assert!(resolves_to(&caldir, "hooli", &bundled_hooli));
        assert!(resolves_to(&caldir, "etesync", &path_only));
    }

    #[cfg(unix)]
    #[test]
    fn uninstalling_a_plugin_falls_back_to_path() {
        let fixture = ProviderFixture::new();
        let path_tuta = fixture.on_path("tuta");
        let plugin_tuta = fixture.plugin("tuta", "0.16.0");
        fixture.plugin("hooli", "0.16.0");
        assert!(resolves_to(&fixture.caldir(), "tuta", &plugin_tuta));

        std::fs::remove_dir_all(fixture.package("tuta")).unwrap();
        std::fs::remove_dir_all(fixture.package("hooli")).unwrap();

        let caldir = fixture.caldir();
        assert!(resolves_to(&caldir, "tuta", &path_tuta));
        assert_eq!(resolved(&caldir, "hooli"), None);
    }

    #[cfg(unix)]
    #[test]
    fn incompatible_plugin_binaries_are_not_registered() {
        let fixture = ProviderFixture::new();
        let path_tuta = fixture.on_path("tuta");
        fixture.plugin("tuta", "0.11.2");
        fixture.plugin("hooli", "0.13.0");

        let caldir = fixture.caldir();

        assert!(resolves_to(&caldir, "tuta", &path_tuta));
        assert_eq!(resolved(&caldir, "hooli"), None);
    }

    #[test]
    fn rescanning_providers_does_not_notify() {
        let caldir = TestCaldir::new();
        let state = caldir.state();
        let subscriber = state.subscribe_providers_changed();

        state.rescan_providers();
        assert!(!subscriber.has_changed().unwrap());

        state.notify_providers_changed();
        assert!(subscriber.has_changed().unwrap());
    }
}
