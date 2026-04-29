# Notifications

Desktop notifications for calendar reminders run as a background tokio task spawned in
`src-tauri/src/lib.rs::setup()`. The loop aligns to minute boundaries, scans caldir for events
with reminders whose trigger time (event start minus reminder minutes) falls in the current
window, and fires a desktop notification. No frontend involvement or state DB needed. Test with
`just test-notification`.

## Catch-up window

Each tick fires reminders whose trigger time is in `(last_check, now]`, capped at 4 hours. The
last successful tick's timestamp is persisted to `~/.cache/rencal/last-reminder-check` so a
reminder that fired while rencal wasn't running (laptop closed, app not launched) still fires on
the first tick after launch — as long as it's within the 4h cap.

The `>` on the left is exclusive so reminders don't double-fire at tick boundaries — the previous
tick already covered anything at exactly `last_check`.

On first run with no cache file, the fallback is `now - cap` (the full catch-up window), not 60s.
A 60s fallback would defeat catch-up on every fresh install or cache wipe — the user would only
get the reminders that fired in the last minute, which is rarely the case after launching the
app.

What this fixes: on Linux there's no OS-level scheduled notification API (the FreeDesktop
Notifications spec only does immediate delivery), so a reminder whose trigger fires while the
laptop is suspended or rencal is closed would otherwise be lost. The catch-up window covers the
common case of "I just opened my laptop" without requiring a separate always-running daemon.

What this does not fix: reminders missed by more than 4h, or reminders missed while rencal was
never launched. Those require the daemon model (a separate `rencal-notifierd` autostarted via
systemd user unit), which is the planned next step.

## Per-event dedup

When multiple reminders for the same event fall in the same tick's window — typical on catch-up,
e.g. both "1h before" and "30m before" Lunch when rencal launched after both fired — only the one
with the latest trigger time fires. In steady state, reminders for the same event fall on
different ticks so this is a no-op; on catch-up it collapses a stale stack into one notification
per event.

## Linux: notify-send instead of tauri-plugin-notification

On Linux, `tauri-plugin-notification` → `notify-rust` (with default `z` feature) uses zbus on the
async-io runtime. The plugin re-spawns the show call onto Tauri's tokio runtime (see
`tauri-plugin-notification`'s `desktop.rs`, where `show()` calls `tauri::async_runtime::spawn`),
and inside `notify_rust::show()` `zbus::block_on` panics with:

```
Cannot start a runtime from within a runtime. This happens because a function (like `block_on`)
attempted to block the current thread while the thread is being used to drive asynchronous tasks.
```

…because the spawned thread already has a tokio context. We can't escape it from the call site
because the plugin re-routes internally regardless of which thread we call from. So on Linux we
shell out to `notify-send` instead, which goes to the same D-Bus notification daemon (mako,
dunst, etc.) with no async runtime involved. Other platforms keep using
`tauri-plugin-notification`.
