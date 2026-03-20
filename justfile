# List all available tasks
default:
  @just --list

# Install NPM dependencies
install:
  pnpm install

# Run app (dev mode)
dev:
  pnpm tauri dev

# Build the app for production
build:
  NO_STRIP=true pnpm tauri build

# Generate TypeScript bindings from Rust types
[working-directory: 'src-tauri']
gen-types:
  cargo run --bin gen_types

# Test production version of app (needs build first)
start:
  src-tauri/target/release/bundle/appimage/rencal_0.1.0_amd64.AppImage

# Check Rust and TypeScript types
check:
  cargo check --manifest-path src-tauri/Cargo.toml
  @just typecheck

# Check TypeScript types only
typecheck:
  pnpm typecheck

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
  /Users/tristan/.cargo/bin/caldir new "Test notification" --start "today ${start_time}" --reminder 1m
  echo "Event created at ${start_time} with 1m reminder. Notification should fire in ~1 minute."
