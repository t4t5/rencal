install:
  pnpm install

[working-directory: 'src-tauri']
build:
  cargo build

dev:
  pnpm tauri dev

check:
  cargo check --manifest-path src-tauri/Cargo.toml
  pnpm typecheck
