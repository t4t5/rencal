# Notifications

The reminder loop scans caldir for events with VALARMs whose trigger time (event start minus
reminder minutes) falls in the catch-up window, records delivered reminder keys, and fires desktop
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
`~/.local/bin/rencal-notifierd` and `~/.config/systemd/user/...` instead. The
single `rencal-notifierd.service` template ships in deb/rpm as-is (with
`ExecStart=/usr/bin/rencal-notifierd`); the `just` recipe sed-substitutes
the path to `%h/.local/bin/rencal-notifierd` when installing for development.

### First-run enablement

systemd user units in `/usr/lib/systemd/user/` are _available_ but each user
still has to enable them. The rencal GUI's `setup` calls
`enable_notifierd_if_needed()` on Linux — if the unit is visible but disabled,
it runs `systemctl --user enable --now rencal-notifierd.service`. So a fresh
package install + first launch of rencal is enough; users never need to touch
`systemctl` themselves. Already-enabled and not-found cases are no-ops.

Uninstall with `just uninstall-notifierd` (self-install) or your package
manager (system install).

## Catch-up window and per-reminder dedup

Each tick scans triggers in `(now - 4h, now]` and fires any not yet recorded in
`~/.cache/rencal/delivered-reminders.json`. The cache key is
`(event.unique_id(), trigger_time_utc)` — fine-grained enough that:

- Repeated ticks within the catch-up window don't refire the same reminder (steady state).
- An event that lands in caldir _after_ a tick has already passed its trigger time still fires
  once — sync, manual create, or the file watcher picking up an external write. The earlier
  global-checkpoint model would have advanced past the trigger and silently dropped the
  notification; the cache is the only thing that can mark a reminder delivered.
- Moving an event produces a new trigger instant → new key → fires once at the new time.
  The stale entry sits in the cache until eviction.

The 4h cap bounds how loud a freshly-launched host gets after a long sleep — older triggers are
considered too stale to surface. The `>` on the left is exclusive so a reminder exactly at the
cap boundary doesn't fire (negligible in practice, just keeps the math clean).

Eviction drops entries whose trigger is older than the cap on every tick. They can never re-fire
(the scan window stops there), so retention is pure bloat.

A missing or corrupt cache file yields an empty cache rather than an error — at worst we re-fire
a few reminders, which is louder and recoverable, vs. silently swallowing them.

The cache file is shared between the GUI's in-process loop (used as a fallback on Linux when the
daemon isn't installed) and the daemon. Only one of them runs at a time on Linux thanks to the
daemon-detection check in `should_run_in_process_reminders()`.

### Notifications-disabled handling

When the user toggles notifications off, ticks still walk the cache and record eligible triggers
as delivered (without calling `notify`). This means re-enabling later doesn't dump the previous
4h of stale reminders — disabled means "I don't want these," not "queue them up for me."

## Supported reminder range

The loop honors reminder offsets from **4 weeks before** to **24 hours after**
the event start. Both bounds drive the `events_in_range` scan: we widen the
event-start scan by these offsets so that any trigger landing in the catch-up
window has its event loaded. Reminders outside the range are skipped with a
debug log — they wouldn't fire reliably anyway because the scan wouldn't cover
their event's start time.

The "after" side covers iCal `TRIGGER:PT...` alarms (e.g. Google's
`TRIGGER:PT8H` default for all-day events, which caldir parses as a negative
`minutes`); 24h is enough for "fire at HH:MM on the day of the event"
patterns. The "before" side matches Google Calendar's UI cap.

## Trigger times

Reminders resolve event start times to a UTC instant via
`EventTime::resolve_instant_in_zone(&Local)`, not `EventTime::to_utc` —
caldir-core documents `to_utc` as an ordering projection, and it gets two
cases wrong for our purposes:

- **All-day `Date`** resolves to local midnight on the host. A "1h before"
  reminder on a "today" all-day event fires at 23:00 yesterday _local_, not
  23:00 UTC.
- **`DateTimeFloating`** is interpreted in the host's local zone (RFC 5545
  floating semantics: "9am wherever you are"). A 09:00 floating event fires
  at 09:00 local on whichever host runs the reminder loop.

`DateTimeUtc` and `DateTimeZoned` already have an unambiguous instant and
pass through to caldir-core's `to_utc`.

## Per-event collapse

When multiple reminders for the same event fall in the same tick's window — typical on catch-up,
e.g. both "1h before" and "30m before" Lunch when the host launched after both fired — only the
one with the latest trigger time fires. In steady state, reminders for the same event fall on
different ticks so this is a no-op; on catch-up it collapses a stale stack into one notification
per event. The collapsed (latest) trigger is what gets recorded in the cache.

## Single-instance guard (GUI)

Only one rencal GUI process runs at a time. A second launch focuses the existing window instead of
spawning a duplicate. Two GUI processes would each run their own in-process reminder loop (in the
daemon-not-installed fallback path) and race over the same `delivered-reminders.json` cache. The
per-reminder cache suppresses repeats after a successful write, but single-instance still matters:
two processes could both read the cache before either writes and then both notify. The daemon is
similarly single-by-construction (systemd unit).

On macOS/Windows we use `tauri-plugin-single-instance` directly. On **Linux** we can't: the plugin
uses `zbus::blocking` for D-Bus IPC, and `tauri-plugin-dialog`'s `xdg-portal` feature transitively
turns on `zbus/tokio`. With Cargo feature unification that flips zbus's blocking layer over to a
tokio-based executor that panics from inside `#[tokio::main]` ("Cannot start a runtime from within
a runtime") — the same shape as the notification panic below, different culprit.

So on Linux we use a tiny stand-in in `src-tauri/src/single_instance.rs`: a Unix domain socket at
`$XDG_RUNTIME_DIR/rencal.sock` (or `/tmp/rencal-<uid>.sock` when `XDG_RUNTIME_DIR` is unset —
UID-namespaced so two users on the same host don't collide on a shared `/tmp` path). On startup
we try to connect — if it succeeds, another instance is alive and we send `focus\n` then exit.
Otherwise we bind the socket and a background thread accepts connections, calling a handler that
unminimizes/shows/focuses the main window.

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
