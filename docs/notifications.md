# Notifications

The reminder loop scans caldir for events with VALARMs whose trigger time (event start minus
reminder minutes) falls in the current tick's window, dedupes per event, and fires desktop
notifications. The platform-agnostic logic lives in `src-tauri/reminder-core/`. There are two
hosts:

- **macOS / Windows**: in-process tokio task spawned from `src-tauri/src/lib.rs::setup()`, using
  `tauri-plugin-notification`.
- **Linux**: a separate `rencal-notifierd` binary autostarted as a systemd user service. The GUI
  detects the daemon via `systemctl --user is-active` and skips its own loop when active. If the
  daemon isn't installed, the GUI falls back to running the loop in-process and shelling out to
  `notify-send`.

Test with `just test-notification`.

## Why a daemon on Linux

The FreeDesktop Notifications spec only does immediate delivery — there's no OS-level scheduled
notification API like `UNUserNotificationCenter` (macOS) or `ScheduledToastNotification` (Windows).
So if rencal isn't running when a reminder is due, the reminder is lost. The catch-up window
(below) papers over short outages, but for "rencal was never launched today" or "user actually
quit the app on GNOME", you need a long-lived process. That's `rencal-notifierd`.

The daemon is a systemd user service tied to `graphical-session.target` — it starts when the user
logs into their graphical session and stops when they log out. Logs go to journald
(`journalctl --user -u rencal-notifierd -f`).

### Install paths

Package installs (`deb`, `rpm`, AUR `rencal-bin`) ship the daemon at
`/usr/bin/rencal-notifierd` and its unit file at
`/usr/lib/systemd/user/rencal-notifierd.service` (configured in
`tauri.conf.json` → `bundle.linux.{deb,rpm}.files`; CI builds the daemon in
`release.yml` before tauri-action so the file exists when the bundler runs).

Self-installs from a checkout use `just install-notifierd`, which writes to
`~/.local/bin/rencal-notifierd` and `~/.config/systemd/user/...` instead. There
are two `.service` templates in `src-tauri/notifierd/` to match: the
`rencal-notifierd.service` (uses `%h/.local/bin`) is shipped only by the just
recipe; `rencal-notifierd-system.service` (uses `/usr/bin`) is the one packaged
into deb/rpm.

### First-run enablement

systemd user units in `/usr/lib/systemd/user/` are _available_ but each user
still has to enable them. The rencal GUI's `setup` calls
`enable_notifierd_if_needed()` on Linux — if the unit is visible but disabled,
it runs `systemctl --user enable --now rencal-notifierd.service`. So a fresh
package install + first launch of rencal is enough; users never need to touch
`systemctl` themselves. Already-enabled and not-found cases are no-ops.

Uninstall with `just uninstall-notifierd` (self-install) or your package
manager (system install).

## Catch-up window

Each tick fires reminders whose trigger time is in `(last_check, now]`, capped at 4 hours. The
last successful tick's timestamp is persisted to `~/.cache/rencal/last-reminder-check` so a
reminder that fired while the host wasn't running (laptop suspended, daemon not yet started) still
fires on the first tick after launch — as long as it's within the 4h cap.

The `>` on the left is exclusive so reminders don't double-fire at tick boundaries — the previous
tick already covered anything at exactly `last_check`.

On first run with no cache file, the fallback is `now - cap` (the full catch-up window), not 60s.
A 60s fallback would defeat catch-up on every fresh install or cache wipe — the user would only
get the reminders that fired in the last minute, which is rarely the case after launching the
app.

The cache file is shared between the GUI's in-process loop (used as a fallback on Linux when the
daemon isn't installed) and the daemon. Only one of them runs at a time on Linux thanks to the
daemon-detection check in `should_run_in_process_reminders()`.

## Per-event dedup

When multiple reminders for the same event fall in the same tick's window — typical on catch-up,
e.g. both "1h before" and "30m before" Lunch when the host launched after both fired — only the
one with the latest trigger time fires. In steady state, reminders for the same event fall on
different ticks so this is a no-op; on catch-up it collapses a stale stack into one notification
per event.

## Single-instance guard (GUI)

`tauri-plugin-single-instance` ensures only one rencal GUI process runs at a time. A second launch
focuses the existing window instead of spawning a duplicate. This matters because two GUI
processes would each run their own reminder loop and write to the same `last-reminder-check`
cache, producing duplicate notifications. The daemon is similarly single-by-construction (systemd
unit).

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
shell out to `notify-send` instead (in both the daemon and the GUI's fallback path), which goes to
the same D-Bus notification daemon (mako, dunst, etc.) with no async runtime involved.

## Logs for bug reports

- **GUI**: `~/.local/share/org.ren.rencal/logs/renCal.log` (rotating, 5 × 1 MB).
- **Daemon**: `journalctl --user -u rencal-notifierd.service` (or `just notifierd-logs`).
