//! Workaround for web processes outliving their windows on Linux.
//!
//! When a Tauri window closes, its webview is destroyed and finalized, but the
//! `WebKitWebProcess` behind it keeps running until the app quits: each time
//! Settings was opened left about 100 MB behind. A bare Tauri app does the same
//! and a bare WebKitGTK window doesn't. Ending the process ourselves is safe
//! because the page is going away, and renCal has no unload handlers to skip.

use tauri::{Manager, Window};
use webkit2gtk::WebViewExt;

/// Ends the web process of a closing window. Call it on `CloseRequested`, while
/// the webview still exists, and only for a window that will really close.
pub fn terminate(window: &Window) {
    let Some(webview) = window.get_webview_window(window.label()) else {
        return;
    };
    if let Err(error) = webview.with_webview(|webview| webview.inner().terminate_web_process()) {
        log::warn!(
            "could not end the web process of {}: {error}",
            window.label()
        );
    }
}
