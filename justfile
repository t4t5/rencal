install:
  pnpm install

[working-directory: 'src-tauri']
build:
  cargo build

dev:
  pnpm tauri dev

generate:
  pnpm tauri build

check:
  cargo check --manifest-path src-tauri/Cargo.toml
  @just typecheck

typecheck:
  pnpm typecheck

reset:
  rm $HOME/.config/sequence/sequence.db
