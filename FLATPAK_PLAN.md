# Flatpak plan (minimal, local-only)

Goal: a first flatpak of renCal that builds and launches locally, with as few
permissions and moving parts as possible. It is _expected_ to be partially
broken (filesystem access, notifications, updater) — the point is to see
exactly where it breaks so we can make decisions later.

## Approach: repackage the .deb

Same trick as `aur/PKGBUILD-bin.template`: instead of teaching flatpak-builder
to build Rust + pnpm offline (required for Flathub, painful), we extract the
locally built `.deb` into the flatpak. This keeps the manifest ~30 lines and
reuses the exact artifact we already ship.

Runtime: `org.gnome.Platform` (not `org.freedesktop.Platform`) because Tauri v2
needs `webkit2gtk-4.1`, which only the GNOME runtime ships. GNOME 48 is the
version Tauri's flatpak docs are known-good with.

## Steps

### 1. Install tooling (one-time)

```sh
sudo pacman -S flatpak flatpak-builder
flatpak remote-add --if-not-exists flathub https://dl.flathub.org/repo/flathub.flatpakrepo
flatpak install flathub org.gnome.Platform//48 org.gnome.Sdk//48
```

### 2. Build the deb

```sh
just build
# produces src-tauri/target/release/bundle/deb/renCal_<version>_amd64.deb
# and a stable renCal_amd64.deb hardlink for the Flatpak manifest
```

### 3. Create `flatpak/org.ren.rencal.yml`

The deb installs (see `bsdtar -tf data.tar.gz`):

- `usr/bin/rencal` — main binary
- `usr/bin/rencal-notifierd` + `usr/lib/systemd/user/rencal-notifierd.service` — **skip in v1** (flatpaks can't install systemd user units; decide later)
- `usr/lib/renCal/{providers/*,icons/128x128.png}` — resources; must land at `/app/lib/renCal` so Tauri's exe-relative resource lookup (`../lib/renCal`) still resolves
- `usr/share/applications/renCal.desktop`, `usr/share/icons/hicolor/*` — flatpak requires these to be named after the app ID; use `rename-desktop-file` / `rename-icon`

Manifest:

```yaml
id: org.ren.rencal
runtime: org.gnome.Platform
runtime-version: "48"
sdk: org.gnome.Sdk
command: rencal

finish-args:
  # Bare minimum to render a window:
  - --socket=wayland
  - --socket=fallback-x11
  - --share=ipc
  - --device=dri
  # Needed for provider sync + OAuth localhost redirect. Drop this line
  # first if you want to see the app fully offline-sandboxed.
  - --share=network

modules:
  - name: rencal
    buildsystem: simple
    build-commands:
      - bsdtar -xf renCal.deb data.tar.gz
      - bsdtar -xzf data.tar.gz
      - install -Dm755 usr/bin/rencal /app/bin/rencal
      - cp -r usr/lib/renCal /app/lib/renCal
      - install -Dm644 usr/share/applications/renCal.desktop /app/share/applications/org.ren.rencal.desktop
      - |
        for size in 32x32 128x128 256x256@2; do
          install -Dm644 usr/share/icons/hicolor/$size/apps/rencal.png \
            /app/share/icons/hicolor/$size/apps/org.ren.rencal.png
        done
      - sed -i 's/Icon=rencal/Icon=org.ren.rencal/' /app/share/applications/org.ren.rencal.desktop
    sources:
      - type: file
        path: ../src-tauri/target/release/bundle/deb/renCal_amd64.deb
        dest-filename: renCal.deb
```

Tauri reads the app version from `package.json`; `just build` refreshes the
stable deb hardlink, so version bumps do not require manifest edits.

Note the app ID matches `identifier` in `tauri.conf.json` (`org.ren.rencal`),
which matters later for portals/notifications matching the desktop file.

### 4. Build + install + run

```sh
flatpak-builder --user --install --force-clean build-dir flatpak/org.ren.rencal.yml
flatpak run org.ren.rencal
```

Debugging aids:

```sh
flatpak run --devel --command=sh org.ren.rencal   # shell inside the sandbox
flatpak run --env=WEBKIT_DISABLE_DMABUF_RENDERER=1 org.ren.rencal  # if blank/glitchy webview
```

### 5. Test checklist — record what breaks

| Area              | Expectation                                                                                                                                                                  |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Window renders    | ✅ Confirmed working (GNOME runtime has webkit2gtk-4.1)                                                                                                                      |
| Caldir directory  | ❌ **Confirmed broken.** See "Iteration 2" below: the sandbox cannot see the host's caldir config or calendar data until both receive explicit filesystem grants.            |
| Provider binaries | Spawning `/app/lib/renCal/providers/*` should work (children share the sandbox), but sync also depends on caldir paths above.                                                |
| OAuth login       | Browser open goes through the URI portal (`tauri-plugin-opener`) — probably works. Localhost redirect needs `--share=network`.                                               |
| Notifications     | `rencal-notifierd` is not shipped and there's no systemd inside the sandbox — reminders won't fire. In-app `tauri-plugin-notification` may work via the notification portal. |
| Updater           | `tauri-plugin-updater` cannot self-update a flatpak. Expect a failed check; flatpak builds should eventually disable it at build time.                                       |
| Single instance   | dbus-based; `--session-bus` access is granted by default, likely fine.                                                                                                       |

## Iteration 2: share the host caldir config

**Decision: the flatpak shares the host's config** — both `~/.config/caldir`
(so renCal, the `caldir` CLI, and any other caldir tool read/write the same
config and provider credentials) and `~/.config/rencal` (renCal settings +
custom themes). Per-app sandboxed config would silently fork the user's
calendar setup, which contradicts caldir's plaintext/shared design. The fix is
entirely in the flatpak manifest — no application or caldir-core changes.

### What the first run showed

The watcher warned: `"/home/t4t5/caldir" does not exist`. Two independent
layers of breakage:

1. **Config access** (the actual problem hit): flatpak always sets
   `XDG_CONFIG_HOME=$HOME/.var/app/org.ren.rencal/config` inside the sandbox.
   caldir-core resolves its config via `dirs::config_dir()`
   (`caldir-core/src/utils/paths.rs`), so it looked in the app-private dir,
   found no `config.toml`, and fell back to the default `~/caldir` data dir.
   Flatpak's `xdg-config/caldir` filesystem permission fixes this by bind-mounting
   the host config directory at the sandbox's `$XDG_CONFIG_HOME/caldir`.
2. **Data dir access**: even knowing the right data dir (`~/calendar`), the
   sandbox can't read it without a `--filesystem` grant.

### Fix, part 1: manifest config permissions

Do not reset `XDG_CONFIG_HOME`. Flatpak's `xdg-config/<dir>` permission maps a
host XDG config subdirectory into the sandbox's existing XDG config directory.
For a default host setup, the effective mapping is:

```text
host ~/.config/caldir
  → sandbox $XDG_CONFIG_HOME/caldir
  → ~/.var/app/org.ren.rencal/config/caldir
```

This is a bind mount, not a copy: reads and writes operate on the host's config
and provider credentials. It also respects a custom host `$XDG_CONFIG_HOME`.
caldir-core, `RencalConfig`, and spawned provider binaries can continue using
`dirs::config_dir()` normally, while unrelated XDG config remains sandboxed.

**Omarchy theme integration is out of scope for the flatpak** — Omarchy users
install via AUR. `~/.config/omarchy/current` stays unmounted; the omarchy
watcher just idles on a missing dir.

Add to `finish-args`:

```yaml
# Share the host's caldir config (config.toml + provider credentials)
- --filesystem=xdg-config/caldir:create
# Share renCal's own config (~/.config/rencal: settings + custom themes)
- --filesystem=xdg-config/rencal:create
```

Both mounts are read-write: providers need to write token refreshes, and rencal
creates its config and `themes/` directory on startup.

The `:create` suffix matters for fresh installs: without it, flatpak silently
skips the bind mount when the host directory doesn't exist yet, so the app's
first write would create a sandbox-private directory and fork the config from
the host. `:create` makes flatpak create the host-side directory before
mounting it.

### Fix, part 2: calendar data permission

The **data dir** is an arbitrary user-chosen path (`~/calendar` here), so the
manifest can't grant it statically. While testing, grant it per-machine:

```sh
flatpak override --user --filesystem=~/calendar org.ren.rencal
```

### Test sequence

1. Add the two `--filesystem=xdg-config/*` grants to the manifest, then rebuild:
   `flatpak-builder --user --install --force-clean build-dir flatpak/org.ren.rencal.yml`
2. Confirm the host config is visible through Flatpak's mapping:
   `flatpak run --command=sh org.ren.rencal -c 'test -f "$XDG_CONFIG_HOME/caldir/config.toml"'`
3. `flatpak override --user --filesystem=~/calendar org.ren.rencal`
4. `flatpak run org.ren.rencal` — expect the watcher to report `~/calendar`,
   events to load, and provider sync to reuse existing host credentials.

## Iteration 3: in-app "grant access" screen (simplified, no portals)

**Decision: detect the missing grant and show the user the exact
`flatpak override` command** instead of a portal flow. A sandboxed app cannot
grant itself access to a known path; the FileChooser/Documents-portal route
would work but routes all I/O through a FUSE mount with real downsides for us
(no inotify events for host-side edits, portal-path plumbing into providers).
The static override keeps full fidelity — real path, real inotify, providers
untouched — at the cost of one copy-pasted command. A portal upgrade can layer
on top later; it replaces the same screen.

### Manifest

Grant the _default_ data dir statically so a fresh install works with zero
prompts; only custom dirs need the override:

```yaml
# Default caldir data dir (users with a custom dir get an in-app prompt)
- --filesystem=~/caldir:create
```

### Backend

- Sandbox detection: `FLATPAK_ID` env var (set for every sandboxed process).
- New taurpc route `caldir.get_data_dir_status()` returning
  `Ok | NeedsPermission { path, command }`: `NeedsPermission` when sandboxed
  and the configured data dir doesn't exist (an ungranted path is simply
  invisible in the sandbox).
- `command` is the full copyable string, built in the backend where
  `FLATPAK_ID` provides the app id:
  `flatpak override --user --filesystem=<path> org.ren.rencal`.
- No watcher changes: `caldir_watcher.rs` already idles when the dir is
  missing and re-points on `CALENDAR_DIR_CHANGED`.

### Frontend

- On startup in `AppWindow`, call `get_data_dir_status()`; on `NeedsPermission`
  render a blocking access screen: explain the sandbox can't see `<path>`,
  show the command with a copy button, note that renCal must be **restarted**
  after running it (overrides only apply at sandbox launch).
- Re-check the status when the calendar dir setting changes, so pointing the
  app at an ungranted dir from Settings shows the same screen.

### Test sequence

1. `flatpak override --user --reset org.ren.rencal`, rebuild, run — expect the
   access screen for `~/calendar` with the copyable command.
2. Run the command, restart — expect events to load normally.
3. Outside flatpak (`just debug`): status is always `Ok`, no behavior change.

## Decisions deferred (informed by the test run)

1. **Portal-based grant flow**: an in-app FileChooser/Documents-portal flow
   (picker + stored host-path→doc-path mapping) could replace the copy-paste
   command in Iteration 3 with a native dialog. Deferred: doc-portal FUSE
   mounts drop inotify events for host-side edits (breaks the watcher's core
   purpose) and the portal path must be plumbed into spawned providers.
   Revisit only if the override UX proves too rough for real users.
2. **Notifier daemon**: flatpak can't install systemd user units. Options:
   run notifierd as a background process of the app + `--talk-name=org.freedesktop.Notifications`,
   use the Background portal for autostart, or accept no reminders in flatpak.
3. **Updater**: compile a flatpak variant with the updater plugin disabled
   (updates come from the flatpak remote instead).
4. **Flathub-proper build**: requires building from source with offline
   `cargo`/`pnpm` sources (generated via `flatpak-builder-tools`). Only worth
   doing once the deb-repack version works well enough locally.
