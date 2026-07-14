# List all available tasks
default:
  @just --list

# Install NPM dependencies
install:
  pnpm install

# Format files
format:
  @just format-rust

[working-directory: 'src-tauri']
format-rust:
  cargo fmt --all

# Run app (dev mode)
dev: build-providers
  pnpm tauri dev

# Run app with frontend debug logging enabled. Pass a namespace to narrow it, e.g. `just debug month-scroll`.
debug flags="*": build-providers
  VITE_RENCAL_DEBUG={{flags}} pnpm tauri dev

# Run website docs (dev mode)
web:
  pnpm --dir website dev

# Force deploy website (used to update /releases)
deploy-web:
  gh workflow run website.yml --ref main 
  gh run watch

# Generate TypeScript bindings from Rust types
[working-directory: 'src-tauri']
gen-types:
  cargo run --example gen_types

# Test production version of app (needs build first)
start:
  src-tauri/target/release/bundle/appimage/renCal_0.0.1_amd64.AppImage

# Check Rust and TypeScript types
check:
  cargo check --workspace --manifest-path src-tauri/Cargo.toml
  cargo clippy --workspace --manifest-path src-tauri/Cargo.toml -- -D warnings
  @just typecheck

# Check TypeScript types only
typecheck:
  pnpm typecheck

# Run frontend tests
test:
  pnpm test

# Analyze which parts of app are slow based on ChromeDevTool recording:
analyze path:
  bun scripts/analyze-recording.ts {{path}}

# Generate platform-specific app icons from src-tauri/icons-src/*.svg
icons:
  #!/usr/bin/env bash
  set -euo pipefail

  linux_src="src-tauri/icons-src/linux.svg"
  mac_src="src-tauri/icons-src/mac.svg"
  out_dir="src-tauri/icons"

  if [[ ! -f "$linux_src" ]]; then
    echo "Missing $linux_src" >&2
    exit 1
  fi
  if [[ ! -f "$mac_src" ]]; then
    echo "Missing $mac_src" >&2
    exit 1
  fi

  rm -rf "$out_dir/ios" "$out_dir/android"
  mkdir -p "$out_dir/linux" "$out_dir/macos" "$out_dir/windows"
  cp "$linux_src" "$out_dir/linux/icon.svg"
  cp "$mac_src" "$out_dir/macos/icon.svg"

  # Linux: ship a real SVG plus common hicolor PNG sizes so launchers do not
  # upscale a low-resolution icon.
  for size in 16 24 32 48 64 128 256 512 1024; do
    magick -background none "$linux_src" \
      -resize "${size}x${size}" \
      -alpha on \
      -strip \
      -define png:color-type=6 \
      -define png:exclude-chunk=bKGD \
      "PNG32:$out_dir/linux/${size}x${size}.png"
  done

  # Windows: generate a multi-size ICO from the Linux artwork by default.
  magick -background none "$linux_src" \
    -alpha on \
    -define icon:auto-resize=256,128,64,48,32,16 \
    "$out_dir/windows/icon.ico"

  # macOS: let Tauri generate the ICNS from the macOS-specific artwork.
  # Tauri also emits mobile icons, but they stay in this temp directory and are
  # discarded because renCal is desktop-only.
  tmp_dir="$(mktemp -d)"
  trap 'rm -rf "$tmp_dir"' EXIT
  pnpm tauri icon "$mac_src" -o "$tmp_dir/macos"
  cp "$tmp_dir/macos/icon.icns" "$out_dir/macos/icon.icns"

  # Keep Tauri's current root-level icon paths populated for compatibility with
  # tauri.conf.json and notification resources.
  cp "$out_dir/linux/32x32.png" "$out_dir/32x32.png"
  cp "$out_dir/linux/64x64.png" "$out_dir/64x64.png"
  cp "$out_dir/linux/128x128.png" "$out_dir/128x128.png"
  cp "$out_dir/linux/256x256.png" "$out_dir/128x128@2x.png"
  cp "$out_dir/linux/512x512.png" "$out_dir/icon.png"
  cp "$out_dir/linux/1024x1024.png" "$out_dir/master.png"
  cp "$out_dir/macos/icon.icns" "$out_dir/icon.icns"
  cp "$out_dir/windows/icon.ico" "$out_dir/icon.ico"

# See the size of dependencies:
bundlesize:
  npx vite-bundle-visualizer

# Build the app for production
build: build-providers-release
  #!/usr/bin/env bash
  set -euo pipefail
  # Linux deb/rpm bundles ship the reminder daemon — build it first so
  # tauri-bundler can pick it up via bundle.linux.{deb,rpm}.files.
  if [[ "$(uname -s)" == "Linux" ]]; then
    cargo build --release --manifest-path src-tauri/Cargo.toml -p rencal-notifierd
  fi
  NO_STRIP=true pnpm tauri build --config '{ "bundle": { "createUpdaterArtifacts": false } }'

# Build, sign, and notarize the app for distribution (requires .env with Apple credentials)
notarize: build-providers-release
  #!/usr/bin/env bash
  set -euo pipefail
  set -a && source .env && set +a
  # Sign bundled provider binaries with hardened runtime + secure timestamp
  for bin in src-tauri/providers/caldir-provider-*; do
    codesign --sign "$APPLE_SIGNING_IDENTITY" --timestamp --options runtime --force "$bin"
  done
  # Updater artifacts (and their signing key) are produced in CI, not here.
  NO_STRIP=true pnpm tauri build --config '{ "bundle": { "createUpdaterArtifacts": false } }'

# Build caldir provider binaries (debug) into src-tauri/providers/
build-providers:
  #!/usr/bin/env bash
  set -euo pipefail
  mkdir -p src-tauri/providers
  providers=(google icloud outlook caldav webcal)
  cargo build --manifest-path ../caldir/Cargo.toml "${providers[@]/#/--package=caldir-provider-}"
  for p in "${providers[@]}"; do
    cp "../caldir/target/debug/caldir-provider-$p" src-tauri/providers/
  done

# Build caldir provider binaries (release) into src-tauri/providers/
build-providers-release:
  #!/usr/bin/env bash
  set -euo pipefail
  mkdir -p src-tauri/providers
  providers=(google icloud outlook caldav webcal)
  cargo build --manifest-path ../caldir/Cargo.toml "${providers[@]/#/--package=caldir-provider-}"
  for p in "${providers[@]}"; do
    cp "../caldir/target/release/caldir-provider-$p" src-tauri/providers/
  done

# ---- NOTIFICATIONS

# Create test event 2 min from now with 1m reminder, then run the app to see the notification
test-notification:
  #!/usr/bin/env bash
  if date -d '+2 minutes' +%H:%M &>/dev/null; then
    start_time=$(date -d '+2 minutes' +%H:%M)
  else
    start_time=$(date -v+2M +%H:%M)
  fi
  caldir new "Test notification" --start "today ${start_time}" --reminder 1m
  echo "Event created at ${start_time} with 1m reminder. Notification should fire in ~1 minute."

clear-notification-cache:
  rm -f ~/.cache/rencal/delivered-reminders.json ~/.cache/rencal/last-reminder-check

# Build the standalone reminder daemon (Linux)
build-notifierd:
  cargo build --release --manifest-path src-tauri/Cargo.toml -p rencal-notifierd

# Install the reminder daemon binary + systemd user unit, then enable + start it.
# Also drops the rencal icon at the XDG user path so daemon notifications get
# the app icon (deb/rpm/AUR installs put it at /usr/share/icons/... instead).
# Idempotent — safe to re-run after rebuilds.
install-notifierd: build-notifierd
  install -Dm755 src-tauri/target/release/rencal-notifierd ~/.local/bin/rencal-notifierd
  install -d ~/.config/systemd/user
  sed 's|/usr/bin/rencal-notifierd|%h/.local/bin/rencal-notifierd|' \
    src-tauri/notifierd/rencal-notifierd.service \
    > ~/.config/systemd/user/rencal-notifierd.service
  install -Dm644 src-tauri/icons/128x128.png ~/.local/share/icons/hicolor/128x128/apps/rencal.png
  systemctl --user daemon-reload
  systemctl --user enable --now rencal-notifierd.service
  -systemctl --user restart rencal-notifierd.service
  @echo
  systemctl --user status rencal-notifierd.service --no-pager --lines=0

# Remove the reminder daemon and its systemd unit
uninstall-notifierd:
  -systemctl --user disable --now rencal-notifierd.service
  rm -f ~/.local/bin/rencal-notifierd
  rm -f ~/.config/systemd/user/rencal-notifierd.service
  rm -f ~/.local/share/icons/hicolor/128x128/apps/rencal.png
  systemctl --user daemon-reload

# Tail the reminder daemon's logs
notifierd-logs:
  journalctl --user -u rencal-notifierd.service -f
