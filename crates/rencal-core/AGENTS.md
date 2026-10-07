# rencal-core

renCal's UI-independent backend, shared by the Tauri app (`src-tauri/`) and the GPUI app being built per `GPUI_PORT_PLAN.md`.

- No UI framework dependencies: never import `tauri`, `gpui` or webview concepts here. Anything that needs a UI service takes it as a parameter (e.g. `caldir::OpenUrl` for opening the browser) or reports through a callback (watchers in `external_themes`, `omarchy`, `watchers::{plugins,rencal_config,tz}`).
- Read the module docs at the top of `state.rs`, `watchers/mod.rs`, `fs_watch.rs` and `tasks.rs` before touching backend state or watchers. `AppState` exposes changes as tokio `watch` channels; each UI shell turns them into its own notifications.
- `caldir/` holds one operation per file, exported under its own name (`rencal_core::caldir::list_events`). UI code goes through these, never through `caldir-core` directly.
- Failures are `error::CoreError` with a stable `CoreErrorKind`. Classify concrete causes before adding context.
- Feature `specta` adds `specta::Type` derives for the Tauri app's TypeScript export. Gate new derives with `#[cfg_attr(feature = "specta", derive(specta::Type))]`; keep exported names stable (`CoreError` exports as `RpcError`), then run `just gen-types` and check `src/rpc/` is unchanged unless you meant to change the contract.
- Plugins: `src/plugins/README.md`. Notifications: `docs/notifications.md`.
- caldir pinning rules: see `src-tauri/AGENTS.md` → caldir.
