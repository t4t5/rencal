# rencal-app

The native GPUI app (`GPUI_PORT_PLAN.md`), built on `gpui-kit` (pinned exactly, see D1). It runs next to the Tauri app until cutover: binary `rencal-app`, single-instance socket `rencal-gpui`. Run it with `just app` (`just app '*'` logs debug; a comma-separated value narrows to targets containing those names). Backend logic stays in `rencal-core`; geometry, time and text logic go in the pure crates (§3.1), never here.

## Layout

- `main.rs`: startup order. Logging, single instance, the tokio runtime, `AppState`; then `Settings`, `UiState` and `ThemeStore` are installed before the first window opens.
- `runtime.rs`: the `Tokio` global (D6; gpui-kit 0.7.1 ships no `gpui_tokio`). Backend futures and blocking IO run there; UI code awaits their `JoinHandle`s in `cx.spawn`. Never do file IO on the main thread after startup.
- `watchers.rs`: the GPUI side of `rencal-core`'s watchers, replacing the Tauri app's `state_bridge.rs`/`AppEvent`. `AppState` channels and callback watchers each get one `cx.spawn` loop that updates a global. External caldir changes bump `CaldirRevision`; the views that load caldir data observe it.
- `settings.rs`: `Settings` global (renCal's `config.toml`, caldir settings, system tz). Write through `Settings::update_rencal`; the config watcher reloads edits made elsewhere.
- `ui_state.rs`: `UiState` (view, sidebar, group), JSON in the XDG state dir. View ids are strings so the view registry stays open.
- `theme/`: `ThemeStore` global (`mod.rs`), the theme selection port of `theme-settings.ts` (`selection.rs`), the gpui-kit projection (`bridge.rs`, §4.8) and embedded fonts. Components read tokens through `cx.ren_theme()`; gpui-kit's `cx.theme()` is only for stock gpui-kit components.
- `actions.rs`: actions and key bindings. Single-character bindings belong to the `CalendarView` key context only.
- `deep_links.rs`: `rencal://` intake (launch args, Linux single-instance socket, macOS `open_urls`) into `AppState`'s inbox.
- `windows/`: main window, settings window, the fatal-error window, and shared chrome (`window_options`, `drag_region`).

## Rules

- Import GPUI through `gpui_kit` (`use gpui_kit::{…}`), never a `gpui` crate. Test modules import what they use; `use gpui_kit::*` with `test-support` shadows `#[test]`.
- Globals change only when a value changes (`Settings::update`, `UiState::update`, `ThemeStore` compare before setting), so observers can refetch freely.
- UI tests: `#[gpui_kit::test]` with `test_support::init` for the globals. Nothing in a test may write the user's files (`UiState::init_with(…, None, cx)`).
- Building needs the nix dev shell (`flake.nix` adds GPUI's xkbcommon/Wayland/X11/Vulkan libraries); CI installs the apt equivalents.
