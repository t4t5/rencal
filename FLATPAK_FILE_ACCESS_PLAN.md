# Flatpak file access plan

## Goal

Give the Flatpak access to the arbitrary caldir data directory selected by the
user without requiring `flatpak override`, `--filesystem=home`, or a restart.
Keep the real host path in the shared caldir config so native renCal builds,
the caldir CLI, editors, and other tools continue to use the same directory.

Implement this in two independently testable steps:

1. Obtain persistent read/write access through the FileChooser/Documents
   portals and route renCal's filesystem operations through the returned portal
   path.
2. Replace inotify with polling in Flatpak mode so edits made directly through
   the host path are detected.

Step 1 deliberately does not solve live detection of host-side edits. It is
complete when existing data can be read and all renCal operations can write it
reliably across app restarts. Step 2 restores the external-edit freshness that
`caldir_watcher.rs` provides to native builds.

## Why use a portal

The FileChooser portal lets the user authorize one directory without granting
the app access to all of `$HOME`. The Documents portal exposes that directory
inside the sandbox through a FUSE path such as:

```text
/run/flatpak/doc/<document-id>/calendar
```

Selections made through FileChooser are persistent across app sessions. The
returned portal path is machine- and sandbox-specific, however, and must never
be written to the shared caldir config.

The application therefore has two paths for the same directory:

```text
canonical host path:  /home/alice/calendar
effective app path:   /run/flatpak/doc/<document-id>/calendar
```

- The canonical host path remains in `~/.config/caldir/config.toml` and is
  displayed in Settings.
- The effective path is private Flatpak state and is used for filesystem I/O
  by the sandboxed process.

Provider binaries do not need the effective data path. They exchange remote
parameters and events over the provider protocol; local calendar reads and
writes happen in caldir-core's parent process. Their credentials and session
state remain available through the existing `xdg-config/caldir` mount.

## Step 1: persistent portal access

### 1. Validate the portal behavior first

Before refactoring caldir loading, add a temporary diagnostic or use the
existing Settings directory picker in a Flatpak with all data-directory
overrides removed. Confirm on the target Omarchy setup that:

- Selecting a directory returns a document-portal path inside the sandbox.
- The selected directory and nested calendar directories can be enumerated.
- Existing `.ics`, calendar config, `.caldir`, and other hidden files are
  visible.
- Files can be created, updated, atomically renamed, and deleted.
- The portal entry exposes the original host path through the documented
  `user.document-portal.host-path` extended attribute.
- The returned path remains usable after closing and reopening renCal.
- A host-side edit becomes visible when the file is read again, even though it
  does not produce an inotify event.

Also test a directory with spaces in its name. Record the installed
`xdg-desktop-portal` and document-portal versions with the results.

Do not proceed with the full implementation if recursive writes or persistence
fail. In that case, retain the explicit `flatpak override` design.

### 2. Remove static data-directory access

Remove this permission from `flatpak/org.ren.rencal.yml`:

```yaml
- --filesystem=~/caldir:create
```

Keep the two shared config permissions:

```yaml
- --filesystem=xdg-config/caldir:create
- --filesystem=xdg-config/rencal:create
```

The config mounts remain real bind mounts. Only calendar data goes through the
Documents portal.

Reset manual overrides before testing so they cannot hide a portal bug:

```sh
flatpak override --user --reset org.ren.rencal
```

After resetting, rebuild/install the manifest before testing.

### 3. Add a runtime data-directory override to caldir-core

caldir-core currently derives every calendar path from the path stored in
`CaldirConfig`. Add an explicit runtime-only override, conceptually:

```rust
pub struct Caldir {
    config: CaldirConfig,
    config_path: Option<PathBuf>,
    data_dir_override: Option<PathBuf>,
    providers: ProviderRegistry,
}

impl Caldir {
    pub fn with_data_dir_override(mut self, path: impl Into<PathBuf>) -> Self;

    pub fn data_dir(&self) -> PathBuf {
        self.data_dir_override
            .clone()
            .unwrap_or_else(|| self.config.data_dir())
    }
}
```

Required invariants:

- `Caldir::data_dir()` returns the effective filesystem path.
- `Caldir::config().data_dir()` always returns the canonical configured path.
- `save_config()` never persists the runtime override.
- Every operational path calculation uses `Caldir::data_dir()`. Audit direct
  uses of `self.config.data_dir()`, including unique-slug generation.
- Native callers that do not set an override behave exactly as before.

Add caldir-core tests proving that calendar enumeration, creation, and lookup
use the override while config reads and writes retain the canonical path.
Release/update the caldir-core dependency used by renCal after the API is
available.

### 4. Store the portal mapping as private app state

Store one mapping under the Flatpak-private XDG data directory, for example:

```text
$XDG_DATA_HOME/rencal/flatpak-data-dir.json
```

Inside the Flatpak this remains below
`~/.var/app/org.ren.rencal/data`; it is not part of either shared config mount.

Suggested shape:

```rust
struct DataDirGrant {
    host_path: PathBuf,
    portal_path: PathBuf,
}
```

Write the mapping atomically. It is not a source of authority by itself: each
startup must confirm that the configured host path still matches and that the
portal path is usable.

When registering a newly selected directory:

1. Require a directory returned by the portal-backed picker.
2. Read `user.document-portal.host-path` from the portal directory to recover
   its canonical host path. A Documents `GetHostPaths` call can be a future
   fallback, but it requires a newer portal API.
3. Normalize the configured and recovered paths consistently.
4. For an access request to an existing configured directory, reject a
   selection whose recovered host path does not match. Explain which directory
   must be selected.
5. Confirm the portal directory can be enumerated and written. Use a uniquely
   named hidden probe file and always attempt to remove it; report cleanup
   failures.
6. Save the mapping only after validation succeeds.

If the mapping is missing, revoked, stale, or points at a different configured
host directory, report that authorization is required. Never treat an invalid
mapping as an empty calendar.

Changing directories can leave the old Documents permission in the portal's
permission store. Attempt revocation only if the granted document permissions
allow it; otherwise discard the old mapping and leave revocation to the user's
Flatpak permission manager. Failure to revoke an old grant must not block the
new selection.

### 5. Centralize caldir loading in renCal

Add a backend module such as `src-tauri/src/caldir_access.rs` responsible for:

- Detecting Flatpak through `FLATPAK_ID`.
- Loading and validating the private grant mapping.
- Comparing it with the canonical path in the shared caldir config.
- Returning `NeedsAuthorization` instead of silently loading an empty caldir.
- Applying `with_data_dir_override(portal_path)` inside Flatpak.
- Loading the canonical path without an override on native builds.
- Overlaying bundled providers as the existing route helper does today.

Expose one shared loader and use it for every in-process caldir load:

- `src-tauri/src/routes/caldir/helpers.rs`
- `src-tauri/src/caldir_watcher.rs`
- The in-process reminder loop
- Any future background task that reads calendar data

The reminder-core API may need to accept an already resolved `Caldir`, an
effective path, or a loader callback. The standalone native notifier daemon
must continue to load the canonical host path normally.

Provider subprocess transport does not need a data-path flag or environment
variable.

### 6. Replace the override-command RPC with an authorization API

Evolve `DataDirStatus` into a state that describes access rather than a shell
command, for example:

```rust
enum DataDirStatus {
    Ready { path: String },
    NeedsAuthorization { path: String },
}
```

Add backend procedures with responsibilities along these lines:

```text
caldir.get_data_dir_status()
caldir.authorize_data_dir(portal_path)
caldir.set_calendar_dir_from_portal(portal_path)
```

- `authorize_data_dir` grants access to the path already present in shared
  config and must verify an exact host-path match.
- `set_calendar_dir_from_portal` represents an intentional Settings change. It
  recovers the host path, stores that canonical path in shared config, stores
  the portal mapping privately, invalidates caches, and emits the existing
  directory-change event.
- Keep the existing direct `set_calendar_dir` behavior for native platforms if
  useful, but do not let a Flatpak write a `/run/flatpak/doc/...` path into the
  shared config.

Regenerate taurpc bindings after changing the route types.

### 7. Gate startup before calendar preload

Check `get_data_dir_status()` before `preloadCalendarData()` or mounting
calendar-dependent providers.

When authorization is required, render a full-window screen that:

- Shows the canonical configured directory.
- Explains that renCal needs the user to select that directory.
- Opens the existing portal-backed picker with
  `open({ directory: true, multiple: false })` from an explicit button.
- Sends the returned portal path to `authorize_data_dir`.
- Shows a useful mismatch or portal error without exposing an empty app.
- Continues startup immediately after success; no process restart is required.

The gate must fail closed while status is loading and when the status RPC
fails. Include a retry action for recoverable portal errors.

In Settings, the existing **Change** button should use
`set_calendar_dir_from_portal` in Flatpak and the current native behavior
elsewhere.

If the shared caldir config is changed to another directory while renCal is
running, invalidate the active mapping and return to the authorization screen.
This may require watching `~/.config/caldir/config.toml`, which is available
through the real config bind mount.

### Step 1 acceptance tests

Run all Flatpak tests with no manual data-directory override.

1. Existing custom data directory:
   - Startup asks the user to select the configured directory.
   - Selecting the wrong directory is rejected.
   - Selecting the correct directory loads calendars without restarting.
2. Shared config integrity:
   - `calendar_dir` remains the canonical host path.
   - No `/run/flatpak/doc` or `/run/user/.../doc` path is written to shared
     config.
3. Read/write behavior:
   - Create, edit, move between calendars, and delete events in renCal.
   - Confirm the host caldir CLI sees every change at the canonical path.
   - Confirm `.caldir` sync state is written correctly.
4. Provider behavior:
   - Connect or reuse an existing provider account.
   - Preview, pull, and push a sync.
   - Confirm provider credentials continue using shared config storage.
5. Persistence:
   - Restart renCal and confirm it loads without prompting again.
   - If practical, log out/in and repeat to test a new user session.
6. Directory changes and recovery:
   - Change to a second directory through Settings.
   - Revoke the permission or move the directory and confirm renCal asks again
     instead of showing an empty calendar.
7. Native regression:
   - Run `just debug` and confirm no portal mapping is required or used.
8. Project checks:
   - Run `just gen-types` for RPC type changes.
   - Run `just typecheck` and `just check`.

It is acceptable at the end of Step 1 that host-side edits do not appear live.
Restarting/reloading renCal must read the new contents. Do not describe the
existing inotify watcher as reliable in Flatpak mode.

## Step 2: detect host-side changes by polling

### 1. Use a separate watcher strategy in Flatpak

Keep the current `notify`/inotify implementation for native builds. In Flatpak
mode, do not rely on inotify over the Documents FUSE mount: changes made
directly through the host path do not emit events on the portal path.

Make the watcher strategy explicit:

```text
native process  -> notify watcher on canonical path
Flatpak process -> polling watcher on effective portal path
```

The Flatpak watcher should use the central access resolver from Step 1. If
authorization is lost, stop polling and surface `NeedsAuthorization` rather
than repeatedly logging filesystem errors.

### 2. Define a cheap filesystem snapshot

Mirror the scope of the existing watcher: only `.ics` event files trigger
`CALDIR_CHANGED`; ignore `.caldir`, `.git`, and unrelated files.

Build a deterministic snapshot keyed by relative path. A useful Linux stamp is:

```rust
struct FileStamp {
    len: u64,
    modified_sec: i64,
    modified_nsec: i64,
    changed_sec: i64,
    changed_nsec: i64,
}

type CaldirSnapshot = BTreeMap<PathBuf, FileStamp>;
```

Including ctime as well as mtime catches common tools that preserve mtime while
rewriting a file. Creation, deletion, and rename are detected through changes
to the relative-path key set.

Do not hash every event body on every poll initially. If testing shows that
the portal does not expose useful ctime/mtime changes, revisit content hashes
or a tiered scan before shipping.

Run directory traversal in `spawn_blocking`; it must not block the async
runtime or UI-facing RPC work.

### 3. Poll and emit changes

Start with a fixed interval of roughly three seconds. Optimize only after
measuring realistic caldirs.

Polling behavior:

1. Build an initial snapshot without emitting an event.
2. On each tick, build the next snapshot.
3. If it differs, replace the stored snapshot, invalidate `EVENT_CACHE`, and
   emit one `CALDIR_CHANGED` event.
4. If a scan fails part-way, retain the last complete snapshot and retry on the
   next tick. Do not interpret a failed scan as deletion of every event.
5. When `CALENDAR_DIR_CHANGED` fires, discard the old baseline, resolve the new
   effective directory, and build a fresh baseline without emitting a false
   change.

An immediate scan on window focus is a useful follow-up. Longer intervals while
the window is hidden can reduce wakeups, but adaptive timing is not required
for the first correct implementation.

### 4. Avoid duplicate watcher behavior

Use polling instead of `notify` in Flatpak mode rather than running both. The
portal watcher can observe renCal's own writes while still missing host writes,
which creates misleading partial coverage and duplicate invalidations.

Existing route-level cache invalidation and events can remain; repeated
invalidations are safe, but the polling loop should coalesce an entire scan
into one event.

### 5. Test the snapshot logic separately

Unit-test snapshot comparison using temporary caldir trees:

- Initial scan does not emit.
- Create an `.ics` file.
- Modify an existing `.ics` file without changing its length.
- Rename an `.ics` file.
- Delete an `.ics` file.
- Change an ignored non-`.ics` file.
- Simulate a failed/incomplete scan and preserve the prior baseline.
- Change directories and establish a new baseline.

Keep the comparison and state-transition logic pure where possible so most
tests do not depend on timers or a live portal.

### Step 2 acceptance tests

1. Launch the Flatpak with a valid portal grant and leave it open.
2. Through the canonical host path, use each of the following while watching
   the UI:
   - Create an `.ics` event with the caldir CLI.
   - Edit an event in a text editor.
   - Rename an event file.
   - Delete an event file.
   - Run a host-side sync that changes several files at once.
3. Confirm each batch appears in renCal within one polling interval and causes
   a single logical refresh rather than a refresh per file.
4. Confirm changes made by renCal still appear immediately or by the next poll
   and remain visible to host tools.
5. Revoke the portal grant while renCal is running and confirm it returns to
   the authorization flow without clearing valid cached data as if every event
   had been deleted.
6. Measure scan duration and CPU use with small, typical, and large caldirs.
   The polling interval must comfortably exceed normal scan duration.
7. Run `just typecheck` and `just check`.

## Known tradeoffs after both steps

- Host-side edits are eventually consistent in Flatpak rather than immediate.
- Polling and FUSE traversal cost more CPU and filesystem calls than native
  inotify. The native package keeps the existing efficient watcher.
- The shared config and the private portal mapping must remain consistent.
- Moving/replacing the authorized root or revoking portal permissions requires
  user authorization again.
- Old directory grants may remain in the Documents permission store after the
  configured directory changes.
- Portal behavior depends on the host desktop's portal implementation, so
  failures must produce a clear recovery screen rather than an empty calendar.

In return, the Flatpak needs no broad home permission, no terminal command, and
no restart after authorization, while retaining caldir's interoperability with
host-side tools.
