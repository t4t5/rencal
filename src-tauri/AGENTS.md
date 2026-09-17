# Rust backend (Tauri v2 + taurpc)

- Read the module docs at the top of `state.rs`, `state_bridge.rs`, `watchers/mod.rs`, `fs_watch.rs` and `tasks.rs` before touching backend state, events or watchers. They define the architecture; follow them.
- Avoid `i64` / `u64` in taurpc route types (Specta exports them as BigInt). Use `i32` / `u32`.
- For fixed string sets, use Rust enums with `#[serde(rename = "...")]` variants.
- Regenerate bindings with `just gen-types` when route types change.
- Handlers take an `AppHandle` only for platform services, never to tell the webview that state changed. Every state change notifies through `AppState`.
- Notifications: `docs/notifications.md`, `src-tauri/reminder-core/`.

## caldir

- Calendars/events are read from the local caldir directory via `caldir-core`.
- Provider credential field IDs come from the caldir provider binaries.
- `caldir-core` and the provider binaries are pinned separately in `Cargo.toml`. Update the crate normally; change the provider release with `just bump-caldir <tag>`, which regenerates `caldir-providers.sha256`. Never edit the tag or checksum file by hand.
