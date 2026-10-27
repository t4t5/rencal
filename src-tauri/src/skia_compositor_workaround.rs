//! Workaround for WebKitGTK 2.54's Skia compositor showing stale frames.
//!
//! With damage-based compositing, a repaint can land in only one of the
//! swapchain buffers. While WebKit keeps compositing without repainting (e.g.
//! during a smooth scroll), frames then alternate between the new and the old
//! content, and the old one can stay on screen: the month grid flickers
//! between the previous and the new week after navigating. Turning off the
//! `UseDamagingInformationForCompositing` feature fixes it too, but WebKit
//! only reads it when the web process starts, before Tauri hands us the
//! webview. The non-Skia compositor doesn't have the bug.

/// Switches WebKit to its non-Skia compositor. Must run before GTK/WebKit
/// initialize.
pub fn apply() {
    // Respect an explicit user setting, so `=1` brings Skia back.
    if std::env::var_os("WEBKIT_USE_SKIA_FOR_COMPOSITION").is_some() {
        return;
    }

    // SAFETY: called at the top of run(), before GTK/WebKit initialize;
    // nothing else reads this variable at this point.
    unsafe {
        std::env::set_var("WEBKIT_USE_SKIA_FOR_COMPOSITION", "0");
    }
}
