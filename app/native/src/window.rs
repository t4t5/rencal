//! What NSH's window API leaves out, done on the GTK window itself: a minimum
//! size, and keeping the app running when the window closes.

const MIN_WINDOW_WIDTH: i32 = 300;
const MIN_WINDOW_HEIGHT: i32 = 600;

/// Sets the main window up; with `hide_on_close`, closing hides it, so reminders
/// keep running and the next launch brings it back (`focus-window`).
#[cfg(target_os = "linux")]
pub fn configure(hide_on_close: bool) {
    use gtk4::glib::{MainContext, Propagation};
    use gtk4::prelude::*;

    // GTK lives on the main thread; the engine calls from its own.
    MainContext::default().invoke(move || {
        // Headless test runs have no GTK.
        if !gtk4::is_initialized() {
            return;
        }
        for window in gtk4::Window::list_toplevels() {
            let Ok(window) = window.downcast::<gtk4::Window>() else {
                continue;
            };
            window.set_size_request(MIN_WINDOW_WIDTH, MIN_WINDOW_HEIGHT);
            if hide_on_close {
                window.connect_close_request(|window| {
                    window.set_visible(false);
                    Propagation::Stop
                });
            }
        }
    });
}

#[cfg(not(target_os = "linux"))]
pub fn configure(_hide_on_close: bool) {}
