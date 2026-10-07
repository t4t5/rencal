//! Windows (GPUI_PORT_PLAN.md §3.4, §7) and the chrome they share.
//!
//! Decorations: macOS draws the app under a transparent title bar with the
//! traffic lights inset. Linux uses client-side decorations (no frame) on
//! tiling compositors like Hyprland, and the window manager's own title bar on
//! known stacking desktops (`rencal_core::platform::needs_native_decorations`).

pub mod fatal;
pub mod main_window;
pub mod settings_window;

use gpui_kit::component::TitleBar;
use gpui_kit::{
    App, Bounds, Div, InteractiveElement, MouseButton, Pixels, Point, Size, Stateful,
    TitlebarOptions, WindowBounds, WindowControlArea, WindowDecorations, WindowOptions, div, point,
    px,
};

/// The Linux app id, matching the `.desktop` file's `StartupWMClass`.
const APP_ID: &str = "rencal";

/// Height of the macOS title bar strip the traffic lights sit in.
pub const MACOS_TITLE_BAR_HEIGHT: Pixels = px(28.);

pub fn window_options(
    size: Size<Pixels>,
    min_size: Option<Size<Pixels>>,
    traffic_lights: Point<Pixels>,
    cx: &App,
) -> WindowOptions {
    WindowOptions {
        window_bounds: Some(WindowBounds::Windowed(Bounds::centered(None, size, cx))),
        window_min_size: min_size,
        app_id: Some(APP_ID.into()),
        titlebar: Some(TitlebarOptions {
            traffic_light_position: Some(traffic_lights),
            ..TitleBar::title_bar_options()
        }),
        window_decorations: Some(if rencal_core::platform::needs_native_decorations() {
            WindowDecorations::Server
        } else {
            WindowDecorations::Client
        }),
        ..TitleBar::window_options()
    }
}

pub fn default_traffic_lights() -> Point<Pixels> {
    point(px(9.), px(9.))
}

/// An empty area that moves the window when dragged, like the old
/// `data-tauri-drag-region`.
pub fn drag_region(id: &'static str) -> Stateful<Div> {
    div()
        .id(id)
        .window_control_area(WindowControlArea::Drag)
        .on_mouse_down(MouseButton::Left, |event, window, _| {
            if event.click_count < 2 {
                window.start_window_move();
            } else if cfg!(target_os = "macos") {
                window.titlebar_double_click();
            } else {
                window.zoom_window();
            }
        })
}
