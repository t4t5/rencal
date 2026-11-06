//! What the backend needs from the app around it: a way to tell the UI that
//! something happened and a way to open URLs. This replaces Tauri's
//! `AppHandle`; `Backend.onEvent` delivers the events to TSX.

use std::sync::LazyLock;

use serde_json::Value;
use tokio::sync::broadcast;

/// Events waiting for TSX. Bursts are coalesced by the watchers, so a lagging
/// listener only ever misses repeats of a "go refetch".
static EVENTS: LazyLock<broadcast::Sender<(String, Value)>> =
    LazyLock::new(|| broadcast::channel(256).0);

#[derive(Clone, Copy)]
pub struct AppHandle;

impl AppHandle {
    pub fn emit(&self, name: &str, payload: Value) {
        // No receiver just means no window has subscribed yet.
        let _ = EVENTS.send((name.to_owned(), payload));
    }
}

pub fn subscribe() -> broadcast::Receiver<(String, Value)> {
    EVENTS.subscribe()
}

/// Opens `url` in the user's browser.
pub fn open_url(url: &str) -> std::io::Result<()> {
    let opener = if cfg!(target_os = "macos") {
        "open"
    } else {
        "xdg-open"
    };
    std::process::Command::new(opener).arg(url).spawn().map(drop)
}
