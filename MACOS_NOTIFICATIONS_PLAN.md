# macOS notifications: move to UNUserNotificationCenter

## Problem

Idle renCal on macOS was observed at ~185% CPU with 39h of accumulated CPU time.

`MacOsNotifier` (`src-tauri/src/notifications.rs`) sends each reminder through
`mac-notification-sys` with `.wait_for_click(true)` on a fresh `std::thread`. The crate then
blocks in `objc/notify.m`:

```objc
while (ncDelegate.keepRunning) {
    [[NSRunLoop currentRunLoop] runUntilDate:[NSDate dateWithTimeIntervalSinceNow:0.1]];
}
```

- The spawned thread's run loop has no input sources, so `runUntilDate:` returns immediately
  and the loop spins at 100% of a core.
- `keepRunning` is only cleared in `didActivateNotification:` (a click). A reminder that is
  dismissed, times out, or sits unread in Notification Center spins until the app quits.

Every ignored reminder therefore costs one core, forever. It was introduced with clickable
notifications in 7ce408a0 (#110). Separately, `NSUserNotificationCenter` has been deprecated
since macOS 11.

## Goal

Keep "click a reminder → open its event", with zero threads waiting on notifications:

- One delegate registered at startup receives clicks as callbacks.
- Posting a notification is fire-and-forget from any thread.
- Clicks work in every app state: foreground, background, window hidden, and quit (cold launch).

## Design

### Dependencies

- Add macOS-only deps: `objc2-user-notifications = "0.3"`, `block2 = "0.6"`, plus
  `objc2 = "0.6"` / `objc2-foundation = "0.3"` if they are not already reachable. These versions
  match what Tauri already pulls in (`objc2 0.6.4`, `objc2-* 0.3.2` in `Cargo.lock`), so no
  duplicate objc2 stacks.
- Enable only the class features used: `UNUserNotificationCenter`, `UNNotification`,
  `UNNotificationContent`, `UNNotificationRequest`, `UNNotificationResponse`,
  `UNNotificationSound`, `UNNotificationSettings`, `block2`.
- Remove `mac-notification-sys` once nothing uses it.

### New module: `src-tauri/src/macos_notifications.rs`

`#[cfg(target_os = "macos")]`, three responsibilities:

1. **`init(app, state)`**, called from `setup()` in `lib.rs`:
   - Return early (log at info) when not running from a `.app` bundle; see "Unbundled
     builds" below.
   - Create the delegate and call `setDelegate:` on `currentNotificationCenter`.
   - Keep the delegate alive for the process lifetime. The center holds it `weak`, so store the
     `Retained` in a `static OnceLock` (or leak it deliberately).
   - Call `requestAuthorizationWithOptions:(Alert | Sound)`. Log the result; a denial is not an
     error.
2. **The delegate class** (`define_class!`), with ivars `AppHandle` and `Arc<AppState>`:
   - `userNotificationCenter:didReceiveNotificationResponse:withCompletionHandler:`
     - Only act when `actionIdentifier == UNNotificationDefaultActionIdentifier` (a click on the
       body). Ignore `UNNotificationDismissActionIdentifier`.
     - Read `event_url` from `response.notification.request.content.userInfo`, then do what
       the click branch does today: `deep_links::enqueue_urls(...)` and `focus_main_window(...)`.
     - Always call the completion handler.
   - `userNotificationCenter:willPresentNotification:withCompletionHandler:`
     - Call the handler with `Banner | List | Sound`. Without this, UN suppresses banners
       while renCal is the frontmost app. `mac-notification-sys` showed them via
       `shouldPresentNotification:` → YES.
   - Don't assume which thread callbacks arrive on. `enqueue_urls` is thread-safe, and Tauri
     window methods dispatch to the main thread themselves.
3. **`post(reminder: &ReminderNotification)`**:
   - Build a `UNMutableNotificationContent`: `title`, `body`, `sound = defaultSound`,
     `userInfo = { "event_url": … }`.
   - Use `event_url` as the request identifier. A later reminder for the same event then
     replaces the earlier banner in Notification Center instead of stacking.
   - Set `trigger = nil` for immediate delivery. Call `addNotificationRequest:withCompletionHandler:`
     and log any error from the completion block.
   - Non-blocking and callable from the reminder tick directly, so no `std::thread::spawn`.

`MacOsNotifier::notify` becomes a call to `macos_notifications::post`. It no longer needs `app`
or `state`, because the delegate owns those.

### Notification icon

Drop the `content_image` (the 128×128 app icon). A bundled app's UN notifications already show
the app icon. UN attachments also _move_ the file into the system's attachment store, which
won't work with a resource inside the signed bundle. `icon_path` stays for Linux/Windows.

### Unbundled builds (`just dev` / `just debug`)

`currentNotificationCenter` raises an Objective-C exception (`bundleProxyForCurrentProcess is
nil`) when the binary is not inside a `.app`. Tauri embeds an Info.plist in dev binaries, so a
bundle-identifier check may not be enough. Instead, guard on
`NSBundle.mainBundle.bundlePath` ending in `.app`.

In dev, `init` logs "notifications require a bundled build" and `post` logs the reminder
title at info instead of showing it. This replaces the current `com.apple.Terminal`
impersonation hack in debug builds.

### Cold launch from a notification

When renCal is quit and the user clicks a reminder in Notification Center, macOS launches the
app and delivers `didReceiveNotificationResponse:` to the delegate. Apple requires the delegate
to be set before the app finishes launching. Tauri's `setup` runs inside
`applicationDidFinishLaunching:`, which should qualify, but verify it on the device (test 6). If the
response is lost, hook in earlier (e.g. set the delegate before `Builder::run`) or check
`launchUserNotificationUserInfoKey` in the launch notification.

The deep-link inbox already queues URLs until the frontend drains them, so a click that
arrives before the webview is ready is not lost.

### Permission prompt

UN requires `requestAuthorization`, so users see a one-time "renCal would like to send
notifications" prompt. The recommendation is to request at launch: a calendar asking on first
run is expected, and requesting lazily would let the first reminder race the prompt. Once the
user has answered, later calls return silently.

Check on the device whether users who already allowed notifications under
`NSUserNotificationCenter` (same bundle id `org.ren.rencal`) are prompted again.

### Minimum macOS version

`UNNotificationPresentationOptions::Banner` / `List` are macOS 11+. Either set
`bundle.macOS.minimumSystemVersion = "11.0"` in `tauri.conf.json`, or fall back to the
deprecated `Alert` option on 10.15. **Recommendation: set 11.0.** Big Sur is from 2020, and
anything older is outside what we can test.

## Changes by file

| File                                   | Change                                                                                     |
| -------------------------------------- | ------------------------------------------------------------------------------------------ |
| `src-tauri/Cargo.toml`                 | Add objc2 UN deps under `cfg(target_os = "macos")`; remove `mac-notification-sys`          |
| `src-tauri/src/macos_notifications.rs` | New: delegate, `init`, `post`, bundle guard                                                |
| `src-tauri/src/notifications.rs`       | `MacOsNotifier` → `post`; drop thread spawn, `set_application`, `wait_for_click`           |
| `src-tauri/src/lib.rs`                 | `mod macos_notifications`; call `init` in `setup()` before `spawn_reminder_loop_if_needed` |
| `src-tauri/tauri.conf.json`            | `bundle.macOS.minimumSystemVersion` (if we go with 11.0)                                   |
| `justfile`                             | Add `bundle-debug-macos`: `pnpm tauri build --debug --bundles app` then `open` the `.app`  |
| `docs/notifications.md`                | Update the macOS host and "Clicking a notification" sections                               |

## Testing on the Mac

### Baseline (before the change, on `main`)

1. Build and open the bundled app. Run `just test-notification` and don't click the banner.
2. Confirm the bug: Activity Monitor shows renCal at ~100% CPU after the reminder fires.
   `sample renCal 5` shows a thread in `-[NSRunLoop runUntilDate:]` under `sendNotification`.

### After the change

Build with `just bundle-debug-macos`. Use `just clear-notification-cache` between runs if a
reminder refuses to refire. Check `~/Library/Logs/org.ren.rencal/` for logs.

| #   | Scenario                                             | Expected                                                   |
| --- | ---------------------------------------------------- | ---------------------------------------------------------- |
| 1   | First launch                                         | Permission prompt appears once; allow it                   |
| 2   | Reminder fires while renCal is frontmost             | Banner is shown (the `willPresent` path)                   |
| 3   | Click banner, app in background                      | App focuses, event details open                            |
| 4   | Click banner, main window hidden (⌘W)                | Window reappears, event opens                              |
| 5   | Let banner time out, click it in Notification Center | Event opens                                                |
| 6   | Quit (⌘Q), click a reminder in Notification Center   | App launches, event opens (cold launch)                    |
| 7   | Recurring event reminder                             | The specific occurrence opens                              |
| 8   | Two reminders for the same event                     | Second replaces the first in Notification Center           |
| 9   | Ignore/dismiss 3+ reminders                          | CPU stays ~0%; thread count in Activity Monitor stays flat |
| 10  | Deny permission in System Settings → Notifications   | No crash; warning logged; nothing shown                    |
| 11  | `just dev` (unbundled)                               | No crash; "requires a bundled build" logged                |
| 12  | Notarized release build (`just notarize`)            | Same as 1–6, app name and icon correct                     |

## Out of scope

- Windows still uses `tauri-plugin-notification` (no click handling). It has no spin loop.
- Scheduling future reminders with `UNTimeIntervalNotificationTrigger` so they fire while renCal
  is quit. This is a natural follow-up once UN is in place, but it changes the reminder-core model
  (cancel and reschedule on event edits), so it gets its own plan.
