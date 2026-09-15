# Backend `AppState` (S1)

Plan for step 2 of the architecture todos: give the Rust backend one owned, injected
application state instead of per-request `Caldir::load()` and process statics. Scope as
listed in the wiki's "Order of attack": **S1** (managed state), the **S6** half about the
caldir watcher re-pointing itself, **M7** (watcher helper, silent task death) and **M9**
(cache lock held across parse). Everything else (typed events, typed errors, settings
unification, CalEvents invalidation) stays in later steps but is shaped for here.

---

## 1. What exists today

- `load_caldir()` (`src-tauri/src/routes/caldir/helpers.rs:11-18`) is called at 35 sites.
  Each call runs `Caldir::load()`: read `~/.config/caldir/config.toml`, then
  `ProviderRegistry::from_system_path()`, which `read_dir`s every `$PATH` entry looking for
  `caldir-provider-*` binaries, then overlays the bundled dir. Synchronously, inside every
  `async fn` handler, on tokio workers.
- The state that _does_ persist is three process statics:
  - `EVENT_CACHE` (`src-tauri/src/event_cache.rs:18`)
  - `BUNDLED_PROVIDERS_DIR` (`src-tauri/src/lib.rs:34`)
  - `EVENT_LINK_INBOX` (`src-tauri/src/deep_links.rs:16`)
- Nothing uses `tauri::State` or fields on the taurpc impl structs; every `*ApiImpl` is a
  unit struct.
- The caldir watcher (`src-tauri/src/caldir_watcher.rs`) re-points to a new data dir only
  when the **webview** emits `calendar-dir-changed` (`src/contexts/SettingsContext.tsx:143`).
  `set_calendar_dir` itself (`src-tauri/src/routes/caldir/set_config.rs:46-56`) only
  invalidates the cache. Hand-editing caldir's `config.toml` is not noticed at all.
- Five watchers (`caldir_watcher`, `config_watcher`, `tz_watcher`, `omarchy`,
  `external_themes`) share the same ~30-line skeleton: channel → `notify` callback →
  filter → 150 ms coalesce → emit. All six `tokio::spawn`s drop their `JoinHandle`, so a
  panicked task dies silently.
- `EventCache::events` holds the map's write lock while parsing one slug's `.ics` files.

What is worth keeping: caldir-core's own model. `Caldir` is `Send + Sync`, owns only
`CaldirConfig + config_path + ProviderRegistry`, and its **only** runtime mutation is
`save_config(&mut self)`. Calendars and events are re-read from disk on every call — the
disk is the truth, `Caldir` is a handle. That makes it cheap to hold and simple to share.

---

## 2. Design

### 2.1 One `AppState`, built before the Tauri builder, shared as `Arc`

```rust
// src-tauri/src/state.rs
//! Process-wide backend state. Created once in `run()`, shared as `Arc<AppState>` with
//! every RPC surface and background task. Nothing else in the backend holds statics.

pub struct AppState {
    caldir: RwLock<Caldir>,                 // parking_lot; see 2.2
    caldir_config: watch::Sender<CaldirConfig>,
    caldir_config_path: PathBuf,
    bundled_providers: Option<PathBuf>,
    pub events: EventCache,                 // today's cache, minus the static
    pub deep_links: DeepLinkInbox,          // today's inbox, minus the static
}

impl AppState {
    pub fn load(bundled_providers: Option<PathBuf>) -> Result<Self, CaldirError>;
    /// Tests and `gen_types`: explicit config path instead of the system one.
    pub fn load_from(config_path: PathBuf, bundled_providers: Option<PathBuf>) -> Result<Self, CaldirError>;

    /// Shared access to the caldir handle. The guard is `!Send`, so it cannot be held
    /// across an `.await`: clone what you need (a `Provider`, `connections()`, the
    /// config) and let it drop before talking to a provider.
    pub fn caldir(&self) -> RwLockReadGuard<'_, Caldir>;

    /// Parsed events for `slug`, served from the cache. Parses outside the lock.
    pub fn events(&self, slug: &str) -> Result<Arc<Vec<Event>>, CaldirError>;

    /// Persist and adopt a new caldir config (time format, default calendar,
    /// reminders, data dir). Invalidates the cache and notifies subscribers when the
    /// data dir moved.
    pub fn save_caldir_config(&self, config: CaldirConfig) -> Result<(), CaldirError>;

    /// Re-read caldir's config.toml and rescan `$PATH` for providers. On failure the
    /// previous state stays in place.
    pub fn reload_caldir(&self) -> Result<(), CaldirError>;

    /// Latest caldir config; wakes on every change. Backend tasks subscribe to this
    /// instead of listening to webview events.
    pub fn subscribe_caldir_config(&self) -> watch::Receiver<CaldirConfig>;
    pub fn caldir_config_path(&self) -> &Path;
}
```

Core of the implementation — the two mutation paths share one publish step so ordering is
guaranteed (cache invalidated _before_ anyone is told the dir moved, both while the write
lock is held):

```rust
pub fn save_caldir_config(&self, config: CaldirConfig) -> Result<(), CaldirError> {
    let mut caldir = self.caldir.write();
    caldir.save_config(config)?;
    self.publish(&caldir);
    Ok(())
}

pub fn reload_caldir(&self) -> Result<(), CaldirError> {
    let fresh = open_caldir(&self.caldir_config_path, self.bundled_providers.as_deref())?; // PATH scan outside the lock
    let mut caldir = self.caldir.write();
    *caldir = fresh;
    self.publish(&caldir);
    Ok(())
}

fn publish(&self, caldir: &Caldir) {
    self.caldir_config.send_if_modified(|current| {
        if current == caldir.config() {
            return false;
        }
        if current.data_dir() != caldir.data_dir() {
            self.events.invalidate_all();
        }
        *current = caldir.config().clone();
        true
    });
}
```

`CaldirConfig: Clone + PartialEq`, so `send_if_modified` gives us "no spurious wakeups"
for free — our own `save_config` echoing back through the file watcher is a no-op.

**Ownership rule:** `AppState` is Tauri-free. It never holds an `AppHandle` and never
emits webview events. It exposes change notifications as tokio `watch` channels; thin
tasks translate those into Tauri events (2.4). This keeps it constructible and testable
without an app, and gives plugins something they can hold in plain Rust.

### 2.2 Lock choice: `parking_lot::RwLock<Caldir>`, never held across `.await`

Considered:

| Option                            | Verdict                                                                                                                                                                                                                                                         |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tokio::sync::RwLock<Caldir>`     | Guards are `Send`, so a 30 s provider sync would hold a read guard and block `set_time_format` (write) and every reader queued behind it. No.                                                                                                                   |
| `RwLock<Arc<Caldir>>` snapshots   | Nice semantics, but `save_config` needs `&mut`, and `Caldir` has no public constructor to rebuild from parts → every config write becomes a full `Caldir::load()`. Not worth it.                                                                                |
| **`parking_lot::RwLock<Caldir>`** | Guard is `!Send`; taurpc boxes every resolver as `dyn Future + Send`, so holding a guard across `.await` is a **compile error**. Mutation in place. No poisoning (M9's "poisoned lock kills every later handler" goes away). Already in the dep tree via Tauri. |

Handlers therefore follow one pattern: take what you need under a short guard, drop it,
then await.

```rust
// sync.rs — before
let caldir = load_caldir()?;
for connection in caldir.connections() { /* diff().await … */ }

// after
let connections = state.caldir().connections();     // Vec<Result<Connection>> is owned; guard drops here
for connection in connections { /* diff().await … */ state.events.invalidate(&slug); }
```

```rust
// connect_provider.rs — after
let provider = state.caldir().provider(&slug).map_err(|e| e.to_string())?.clone(); // Provider: Clone (Arc inside)
run_with_data(app, &provider, …).await
```

Only seven handlers await at all (`sync`, `sync_preview`, `discard`, `connect_provider`,
`connect_provider_with_credentials`, `check_provider_connection`,
`get_provider_connect_info`, plus `save_connected_calendars` in helpers). Every other
handler becomes a plain `fn handler(state: &AppState, …)`; the trait impl wraps it. That
makes "this handler is blocking disk I/O" explicit and lets tests call it without a
runtime.

### 2.3 Event cache without a static, and without parsing under the lock

```rust
// src-tauri/src/event_cache.rs
#[derive(Default)]
pub struct EventCache {
    inner: RwLock<HashMap<String, Arc<Vec<Event>>>>,
    generation: AtomicU64,   // bumped by every invalidate*
}

impl EventCache {
    pub fn get_or_parse<E>(&self, slug: &str, parse: impl FnOnce() -> Result<Vec<Event>, E>)
        -> Result<Arc<Vec<Event>>, E>
    {
        if let Some(hit) = self.inner.read().get(slug).cloned() {
            return Ok(hit);
        }
        let generation = self.generation.load(Ordering::Acquire);
        let parsed = Arc::new(parse()?);                       // no lock held here (M9)
        let mut map = self.inner.write();
        if self.generation.load(Ordering::Acquire) != generation {
            return Ok(parsed);   // invalidated while we parsed: serve it, don't cache it
        }
        Ok(map.entry(slug.to_owned()).or_insert(parsed).clone())
    }
    pub fn invalidate(&self, slug: &str);      // bump + remove
    pub fn invalidate_all(&self);              // bump + clear
}
```

The generation check is what lets us drop the lock safely: today the write lock held
across the parse is what prevents a watcher `invalidate_all()` from landing _between_
"parse stale files" and "insert". Without it a narrow race would cache stale events until
the next change. `AppState::events(slug)` is the only caller; it supplies the parse closure
from `self.caldir().calendar(slug)?.events()?`.

### 2.4 Change propagation: disk → watcher → `AppState` → bridge → webview

Two directions, one funnel:

```
hand-edit / caldir CLI ──► caldir_config watcher ──► state.reload_caldir() ─┐
                                                                             ├─► watch<CaldirConfig> ─► state_bridge ─► "calendar-dir-changed" (both windows)
Settings UI ──► rpc set_calendar_dir ──► state.save_caldir_config() ────────┘                      └─► caldir watcher re-points itself
```

- **`watchers/caldir_config.rs`** (new): watches `state.caldir_config_path()`'s directory
  for `config.toml`, calls `state.reload_caldir()`. A parse failure logs a warning and
  keeps the last good state. Closes the S4 gap "caldir's config file is unwatched" at the
  state level; per-setting frontend propagation stays in S4.
- **`watchers/caldir.rs`** (today's `caldir_watcher.rs`): subscribes to
  `state.subscribe_caldir_config()`. Its loop is `select!` over "an `.ics` changed"
  (invalidate + emit `caldir-changed`, unchanged) and "config changed with a different
  `data_dir()`" (drop the watcher, re-point). The `app.listen(CALENDAR_DIR_CHANGED)` and
  the private duplicate constant go away. The watcher no longer calls `Caldir::load()`.
- **`state_bridge.rs`** (new, ~25 lines): the one task that turns `AppState`
  notifications into webview events. In S1 it forwards `data_dir` changes as
  `calendar-dir-changed` with the tildified path as payload — exactly what
  `SettingsContext` and `CalendarStateContext` already listen for, in both windows. In
  S4 it grows into the `setting-changed { key, value }` emitter.
- **Frontend**: `SettingsContext.setCalendarDir` becomes
  `await rpc.caldir.set_calendar_dir(path)`; the `emit(CALENDAR_DIR_CHANGED, …)` and the
  follow-up `get_calendar_dir` read are deleted (the existing listener at
  `SettingsContext.tsx:102` already updates the state). No binding changes.

Optional in the same spirit: `save_connected_calendars` already runs inside handlers that
receive an `AppHandle`; emitting `caldir-changed` there lets `useConnectProvider.ts:25,42`
drop its two `emit(CALDIR_CHANGED)` calls.

### 2.5 Deep-link inbox

`deep_links.rs` keeps its parser and tests; the static becomes
`#[derive(Default)] pub struct DeepLinkInbox { queue: Mutex<VecDeque<EventDeepLink>> }`
with `enqueue(&self, urls: &[String]) -> usize` and `take(&self) -> Vec<EventDeepLink>`.
`enqueue_urls(app, &state.deep_links, urls)` stays the emitting wrapper. Callers (deep-link
plugin callback, Linux single-instance listener, macOS notifier click) all live in `run()`
/ `setup` where the `Arc<AppState>` is in scope, so they capture a clone. The test-only
`TEST_LOCK` serialisation disappears because each test owns its inbox.

### 2.6 Watcher helper and task supervisor (M7)

```rust
// src-tauri/src/fs_watch.rs
/// Watches `paths` and yields once per coalesced burst of events accepted by `filter`.
pub fn watch_debounced(
    paths: &[PathBuf],
    mode: RecursiveMode,
    filter: impl Fn(&notify::Event) -> bool + Send + 'static,
) -> notify::Result<FsWatch>;

pub struct FsWatch { _watcher: RecommendedWatcher, rx: mpsc::UnboundedReceiver<()> }
impl FsWatch {
    /// Resolves after the 150 ms coalesce window; `None` once the watcher is gone.
    pub async fn changed(&mut self) -> Option<()>;
}
```

Each of the five watchers collapses to its filter function (already unit-tested) plus a
`while watch.changed().await.is_some() { … }` loop. The caldir watcher additionally
`select!`s on the config receiver.

```rust
// src-tauri/src/tasks.rs
/// `tokio::spawn` that logs instead of vanishing when the task panics.
pub fn spawn_task(name: &'static str, task: impl Future<Output = ()> + Send + 'static) {
    tokio::spawn(async move {
        if let Err(err) = tokio::spawn(task).await {
            log::error!("{name} task died: {err}");
        }
    });
}
```

`watchers/mod.rs::spawn_all(app: &AppHandle, state: &Arc<AppState>)` replaces the five
spawn lines in `setup`.

### 2.7 Wiring in `lib.rs`

```rust
pub fn create_router(state: Arc<AppState>) -> Router<tauri::Wry> {
    Router::new()
        .merge(CaldirApiImpl::new(state.clone()).into_handler())
        .merge(PlatformApiImpl::new(state.clone()).into_handler())   // deep-link inbox
        .merge(OmarchyApiImpl.into_handler())                         // stateless stay unit structs
        .merge(ConfigApiImpl.into_handler())
        .merge(ThemesApiImpl.into_handler())
}

pub async fn run() {
    // … GTK / nvidia / single-instance as today …
    let context = tauri::generate_context!();                    // hoisted from .build()
    let bundled = bundled_providers_dir(&context);               // dev: CARGO_MANIFEST_DIR/providers
    let state = Arc::new(match AppState::load(bundled) {         // release: tauri::utils::platform::resource_dir(context.package_info(), &Env::default())
        Ok(state) => state,
        Err(err) => { eprintln!("rencal: cannot read caldir config: {err}"); std::process::exit(1) }
    });
    let router = create_router(state.clone());

    tauri::Builder::default()
        // … plugins …
        .setup({ let state = state.clone(); move |app| {
            deep_links::enqueue_urls(app.handle(), &state.deep_links, &initial_urls);
            spawn_task("state-bridge", state_bridge::run(app.handle().clone(), state.clone()));
            watchers::spawn_all(app.handle(), &state);
            spawn_reminder_loop_if_needed(app);                  // unchanged; reminder-core stays Tauri-free
            Ok(())
        }})
        .invoke_handler(router.into_handler())
        .build(context)
```

Why build the state before the builder rather than in `setup` + `app.manage()`: taurpc's
documented state mechanism is fields on the impl struct, the trait signatures stay exactly
as they are (no `app_handle: AppHandle<R>` on all 30 procedures), and handlers are
callable from tests with nothing but an `AppState`. `PathResolver::resource_dir()` is a
one-line wrapper around `tauri::utils::platform::resource_dir(package_info, env)`, so the
bundled providers dir is resolvable pre-builder. The `chmod +x` pass on bundled binaries
moves next to it. `tauri::State`/`app.manage` are not used; there is exactly one way to
reach the state.

`examples/gen_types.rs` becomes `create_router(Arc::new(AppState::load_from(tempdir_config, None)?))`,
so type generation no longer reads the developer's real caldir config.

### 2.8 Startup and reload failure policy

- `Caldir::load()` fails only when `~/.config/caldir/config.toml` exists and is
  unreadable or malformed (a missing file yields defaults; the provider scan is
  infallible). At **startup** that is fatal with a clear stderr/log line — today the app
  "starts" but every RPC errors, which is not better. A native error dialog can be added
  later; it needs an `AppHandle`.
- At **reload** (watcher or `list_providers`), failure logs a warning and keeps the last
  good `Caldir`. This is strictly better than today, where a half-written file breaks the
  next request.

### 2.9 `list_providers` is the one deliberate rescan

Today every request rescans `$PATH`, so a freshly installed `caldir-provider-proton` shows
up the moment Settings › Accounts opens. To keep that, `list_providers` calls
`state.reload_caldir()` before listing. It is the only handler that does, and it is
documented as such. Everything else reads the cached registry.

### 2.10 Errors stay typed inside the state

`AppState`, `EventCache` and `DeepLinkInbox` return `CaldirError` (or nothing), never
`String`. Handlers keep `map_err(|e| e.to_string())` at the boundary exactly where it is
today, so S5's `RpcError { kind, message }` with `From<CaldirError>` is a
find-and-replace on the handlers, not a state change.

---

## 3. What this buys a plugin

| A plugin wants                | It gets                                                                                                                       |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| a backend RPC surface         | `struct MyApiImpl { state: Arc<AppState> }`, merged in `create_router`. Same shape as `CaldirApiImpl`; nothing to reach into. |
| to read calendars/events      | `state.caldir()` for the handle, `state.events(slug)` for parsed events, shared with the app's cache.                         |
| to react to config changes    | `state.subscribe_caldir_config()` — a typed `watch::Receiver`, not `app.listen("string")`.                                    |
| a background watcher          | `fs_watch::watch_debounced(...)` + `spawn_task("name", …)` — 10 lines, and its death is logged.                               |
| to emit to the webview        | do it in its own task or bridge, the way `state_bridge.rs` does; `AppState` itself stays Tauri-free.                          |
| to be tested                  | `AppState::load_from(tmp_config, None)` against a temp caldir; handlers take `&AppState`. No Tauri mock needed.               |
| a second event source (later) | `trait EventSource` hangs off `AppState` (`state.sources()`); `events(slug)` already funnels through one method.              |

After S1: `grep -rn 'LazyLock\|OnceLock\|^static ' src-tauri/src` matches only the
`Once` that pins the macOS notification bundle id — which is genuinely process-once.

---

## 4. Implementation steps

Each step compiles, passes `just check` + `just test`, and can land as its own PR. Steps
2 and 3 could be squashed; keeping them apart makes the S6 behaviour change reviewable on
its own.

### Step 0 — upstream: `Caldir::load_from(config_path)` in caldir-core (small, recommended first)

```rust
pub fn load() -> Result<Self, CaldirError> {
    Self::load_from(CaldirConfig::default_system_config_path()?)
}
pub fn load_from(config_path: impl Into<PathBuf>) -> Result<Self, CaldirError> { /* today's body */ }
```

Non-breaking, ~10 lines in `caldir-core/src/caldir.rs`. Without it, `AppState` tests and
`gen_types` can only read the real system config (env-var overrides are process-global and
race under `cargo test`). Land it, tag, `just bump-caldir <tag>`. If you'd rather not
bump now, steps 1–3 work with `Caldir::load()`; only the `AppState` unit tests wait.

In the same PR, worth adding — `Caldir::load()` couples "read config.toml" with "rescan
`$PATH`", and rencal wants them separately:

```rust
pub fn reload_config(&mut self) -> Result<(), CaldirError>;   // re-read config_path, keep providers
pub fn set_providers(&mut self, providers: ProviderRegistry);  // or providers_mut()
```

With these, `AppState::reload_caldir()` splits into `reload_config()` (called by the
caldir-config watcher — one small file read, no PATH scan when our own `save_config`
echoes back) and `rescan_providers()` (called by `list_providers`, 2.9). Both mutate in
place under the write lock; `open_caldir` is then only used at startup. `&mut self`
methods have precedent in `set_provider_timeout`. Optional: without it, the full reload
is merely wasteful (one PATH scan per settings toggle), not wrong.

Deliberately **not** proposed upstream: a public constructor or `ProviderRegistry: Clone`
(would allow lock-free `Arc<Caldir>` snapshots, but we want the `!Send`-guard guard rail
and the restructuring is seven handlers), and any caching inside caldir-core (the CLI,
daemon and bar widget rely on it re-reading disk; memoisation belongs in `EventCache`).

### Step 1 — `fs_watch` + `tasks` + `watchers/` (M7, no behaviour change)

- Add `src-tauri/src/fs_watch.rs`, `src-tauri/src/tasks.rs`.
- `git mv caldir_watcher.rs watchers/caldir.rs`, `config_watcher.rs → watchers/rencal_config.rs`,
  `tz_watcher.rs → watchers/tz.rs`; add `watchers/mod.rs::spawn_all`. Rewrite each on the
  helper; `omarchy.rs` and `external_themes.rs` keep their module but use the helper.
- Replace the six `tokio::spawn` calls in `lib.rs` with `spawn_task` / `spawn_all`.
- Tests: existing filter tests move with their files. One `fs_watch` test with a tempdir
  (touch a file, `changed()` resolves; drop, `changed()` returns `None`). Mark
  `#[ignore]` if it proves flaky on CI's filesystem.

### Step 2 — `AppState` and the handlers (S1, M9)

- Add `src-tauri/src/state.rs`; de-static `event_cache.rs` (with the generation counter)
  and `deep_links.rs`; delete `BUNDLED_PROVIDERS_DIR` and `bundled_providers_dir()`;
  add `parking_lot` to `Cargo.toml` (already compiled via Tauri) and `tempfile` as a
  dev-dependency.
- `lib.rs`: hoist `generate_context!()`, resolve the bundled dir pre-builder, build
  `Arc<AppState>`, `create_router(state)`, capture clones in the deep-link / single-instance
  / notifier closures.
- `routes/caldir/mod.rs`: `CaldirApiImpl { state: Arc<AppState> }`; every forwarder passes
  `&self.state`. `routes/platform.rs`: same for the inbox.
- All 35 `load_caldir()` sites → `state.caldir()` / `state.events(slug)` /
  `state.save_caldir_config(..)`. The seven awaiting handlers restructure per 2.2 (the
  compiler lists them for you). The rest become sync `fn handler(state: &AppState, …)`.
- `set_calendar_dir` drops its `EVENT_CACHE.invalidate_all()` — `publish()` owns that.
- `list_providers` calls `state.reload_caldir()` first (2.9).
- `caldir_watcher` (still webview-driven at this step) reads the dir from
  `state.caldir().data_dir()` instead of `Caldir::load()`.
- `examples/gen_types.rs`: temp config via `load_from`.
- Tests (`state.rs`): temp caldir with two calendars → `events()` caches, `invalidate`
  drops, `save_caldir_config` with a new `data_dir` empties the cache and wakes a
  subscriber, `reload_caldir` on a malformed file keeps the old config, generation check
  (invalidate between parse and insert → not cached). Existing handler tests
  (`find_event`, `set_calendar_color`, …) are unaffected; a couple of the cache-reading
  handlers gain a test now that they take `&AppState`.
- Acceptance: `just gen-types` produces **no diff** in `src/rpc/bindings.ts` — S1 is
  invisible to the frontend at this step.

### Step 3 — config ownership and self-re-pointing watcher (S6 half)

- Add `watchers/caldir_config.rs` (disk → `state.reload_caldir()`), `state_bridge.rs`
  (state → `calendar-dir-changed`). Register both in `spawn_all` / `setup`.
- `watchers/caldir.rs`: `select!` on the config receiver; delete `app.listen` and the
  private `CALENDAR_DIR_CHANGED` constant. Export the constant from `state_bridge.rs`
  next to the others so step 3 of the wiki (generated manifest) has one list to consume.
- Frontend: `SettingsContext.setCalendarDir` → one RPC call; update the comment in
  `src/rpc/events.ts` (the event is now emitted by Rust). Optionally move the two
  `emit(CALDIR_CHANGED)` in `useConnectProvider.ts` into `save_connected_calendars`.
- Acceptance: change the calendar dir in Settings → both windows update the path, the
  calendar list reloads, and touching an `.ics` in the **new** dir fires `caldir-changed`.
  Hand-edit `calendar_dir` in `~/.config/caldir/config.toml` while the app runs → same
  result without a restart (new behaviour). Write garbage into that file → warning in the
  log, app keeps working; fix it → picked up.

### Step 4 — docs

- `AGENTS.md` (edit the target, not the `CLAUDE.md` symlink): add `src-tauri/src/state.rs`,
  `fs_watch.rs`, `state_bridge.rs`, `watchers/` to "Important backend paths". Add to the
  Rust rules: _"Backend state lives in `AppState`; never add process statics. Never hold
  `state.caldir()` across an `.await` — clone the `Provider`/`connections()` you need
  first."_
- Tick step 2 in the wiki's "Order of attack"; strike the `helpers.rs` line in the docs
  drift nit.

---

## 5. Verification

- `just check`, `just test` (frontend + Rust + bindings diff) green after every step.
- `grep -rn 'LazyLock\|OnceLock\|^static ' src-tauri/src` → only the macOS `Once`.
- `grep -rn 'load_caldir\|Caldir::load()' src-tauri/src` → only `state.rs` (and
  `reminder-core`, which is shared with the daemon and out of scope).
- Manual: `just debug` and exercise create/edit/delete, sync, connect a provider, change
  the calendar dir, install a provider binary then open Accounts, hand-edit caldir's
  config. With `RUST_LOG=debug`, confirm no PATH scan is logged per request (add a
  one-line `log::debug!` in `open_caldir` while verifying; remove or keep at trace).

---

## 6. Out of scope, and the hooks left for it

- **`RencalConfig` in `AppState`** — S4. Same pattern (`RwLock` + `watch` + the
  `rencal_config` watcher calling a reload), but the C2 semantics ("file is broken right
  now, refuse writes until fixed") need a decision — a `Result` slot or similar — and S4
  is rewriting those twelve procedures anyway. The bridge is where its `setting-changed`
  goes.
- **Suppressing the watcher on the app's own writes** — S2. The natural home is
  `EventCache` (a "recently written paths" set or mutation epoch), which now lives in
  `AppState`, so S2 does not need new plumbing.
- **`reminder-core`'s per-tick `Caldir::load()`** — it runs in `rencal-notifierd` too and
  must stay Tauri-free; M8 territory.
- **Collapsing the trait / forwarder / per-file triple** — the forwarders now carry
  `&self.state`, which is all they do; a macro to remove them is not worth its weight.
- **`spawn_blocking` for cache-miss parses** — handlers block a tokio worker today
  exactly as much as before S1; revisit if a profile shows it.
