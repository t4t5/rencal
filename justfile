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
  cargo check --manifest-path src-tauri/Cargo.toml
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
  rm -f ~/.cache/rencal/last-reminder-check
