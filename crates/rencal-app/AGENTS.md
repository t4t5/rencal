# rencal-app

The native GPUI app (`GPUI_PORT_PLAN.md`), built on `gpui-kit` (pinned exactly, see D1). It runs next to the Tauri app until cutover: binary `rencal-app`, single-instance socket `rencal-gpui`. Run it with `just app` (`just app '*'` logs debug; a comma-separated value narrows to targets containing those names). Backend logic stays in `rencal-core`; geometry, time and text logic go in the pure crates (§3.1), never here.

## Layout

- `main.rs`: startup order. Logging, single instance, the tokio runtime, `AppState`; then `Settings`, `UiState` and `ThemeStore` are installed before the first window opens, then `Backend`, `Clock`, `Navigation`, `EventStore` and `SyncState`.
- `runtime.rs`: the `Tokio` global (D6; gpui-kit 0.7.1 ships no `gpui_tokio`). Backend futures and blocking IO run there; UI code awaits their `JoinHandle`s in `cx.spawn`. Never do file IO on the main thread after startup.
- `watchers.rs`: the GPUI side of `rencal-core`'s watchers, replacing the Tauri app's `state_bridge.rs`/`AppEvent`. `AppState` channels and callback watchers each get one `cx.spawn` loop that updates a global. External caldir changes bump `CaldirRevision`; the views that load caldir data observe it.
- `settings.rs`: `Settings` global (renCal's `config.toml`, caldir settings, system tz). Write through `Settings::update_rencal`; the config watcher reloads edits made elsewhere.
- `ui_state.rs`: `UiState` (view, sidebar, group), JSON in the XDG state dir. View ids are strings so the view registry stays open.
- `theme/`: `ThemeStore` global (`mod.rs`), the theme selection port of `theme-settings.ts` (`selection.rs`), the gpui-kit projection (`bridge.rs`, §4.8) and embedded fonts. Components read tokens through `cx.ren_theme()`; gpui-kit's `cx.theme()` is only for stock gpui-kit components.
- `backend.rs`: the `Backend` global (`Arc<AppState>`), `Backend::read` (blocking caldir reads on the runtime) and the RPC → `rencal_time` conversion (serde, since the app model mirrors the RPC types). `None` in tests.
- `clock.rs`: `Clock` (current minute, viewer zone, today), ticking on minute boundaries and following `Settings::system_tz`. Never read `Utc::now()` for display; read the clock.
- `navigation.rs`: `Navigation` (active date). `navigate_to` is a deliberate jump: it bumps `version`, which views compare to recheck visibility (`docs/scroll-behaviour.md`); `set_active_date` only changes the date.
- `event_store.rs`: `EventStore` entity (`EventStore::global`): calendars, visible calendars (active group), range-based serialized loading (`ensure_loaded` only widens; views never wait), invites, the open (`active_event`) and agenda-selected (`selected_event`) event. `revision` bumps with every events change; cache layouts on it.
- `sync_state.rs`: `SyncState` (port of `SyncContext`): preview/sync on start, on calendar changes and on window focus; `sync_now` for `s`.
- `keymap.rs`: the shortcut table (fixture-tested against `tests/fixtures/shortcuts.json`) and its actions; `commands.rs`: the palette table (`palette_commands.json`). `actions.rs` binds both and handles the app-level actions.
- `views/`: the open view registry (`VIEWS`, keyed by `UiState::calendar_view`), `InfiniteAxis` + `WeekSnap` (`axis.rs`), month, week and board views, and `measure` (a view sizes itself from last frame's bounds).
- `sidebar/`: toolbar, `Minical`, `Agenda` (GPUI `list` of day sections; ghost section, regroup anchoring, `Tab` selection). `toolbar.rs`: controls shared by the header and the narrow sidebar toolbar.
- `palette.rs` (command palette, go-to-date, theme/group pages), `search.rs` (search palette, `jump_to_event`), `shortcuts_overlay.rs`: overlays on gpui-kit `Command`/`Dialog`/`Sheet`. A chosen command runs after the dialog closes and focus is restored, so window-level actions reach the main window.
- `ui/`: theme tokens as GPUI values (`Palette`, `metric`, `text_size`, typography `Role`s), resolved `Fonts`, event paint (`event_paint.rs`, §4.6) and key chips. `assets.rs`: renCal's SVG icons (`RenIcon`) over gpui-kit's bundle.
- `deep_links.rs`: `rencal://` intake (launch args, Linux single-instance socket, macOS `open_urls`) into `AppState`'s inbox; event links open the event.
- `windows/`: main window (sidebar, header, current view, window-level actions), settings window, the fatal-error window, and shared chrome (`window_options`, `drag_region`).

## Rules

- Import GPUI through `gpui_kit` (`use gpui_kit::{…}`), never a `gpui` crate. Test modules import what they use; `use gpui_kit::*` with `test-support` shadows `#[test]`.
- Globals change only when a value changes (`Settings::update`, `UiState::update`, `ThemeStore` compare before setting), so observers can refetch freely.
- UI tests: `#[gpui_kit::test]` with `test_support::init` for the globals (frozen clock: Wed 2026-10-07 10:00 UTC; empty `EventStore` without a backend, fill it with `set_test_events`). Nothing in a test may write the user's files (`UiState::init_with(…, None, cx)`). Tests that load through a real `AppState` (`event_store::tests`) need `cx.executor().allow_parking()` and a tokio runtime.
- Views read events and calendars from `EventStore` and colours through `ui::event_paint`; never call `rencal_core::caldir` from a view. Pure maths (lanes, snapping, time) belongs in the domain crates.
- GPUI can't paint a border on a quad no taller (or wider) than the border; draw hairlines as background quads (see the week view's current-time line).
- Building needs the nix dev shell (`flake.nix` adds GPUI's xkbcommon/Wayland/X11/Vulkan libraries); CI installs the apt equivalents.
