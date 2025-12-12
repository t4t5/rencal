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

storybook:
  pnpm storybook

vortex:
  pnpm vortex
