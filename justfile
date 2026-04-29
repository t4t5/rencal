# List all available tasks
default:
  @just --list

# Install NPM dependencies
install:
  pnpm install

# Generate app icons from 1024x1024 master.png
icons:
  pnpm tauri icon src-tauri/icons/master.png

# See the size of dependencies:
bundlesize:
  npx vite-bundle-visualizer

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

# Run app (dev mode)
dev: build-providers
  pnpm tauri dev

# Build the app for production
build: build-providers-release
  #!/usr/bin/env bash
  set -euo pipefail
  # Linux deb/rpm bundles ship the reminder daemon — build it first so
  # tauri-bundler can pick it up via bundle.linux.{deb,rpm}.files.
  if [[ "$(uname -s)" == "Linux" ]]; then
    cargo build --release --manifest-path src-tauri/Cargo.toml -p rencal-notifierd
  fi
  NO_STRIP=true pnpm tauri build

# Build, sign, and notarize the app for distribution (requires .env with Apple credentials)
notarize: build-providers-release
  #!/usr/bin/env bash
  set -euo pipefail
  set -a && source .env && set +a
  # Sign bundled provider binaries with hardened runtime + secure timestamp
  for bin in src-tauri/providers/caldir-provider-*; do
    codesign --sign "$APPLE_SIGNING_IDENTITY" --timestamp --options runtime --force "$bin"
  done
  NO_STRIP=true pnpm tauri build

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
