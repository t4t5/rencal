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

# Generate new sqlite migration
migrate name:
  pnpm drizzle-kit generate --name {{name}}

# Check Rust and TypeScript types
check:
  cargo check --manifest-path src-tauri/Cargo.toml
  @just typecheck

# Check TypeScript types only
typecheck:
  pnpm typecheck

# Reset the database completely
reset:
  rm $HOME/.config/rencal/rencal.db

# Analyze which parts of app are slow based on ChromeDevTool recording:
analyze path:
  bun scripts/analyze-recording.ts {{path}}

# Create test event 1 min from now with 1m reminder, then run the app to see the notification
test-notification:
  #!/usr/bin/env bash
  if date -d '+1 minute' +%H:%M &>/dev/null; then
    in_1_min=$(date -d '+1 minute' +%H:%M)
  else
    in_1_min=$(date -v+1M +%H:%M)
  fi
  caldir new "Test notification" --start "today ${in_1_min}" --reminder 1m
  echo "Event created at ${in_1_min} with 1m reminder. Run 'just dev' and wait ~1 minute for the notification."
