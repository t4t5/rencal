install:
  pnpm install

dev:
  pnpm tauri dev

check:
  cargo check --manifest-path src-tauri/Cargo.toml
  pnpm typecheck
