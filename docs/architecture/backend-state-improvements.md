# Backend state: improvements after S1

Follow-up to `backend-state-plan.md` (S1, the `use-app-state-architecture` branch). S1 gave the backend one
owned `AppState`, a Tauri-free core with `watch` channels, and a bridge. This plan finishes the
job on three fronts the S1 review found, so the pattern every future mutation and plugin copies
is the right one:

1. **Change notification is state-owned.** Today `caldir-changed` is emitted from four places
   and two handlers take an `AppHandle` only to emit it, while `rename_calendar` and
   `create_local_calendar` emit nothing.
2. **Config events carry the value.** The bridge forwards only `data_dir`; the other three
   caldir settings still propagate frontend-to-frontend, and a CLI `caldir config set` never
   reaches the UI.
3. **The event cache is precise and private.** `invalidate_all` on every `.ics` write, no
   in-flight dedup, and the cache type is public API on `AppState`.

Plus the merge hygiene for the S1 branch and a few small items. Everything here is backend-shaped
and lands before step 3 of the wiki's order of attack (typed events / typed errors), which will
then have one list of event names to generate from.

---

## 0. Before merging the S1 branch

- [ ] **Release the caldir-core change and drop the patch.** `src-tauri/Cargo.toml` has a
      `[patch."https://github.com/t4t5/caldir"]` pointing at `../../caldir/caldir-core`; CI cannot
      build it. Tag caldir (`load_from` / `reload_config` / `set_providers` are on caldir `main` as
      `cb388f9`), then `just bump-caldir <tag>` and delete the patch block. Consider shipping the
      atomic-write fix (§5.3) in the same tag.
- [ ] **Restore the package version.** `package.json` went from 0.7.1 to 0.7.0 on the branch;
      main is at 0.7.1. Rebase artifact.
- [ ] **Move the plan files out of the repo root.** `PLAN.md` and this file belong in the wiki (or
      `docs/architecture/` if you want them versioned with the code). They should not ship.
- [ ] **Tick step 2 in the wiki's "Order of attack"**, and fix the AGENTS.md drift nit
      (`helpers.rs` is described as the conversion helpers; conversion lives in `types.rs`).

---

## 1. Principles being locked in

These are the rules the rest of the plan implements. They go into AGENTS.md's Rust rules when
the work lands.

- **Every state change notifies through `AppState`; `state_bridge.rs` is the only emitter of
  state events.** A handler takes an `AppHandle` only for platform services (opener, dialog),
  never to tell the webview something changed.
- **Events carry the value when the backend owns the state.** Config, calendar dir, theme:
  the payload is the new value and every window converges from it. Events are bare signals only
  for bulk data that lives on disk (events, calendars) and is fetched by range.
- **Watchers classify; state decides.** A watcher turns filesystem paths into `AppState` calls.
  It holds no `AppHandle`.
- **The cache is an implementation detail.** Handlers call `state.invalidate_events(slug)`;
  they never see `EventCache`.
- **One declaration site for event names**, in Rust, next to the bridge. S6's generated manifest
  reads that list.

---

## 2. State-owned change notification

### 2.1 A `Signal` primitive

```rust
// src-tauri/src/signal.rs
//! A coalescing "something changed" notification. Many `notify()` calls before a
//! subscriber wakes collapse into one wakeup, which is what "go refetch" wants.

use tokio::sync::watch;

pub struct Signal(watch::Sender<u64>);

impl Signal {
    pub fn new() -> Self { Self(watch::channel(0).0) }
    pub fn notify(&self) { self.0.send_modify(|n| *n += 1); }
    pub fn subscribe(&self) -> watch::Receiver<u64> { self.0.subscribe() }
}
```

Why `watch<u64>` and not `broadcast`: a broadcast receiver can lag and error; a watch receiver
only ever sees "changed since you last looked", which is exactly the semantics of a refetch
trigger. It also matches `subscribe_caldir_config()` so subscribers use one idiom.

### 2.2 Two signals on `AppState`

```rust
pub struct AppState {
    // ...existing fields...
    /// The set of calendars or their metadata changed: create, delete, rename,
    /// recolour, connect a provider, a `calendar.toml` edited on disk, the data
    /// dir moved. Consumers refetch `list_calendars`.
    calendars_changed: Signal,
    /// Event data on disk changed by someone other than the caller (the caldir
    /// CLI, `caldir pull` from the bar widget, a sync). Consumers refetch their
    /// loaded range. In-app edits do not fire this: the caller has the RPC result.
    events_changed: Signal,
}

impl AppState {
    pub fn notify_calendars_changed(&self) { self.calendars_changed.notify() }
    pub fn subscribe_calendars_changed(&self) -> watch::Receiver<u64> { ... }
    pub fn subscribe_events_changed(&self) -> watch::Receiver<u64> { ... }
    /// Only the caldir watcher calls this (§2.3); in-app edits never do.
    pub(crate) fn notify_events_changed(&self) { self.events_changed.notify() }
}
```

`publish()` gains one line: when `data_dir` moved, `self.calendars_changed.notify()` after
`invalidate_all_events()`. The whole calendar set changed, so that is a calendars change.

Who calls what:

| Site                                                             | Today                               | After                                                                                                        |
| ---------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `set_calendar_color`                                             | `app.emit(CALDIR_CHANGED)`          | `state.notify_calendars_changed()`; drop the `AppHandle` parameter from the trait                            |
| `delete_calendar`                                                | invalidate + `app.emit`             | `state.invalidate_events(slug)` + `notify_calendars_changed()`; drop `AppHandle`                             |
| `rename_calendar`                                                | nothing                             | `notify_calendars_changed()`                                                                                 |
| `create_local_calendar`                                          | nothing                             | `notify_calendars_changed()`                                                                                 |
| `helpers::save_connected_calendars`                              | `app.emit`                          | `notify_calendars_changed()`; drop its `app` parameter (`connect_provider*` keep `AppHandle` for the opener) |
| `AppState::publish` on data-dir move                             | bridge emits `calendar-dir-changed` | also `calendars_changed.notify()`                                                                            |
| caldir watcher, `.ics` change                                    | `invalidate_all` + `app.emit`       | per-slug invalidate + `events_changed.notify()` (§2.3)                                                       |
| caldir watcher, `calendar.toml` change                           | ignored                             | `notify_calendars_changed()`                                                                                 |
| `create/update/delete_event`, `rsvp`, `split`, `sync`, `discard` | invalidate                          | unchanged: invalidate only                                                                                   |

**Known bounded cost.** A handler that writes `calendar.toml` notifies immediately; the watcher
sees the same write ~150 ms later and notifies again. That is two `list_calendars` per rename
until S2 adds own-write suppression. `list_calendars` reads one small TOML per calendar and
parses no events, so this is acceptable for now. The hook S2 will use: `AppState::expect_write(path)`
recording recently written paths that the watcher's classifier skips.

Why handlers notify at all instead of leaving `calendar.toml` to the watcher: the watcher can be
absent (data dir missing, `notify` failed to initialise) and it adds latency. The handler path is
the guaranteed one; the watcher exists for writes the app did not make.

### 2.3 The watcher classifies paths

`fs_watch` currently yields `()`. Make it yield the paths of the coalesced burst so the caldir
watcher can be precise; the other watchers ignore the value.

```rust
// src-tauri/src/fs_watch.rs
pub struct FsWatch {
    _watcher: RecommendedWatcher,
    rx: mpsc::UnboundedReceiver<Vec<PathBuf>>,
    /// Paths received whose coalesce window was cut short; delivered next call.
    pending: Vec<PathBuf>,
}

impl FsWatch {
    /// Resolves with the deduplicated paths of one burst; `None` once the
    /// underlying watcher is gone. Cancel-safe.
    pub async fn changed(&mut self) -> Option<Vec<PathBuf>>;
}
```

The `notify` callback sends `event.paths` when the filter accepts the event. `changed()` drains
into a `BTreeSet<PathBuf>` during the window and returns it as a `Vec`.

```rust
// src-tauri/src/watchers/caldir.rs
/// What one burst of filesystem events means for the state.
#[derive(Default, Debug, PartialEq)]
struct Changes {
    /// Calendars whose `.ics` files changed.
    slugs: BTreeSet<String>,
    /// A `calendar.toml` was created, edited or removed.
    calendars: bool,
    /// A path we could not attribute to a calendar (outside `data_dir`, or a
    /// removed directory); fall back to invalidating everything.
    unattributed: bool,
}

/// The slug is the first path component under `data_dir`.
fn classify(data_dir: &Path, paths: &[PathBuf]) -> Changes;

fn is_relevant(event: &notify::Event) -> bool {
    is_content_change(event)
        && event.paths.iter().any(|p| is_ics_event_file(p) || is_calendar_toml(p))
}
```

The loop body becomes:

```rust
let changes = classify(&data_dir, &paths);
if changes.unattributed {
    state.invalidate_all_events();
} else {
    for slug in &changes.slugs { state.invalidate_events(slug); }
}
if changes.unattributed || !changes.slugs.is_empty() {
    state.notify_events_changed();
}
if changes.calendars {
    state.notify_calendars_changed();
}
```

`run_watcher(state: Arc<AppState>)` no longer takes an `AppHandle`. `watchers::spawn_all` still
passes the handle to the three watchers that emit their own non-state events (omarchy, external
themes, timezone, rencal config); those stay as they are until S4/S6 fold them in.

Tests (`watchers/caldir.rs`): `classify` maps `<dir>/work/a.ics` to `slugs = {work}`;
`<dir>/work/calendar.toml` to `calendars = true`; a path outside the dir to `unattributed`;
a mixed burst sets all three correctly. `fs_watch` tests are updated for the new return type
and gain one asserting that two writes inside the window arrive as one deduplicated batch.

### 2.4 The bridge forwards three signals

```rust
// src-tauri/src/state_bridge.rs
//! The one task that turns `AppState` notifications into webview events.
//! Every event name the backend emits for state changes is declared here.

/// Payload: `CaldirSettings` (§3). Fired on every caldir config change.
pub const CALDIR_CONFIG_CHANGED: &str = "caldir-config-changed";
/// No payload. The set of calendars or their metadata changed.
pub const CALENDARS_CHANGED: &str = "calendars-changed";
/// No payload. Event data on disk changed by someone other than the caller.
pub const EVENTS_CHANGED: &str = "events-changed";

pub async fn run(app: AppHandle, state: Arc<AppState>) {
    let mut config = state.subscribe_caldir_config();
    let mut calendars = state.subscribe_calendars_changed();
    let mut events = state.subscribe_events_changed();
    // Mark all three as seen so startup emits nothing.
    config.borrow_and_update(); calendars.borrow_and_update(); events.borrow_and_update();

    loop {
        tokio::select! {
            changed = config.changed() => {
                if changed.is_err() { return; }
                let settings = CaldirSettings::from(&*config.borrow_and_update());
                let _ = app.emit(CALDIR_CONFIG_CHANGED, settings);
            }
            changed = calendars.changed() => {
                if changed.is_err() { return; }
                calendars.borrow_and_update();
                let _ = app.emit(CALENDARS_CHANGED, ());
            }
            changed = events.changed() => {
                if changed.is_err() { return; }
                events.borrow_and_update();
                let _ = app.emit(EVENTS_CHANGED, ());
            }
        }
    }
}
```

`calendar-dir-changed` is retired: the path now arrives inside `caldir-config-changed`, and the
calendar-list reload arrives as `calendars-changed`. `caldir-changed` is renamed to
`events-changed` so the three names read as one family; it has two frontend consumers today, so
the rename is cheap now and expensive after S6 generates a manifest from it.

### 2.5 Frontend: listeners move to the right context

`src/rpc/events.ts`: add `CALDIR_CONFIG_CHANGED`, `CALENDARS_CHANGED`, `EVENTS_CHANGED`; remove
`CALENDAR_DIR_CHANGED`, `CALDIR_CHANGED`, `TIME_FORMAT_CHANGED`, `DEFAULT_REMINDERS_CHANGED`,
`DEFAULT_CALENDAR_CHANGED`. Each remaining constant's comment names the emitter and the payload.

- **`CalendarStateContext`** listens to `CALENDARS_CHANGED` only (today: `CALDIR_CHANGED` and
  `CALENDAR_DIR_CHANGED`).
- **`CalEventsContext`** listens to `EVENTS_CHANGED` and calls `reloadEvents()`. This is the
  first half of S2 ("CalEvents subscribes directly") and it is required here: once
  `CalendarStateContext` stops reloading on event changes, the array-identity path that used to
  reload events goes away. With the direct subscription in place, drop `calendars` from the
  reload effect's dependency list and key it on `visibleCalendarKey` alone. A rename or recolour
  then reloads the calendar list and nothing else.
- **`useContacts`** switches its constant to `EVENTS_CHANGED`; behaviour unchanged.
- **`SettingsContext`** is covered in §3.

Before and after, for one in-app event edit with auto-sync on:

| Step                      | Today                                                                                                                   | After                                               |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `update_event` returns    | optimistic row already applied                                                                                          | same                                                |
| `requestSync`             | preview, sync, `reloadEvents`                                                                                           | same                                                |
| sync writes `.ics`        | watcher: `invalidate_all`, `caldir-changed`                                                                             | watcher: invalidate touched slugs, `events-changed` |
| `caldir-changed` handling | `list_calendars`, new array identity, second `reloadEvents`, second `sync_preview` (because `runSync` identity changed) | `reloadEvents` once                                 |

The remaining duplicate (`reloadEvents` from `requestSync` plus one from the watcher echo) is
S2's own-write suppression.

### 2.6 Tests

- `state.rs`: `notify_calendars_changed` wakes a subscriber; saving a config with a new
  `data_dir` wakes the calendars subscriber; saving an unrelated setting does not.
- `watchers/caldir.rs`: `classify` cases above.
- Manual acceptance (both windows open, `just debug`):
  - rename a calendar in Settings: main window updates; log shows one or two `list_calendars`,
    no `list_events`;
  - `caldir` CLI renames a calendar: both windows update without focus;
  - touch an `.ics` in one calendar: `list_events` runs, `list_calendars` does not; only that
    slug was invalidated (add a `log::debug!` in `invalidate_events` while verifying);
  - hand-edit `calendar_dir` in caldir's `config.toml`: both windows switch, calendar list and
    events reload;
  - delete a calendar from Settings: it disappears from the main window's group.

---

## 3. Config events carry the value

### 3.1 One RPC type for caldir settings

```rust
// src-tauri/src/routes/caldir/types.rs
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, Type)]
pub struct CaldirSettings {
    pub time_format: TimeFormat,
    pub default_reminders: Vec<i32>,
    pub default_calendar: Option<String>,
    /// Tildified for display.
    pub calendar_dir: String,
}

impl From<&CaldirConfig> for CaldirSettings { /* the four bodies from get_config.rs */ }
```

### 3.2 One getter

Add `get_caldir_settings() -> TauResult<CaldirSettings>` to `CaldirApi` and delete
`get_time_format`, `get_default_reminders`, `get_default_calendar`, `get_calendar_dir`. Their only
caller is `SettingsContext.reloadSettings`. The four setters stay; S4 replaces them with
`set_config(patch)` across both config files. `just gen-types` afterwards; this is the one step in
the plan that changes `bindings.ts`.

### 3.3 The bridge emits the full settings on every change

Already sketched in §2.4: `CALDIR_CONFIG_CHANGED` carries `CaldirSettings::from(&config)` for any
field change, not only `data_dir`. `send_if_modified` in `publish()` guarantees it fires once per
real change and never for our own echo.

### 3.4 Frontend: one listener, no frontend-to-frontend emits

`SettingsContext`:

- `reloadSettings` calls `get_caldir_settings()` in place of the four getters and sets the four
  states from it.
- One `listen<CaldirSettings>(CALDIR_CONFIG_CHANGED)` sets the same four states. The three
  per-field listeners and the `calendar-dir-changed` listener go.
- `setTimeFormat`, `setDefaultReminders`, `setDefaultCalendar` keep their optimistic local set,
  call the RPC, and no longer `emit`. The bridge's event confirms the value in both windows.

Result: a `caldir config set time_format 12h` from the terminal updates the running app, three
frontend-to-frontend events are gone, and the settings window and main window converge from one
payload. `RENCAL_CONFIG_CHANGED` and its five frontend emits are untouched; S4 gives
`RencalConfig` the same treatment.

### 3.5 Hook for S4

When `RencalConfig` moves into `AppState`, it will want exactly this shape: `RwLock<T>`, a
`watch::Sender<T>`, a config path, `save`, `reload`, and `publish` with equality. That is the
moment to extract a `ConfigSlot<T>` and make `caldir` the first instance of it. Not before: two
instances is the minimum to see what the generic really needs (the C2 "file is broken, refuse
writes" semantics may differ between the two).

---

## 4. Event cache

### 4.1 Hide it behind `AppState`

```rust
impl AppState {
    pub fn invalidate_events(&self, slug: &str) { self.events.invalidate(slug) }
    pub fn invalidate_all_events(&self) { self.events.invalidate_all() }
}
```

`events: EventCache` becomes private. Sixteen call sites move from `state.events.invalidate(..)`
to `state.invalidate_events(..)`: `create_event`, `update_event` (×4), `delete_event`,
`delete_recurring_series`, `split_recurring_series_at`, `rsvp`, `sync` (×2), `discard`,
`delete_calendar`, `helpers::pull_created_calendar_events`, the watcher, and one test. Mechanical;
lands with §4.3 or on its own.

### 4.2 Per-slug invalidation

Delivered by §2.3. The watcher had the paths all along; the cost of mapping them to slugs is one
`strip_prefix` per path.

### 4.3 Single-flight parses and per-slug generations

After any invalidation the frontend fans out: the events context, the contacts hook, and
anything keyed on the calendars array (the invites badge) refetch at once, in both windows, and
each of those handlers calls `state.events(slug)`. Today each concurrent
miss on the same slug parses it again, and the global generation counter also discards an
unrelated slug's in-flight parse.

```rust
// src-tauri/src/event_cache.rs
struct Slot {
    /// Held while one caller parses; concurrent misses wait here and then hit.
    parsing: Mutex<()>,
    /// Bumped by every invalidation of this slug so a parse that raced one is
    /// served but not cached.
    generation: AtomicU64,
    events: RwLock<Option<Arc<Vec<Event>>>>,
}

#[derive(Default)]
pub struct EventCache {
    slots: RwLock<HashMap<String, Arc<Slot>>>,
}

impl EventCache {
    pub fn get_or_parse<E>(&self, slug: &str, parse: impl FnOnce() -> Result<Vec<Event>, E>)
        -> Result<Arc<Vec<Event>>, E>
    {
        let slot = self.slot(slug);                     // create on demand
        if let Some(hit) = slot.events.read().clone() { return Ok(hit); }

        let _parsing = slot.parsing.lock();             // second miss waits here...
        if let Some(hit) = slot.events.read().clone() { return Ok(hit); }   // ...then hits

        let generation = slot.generation.load(Ordering::Acquire);
        let parsed = Arc::new(parse()?);
        if slot.generation.load(Ordering::Acquire) != generation {
            return Ok(parsed);                          // invalidated meanwhile: serve, don't cache
        }
        *slot.events.write() = Some(parsed.clone());
        Ok(parsed)
    }

    pub fn invalidate(&self, slug: &str)  { /* bump generation, clear events, keep the slot */ }
    pub fn invalidate_all(&self)          { /* same for every slot */ }
}
```

Waiting on `parsing` blocks a tokio worker for as long as the parse takes, which is the same
cost the waiter would have paid parsing it itself; `spawn_blocking` stays out of scope until a
profile asks for it.

Tests (`event_cache.rs`, replacing the current three):

- concurrent misses parse once: two threads behind a `Barrier`, a parse closure that sleeps 50 ms
  and bumps an `AtomicUsize`; assert the count is 1 and both results are `Arc::ptr_eq`;
- invalidating `work` while `home` is parsing keeps `home`'s result cached;
- the existing "raced an invalidation is served but not cached" and "errors are not cached"
  cases, rewritten per slot.

---

## 5. Smaller items

### 5.1 Startup failure gets a dialog

`AppState::load` failing (a malformed `~/.config/caldir/config.toml`) currently prints to stderr
and exits, which a user launching from a menu never sees. `tauri_plugin_dialog` is already a
dependency:

```rust
let state = match AppState::load(..) {
    Ok(state) => Arc::new(state),
    Err(err) => return run_fatal_dialog(context, format!("renCal cannot read caldir's config.toml:\n{err}")),
};

fn run_fatal_dialog(context: tauri::Context, message: String) {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(move |app| {
            app.dialog().message(&message).title("renCal").blocking_show();
            app.exit(1);
            Ok(())
        })
        .run(context)
        .expect("error while showing startup error");
}
```

The windows declared in `tauri.conf.json` are still created by `run`, so the dialog appears over
an empty main window; acceptable for a fatal path, or hide it in `setup` first.

### 5.2 The caldir watcher reopens instead of idling

When `changed()` returns `None` the caldir watcher currently idles until the data dir moves. Sleep
five seconds and call `open_watch` again; log at `warn` on each failure. The other watchers can
keep returning; they are not load-bearing.

### 5.3 Upstream: atomic config writes in caldir-core

`CaldirConfig::save` (`caldir-core/src/caldir/config.rs`) and `CalendarConfig::write`
(`caldir-core/src/calendar/config.rs`) use `std::fs::write`. A watcher that fires mid-write reads a
truncated file, logs "malformed, keeping the previous config", and then reloads correctly on the
next event. Harmless but noisy, and every other caldir consumer with a watcher hits it too. Write
to `<path>.tmp` and `rename`. Ship it in the tag from §0.

---

## 6. Order of work

Each PR compiles, passes `just check` and `just test`, and is independently revertable.

| PR  | Scope                                                                                       | Bindings change |
| --- | ------------------------------------------------------------------------------------------- | --------------- |
| A   | §0 hygiene, caldir tag + bump                                                               | no              |
| B   | §4.1 hide the cache, §4.3 single-flight                                                     | no              |
| C   | §2: `Signal`, two signals, `fs_watch` paths, watcher classifier, bridge, frontend listeners | no              |
| D   | §3: `CaldirSettings`, one getter, bridge payload, `SettingsContext`                         | yes             |
| E   | §5 small items                                                                              | no              |

B and C are independent. D depends on C's bridge loop. A first, because C and D are easier to
review against a green CI.

---

## 7. Verification

- `just check` and `just test` green after every PR; `git diff src/rpc/bindings.ts` is empty
  except in D.
- `grep -rn 'app.emit(' src-tauri/src/routes` matches nothing.
- `grep -rn 'AppHandle' src-tauri/src/routes/caldir` matches only `connect_provider.rs`,
  `connect_provider_with_credentials.rs`, and the trait declarations for those two.
- `grep -rn 'state.events\.' src-tauri/src` matches nothing outside `state.rs`.
- `grep -rn "emit(" src --include='*.tsx' --include='*.ts'` in the frontend matches only the
  five `RENCAL_CONFIG_CHANGED` emits in `SettingsContext` and the `THEME_CHANGED` emit in
  `useTheme` (S4 removes both).
- Manual: the acceptance list in §2.6, plus `caldir config set time_format 12h` from a terminal
  updates the running app's clock format in both windows.

---

## 8. Out of scope, and the hooks left for it

- **S2 own-write suppression and the CalEvents mutation API.** Hook: `AppState::expect_write(path)`
  feeding the watcher's classifier. The direct `EVENTS_CHANGED` subscription lands here (§2.5)
  because the signal split needs it; the rest of S2 is unchanged.
- **S4 `RencalConfig` into `AppState`.** Hook: §3.5's `ConfigSlot<T>`; `RENCAL_CONFIG_CHANGED`
  becomes a value-carrying bridge event the same way.
- **S6 generated event manifest.** Hook: every state event name now lives in `state_bridge.rs`.
  The non-state events (omarchy, external themes, timezone, deep links, menu) stay where they are
  until that step collects them.
- **`spawn_blocking` for cache-miss parses.** Revisit with a profile on a large calendar.
- **The in-process reminder loop sharing the cache.** On macOS and Windows `reminder-core` still
  runs `Caldir::load()` and reparses everything each tick. Giving it an event source closure
  backed by `state.events(slug)` would make it the first non-RPC consumer of `AppState` and a
  good test of the abstraction. Linux uses the daemon, so this is M8 territory.
