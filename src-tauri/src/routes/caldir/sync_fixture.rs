//! Calendars backed by stub provider binaries, for the sync routes' tests.

use std::os::unix::fs::PermissionsExt;
use std::path::Path;

use caldir_core::{
    CalendarConfig, Event, EventTime, ProviderSlug, RemoteConfig, RemoteConfigParams,
};
use tempfile::TempDir;

use crate::state::{AppState, ProviderDirs};

/// Every request fails with this, like a CalDAV resource caldir can't parse.
pub const BROKEN_MESSAGE: &str = "malformed resource";

pub struct SyncFixture {
    _tmp: TempDir,
    pub state: AppState,
}

impl SyncFixture {
    /// One calendar per `(slug, provider)`. Provider `ok` serves one event,
    /// `broken` fails every request, and any other slug isn't installed.
    pub fn new(calendars: &[(&str, &str)]) -> Self {
        let tmp = TempDir::new().unwrap();
        let bin = tmp.path().join("bin");
        std::fs::create_dir_all(&bin).unwrap();

        let start = EventTime::Date(chrono::Utc::now().date_naive());
        let event = Event::new("Standup", start).to_ics_string();
        let ok = serde_json::json!({ "status": "success", "data": [event] });
        stub_provider(&bin, "ok", &ok.to_string());
        let broken = serde_json::json!({ "status": "error", "error": BROKEN_MESSAGE });
        stub_provider(&bin, "broken", &broken.to_string());

        let config_path = tmp.path().join("config.toml");
        let data_dir = tmp.path().join("data");
        std::fs::write(
            &config_path,
            format!("calendar_dir = \"{}\"\n", data_dir.display()),
        )
        .unwrap();
        let dirs = ProviderDirs {
            bundled: Some(bin),
            plugins: None,
        };
        let state = AppState::load_from(config_path, dirs).unwrap();

        for (slug, provider) in calendars {
            let remote =
                RemoteConfig::new(ProviderSlug::from(*provider), RemoteConfigParams::new());
            let config = CalendarConfig::new(None, None, None, Some(remote));
            state.caldir().create_calendar(slug, Some(config)).unwrap();
        }

        Self { _tmp: tmp, state }
    }

    pub fn event_count(&self, slug: &str) -> usize {
        self.state.events(slug).unwrap().len()
    }
}

/// A provider binary that ignores the request and prints `response`.
fn stub_provider(dir: &Path, slug: &str, response: &str) {
    let response_path = dir.join(format!("{slug}.json"));
    std::fs::write(&response_path, response).unwrap();
    let binary = dir.join(format!("caldir-provider-{slug}"));
    std::fs::write(
        &binary,
        format!(
            "#!/bin/sh\ncat > /dev/null\ncat '{}'\n",
            response_path.display()
        ),
    )
    .unwrap();
    std::fs::set_permissions(&binary, std::fs::Permissions::from_mode(0o755)).unwrap();
}
