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
| Window renders    | Should work (GNOME runtime has webkit2gtk-4.1)                                                                                                                               |
| Caldir directory  | **Will break.** Sandbox has no `--filesystem` access; XDG dirs are redirected to `~/.var/app/org.ren.rencal/`. The app will see an empty/missing caldir.                     |
| Provider binaries | Spawning `/app/lib/renCal/providers/*` should work (children share the sandbox), but sync also depends on caldir paths above.                                                |
| OAuth login       | Browser open goes through the URI portal (`tauri-plugin-opener`) — probably works. Localhost redirect needs `--share=network`.                                               |
| Notifications     | `rencal-notifierd` is not shipped and there's no systemd inside the sandbox — reminders won't fire. In-app `tauri-plugin-notification` may work via the notification portal. |
| Updater           | `tauri-plugin-updater` cannot self-update a flatpak. Expect a failed check; flatpak builds should eventually disable it at build time.                                       |
| Single instance   | dbus-based; `--session-bus` access is granted by default, likely fine.                                                                                                       |

## Decisions deferred (informed by the test run)

1. **Caldir access**: broad `--filesystem=~/<caldir-path>`, a portal-based
   picker, or defaulting the caldir into the app's own sandbox data dir.
2. **Notifier daemon**: flatpak can't install systemd user units. Options:
   run notifierd as a background process of the app + `--talk-name=org.freedesktop.Notifications`,
   use the Background portal for autostart, or accept no reminders in flatpak.
3. **Updater**: compile a flatpak variant with the updater plugin disabled
   (updates come from the flatpak remote instead).
4. **Flathub-proper build**: requires building from source with offline
   `cargo`/`pnpm` sources (generated via `flatpak-builder-tools`). Only worth
   doing once the deb-repack version works well enough locally.
