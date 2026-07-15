//! Opening .ics files in a preview window.
//!
//! Files reach us three ways: argv on a cold start, the single-instance
//! channel when another launch passes a file, and (macOS) `RunEvent::Opened`.
//! All paths funnel into [`open_preview_window`].

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU32, Ordering};

use tauri::{AppHandle, WebviewUrl, WebviewWindowBuilder};

/// Each preview gets its own window, so labels must be unique.
static PREVIEW_COUNT: AtomicU32 = AtomicU32::new(0);

/// Find the first argument that points at an existing .ics file.
/// Relative paths resolve against `cwd` (the invoking process's working
/// directory — not necessarily ours when args come from another instance).
pub fn ics_path_from_args<I>(args: I, cwd: Option<&Path>) -> Option<PathBuf>
where
    I: IntoIterator<Item = String>,
{
    args.into_iter().find_map(|arg| {
        if !arg.to_lowercase().ends_with(".ics") {
            return None;
        }
        let path = PathBuf::from(&arg);
        let path = match (path.is_relative(), cwd) {
            (true, Some(base)) => base.join(path),
            _ => path,
        };
        path.canonicalize().ok().filter(|p| p.is_file())
    })
}

pub fn open_preview_window(app: AppHandle, path: String) {
    // Window creation must happen on the main thread; callers may be on the
    // single-instance listener thread or inside a run-loop callback.
    let scheduled = app.clone().run_on_main_thread(move || {
        let label = format!("ics-preview-{}", PREVIEW_COUNT.fetch_add(1, Ordering::Relaxed));

        let query = url::form_urlencoded::Serializer::new(String::new())
            .append_pair("appWindow", "icsPreview")
            .append_pair("file", &path)
            .finish();

        let builder = WebviewWindowBuilder::new(
            &app,
            &label,
            WebviewUrl::App(format!("/?{query}").into()),
        )
        .title("Add Event")
        .inner_size(420.0, 640.0)
        .center();

        #[cfg(target_os = "macos")]
        let builder = builder.title_bar_style(tauri::TitleBarStyle::Overlay);
        #[cfg(not(target_os = "macos"))]
        let builder =
            builder.decorations(crate::routes::platform::needs_native_decorations());

        if let Err(e) = builder.build() {
            log::error!("failed to open ics preview window for '{path}': {e}");
        }
    });

    if let Err(e) = scheduled {
        log::error!("failed to schedule ics preview window: {e}");
    }
}
