//! `rencal://` intake (GPUI_PORT_PLAN.md §7). URLs arrive as launch
//! arguments, from later launches through the Linux single-instance socket, or
//! from macOS `open_urls`. All of them land in `AppState`'s deep-link inbox.
//! Event links (from reminder notifications) are drained here and open the
//! event (`useEventDeepLinks`); plugin install links open the install dialog
//! (`plugins::install_dialog`).

use std::sync::Arc;

use gpui_kit::App;
use rencal_core::state::AppState;
use tokio::sync::mpsc;

use crate::backend::{self, Backend};
use crate::clock::Clock;
use crate::search;
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
                open_event_links(cx);
                crate::plugins::install_dialog::drain(cx);
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

/// Opens the last queued event link that resolves to a local event.
pub fn open_event_links(cx: &mut App) {
    let Some(state) = Backend::try_state(cx) else {
        return;
    };
    let links = state.deep_links.take();
    if links.is_empty() {
        return;
    }
    let viewer = Clock::global(cx).viewer;
    let Some(find) = Backend::read(cx, move |state| {
        links
            .into_iter()
            .filter_map(|link| {
                match rencal_core::caldir::find_event(state, link.uid.clone(), link.recurrence_id) {
                    Ok(Some(event)) => backend::app_events(&[event], viewer).pop(),
                    Ok(None) => {
                        log::warn!("event link {}: no matching local event", link.uid);
                        None
                    }
                    Err(err) => {
                        log::error!("event link {}: {err}", link.uid);
                        None
                    }
                }
            })
            .last()
    }) else {
        return;
    };
    cx.spawn(async move |cx| {
        if let Ok(Some(event)) = find.await {
            cx.update(|cx| search::jump_to_event(event, cx));
        }
    })
    .detach();
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
