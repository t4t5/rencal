install:
  pnpm install

build:
  pnpm tauri build

# Build without bundling (just the binary)
build-bin:
  pnpm build
  cargo build --release --manifest-path src-tauri/Cargo.toml

dev:
  pnpm tauri dev

check:
  cargo check --manifest-path src-tauri/Cargo.toml
  @just typecheck

typecheck:
  pnpm typecheck

reset:
  rm $HOME/.config/rencal/rencal.db
