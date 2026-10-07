//! Deep-link intake for the webview. Parsing and the inbox live in
//! `rencal_core::deep_links`.

use rencal_core::deep_links::DeepLinkInbox;
use tauri::{AppHandle, Runtime};

use crate::events::AppEvent;

/// Validate and enqueue URLs, waking the frontend when any were accepted. The
/// emitted event is only a wake-up signal; the inbox remains authoritative and
/// is drained through taurpc.
pub fn enqueue_urls<R: Runtime>(
    app: &AppHandle<R>,
    inbox: &DeepLinkInbox,
    urls: &[String],
) -> usize {
    let accepted = inbox.enqueue(urls);
    if accepted.events > 0 {
        let _ = AppEvent::EventDeepLinkAvailable(()).emit(app);
    }
    if accepted.plugin_installs > 0 {
        let _ = AppEvent::PluginDeepLinkAvailable(()).emit(app);
    }
    accepted.total()
}
