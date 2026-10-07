# Tauri shell (Tauri v2 + taurpc)

The backend logic lives in `crates/rencal-core` (see its `AGENTS.md`). This crate is a thin shell: taurpc routes that forward to `rencal_core`, Tauri plugins, windows, menus and platform glue.

- Read the module docs at the top of `state_bridge.rs` and `watchers.rs` here, and of `state.rs`, `watchers/mod.rs`, `fs_watch.rs` and `tasks.rs` in `rencal-core`, before touching backend state, events or watchers. They define the architecture; follow them.
- Webview notifications are declared once in `events.rs` (`AppEvent`) and emitted through its adapter; route failures are `rencal_core::error::CoreError` (exported as `RpcError`). Both are exported to `src/rpc/*.generated.ts`/`bindings.ts` by `just gen-types`, and the frontend consumes them only through `src/lib/api/`.
- Avoid `i64` / `u64` in taurpc route types (Specta exports them as BigInt). Use `i32` / `u32`.
- For fixed string sets, use Rust enums with `#[serde(rename = "...")]` variants.
- Regenerate bindings with `just gen-types` when route types change.
- Handlers take an `AppHandle` only for platform services, never to tell the webview that state changed. Every state change notifies through `AppState`.
- Notifications: `docs/notifications.md`, `src-tauri/reminder-core/`.

## caldir

- Calendars/events are read from the local caldir directory via `caldir-core`.
- Provider credential field IDs come from the caldir provider binaries.
- `caldir-core` and the provider binaries are pinned separately in `Cargo.toml`. Update the crate normally; change the provider release with `just bump-caldir <tag>`, which regenerates `caldir-providers.sha256`. Never edit the tag or checksum file by hand.
