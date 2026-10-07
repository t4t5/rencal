//! `rencal://` intake (GPUI_PORT_PLAN.md §7). URLs arrive as launch
//! arguments, from later launches through the Linux single-instance socket, or
//! from macOS `open_urls`. All of them land in `AppState`'s deep-link inbox,
//! which the views that act on them drain.

use std::sync::Arc;

use gpui_kit::App;
use rencal_core::state::AppState;
use tokio::sync::mpsc;

use crate::windows::main_window;

/// URLs to queue, and where to say whether a main window was there to show.
pub struct Request {
    pub urls: Vec<String>,
    pub reply: Option<std::sync::mpsc::Sender<bool>>,
}

/// Feeds requests sent from other threads (the single-instance listener,
/// macOS `open_urls`) into the app.
pub fn listen(state: Arc<AppState>, mut requests: mpsc::UnboundedReceiver<Request>, cx: &mut App) {
    cx.spawn(async move |cx| {
        while let Some(request) = requests.recv().await {
            let shown = cx.update(|cx| {
                intake(&state, &request.urls);
                main_window::show(cx)
            });
            if let Some(reply) = request.reply {
                let _ = reply.send(shown);
            }
        }
    })
    .detach();
}

pub fn intake(state: &AppState, urls: &[String]) {
    if urls.is_empty() {
        return;
    }
    let accepted = state.deep_links.enqueue(urls);
    log::info!(
        "deep links: queued {} event link(s), {} plugin install(s)",
        accepted.events,
        accepted.plugin_installs
    );
}

/// Forwards later launches (Linux): their URLs, and a request to show the
/// window. The listener thread acks the launch only once the app confirms a
/// main window was there to show; a hung app does not, so the launch takes over.
#[cfg(target_os = "linux")]
pub fn spawn_instance_listener(
    listener: std::os::unix::net::UnixListener,
    requests: mpsc::UnboundedSender<Request>,
) {
    rencal_core::single_instance::spawn_listener(listener, move |urls| {
        let (reply, shown) = std::sync::mpsc::channel();
        let request = Request {
            urls,
            reply: Some(reply),
        };
        requests.send(request).is_ok()
            && shown
                .recv_timeout(std::time::Duration::from_millis(1500))
                .unwrap_or(false)
    });
}
