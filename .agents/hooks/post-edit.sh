#!/usr/bin/env bash
# PostToolUse hook: typecheck + lint after frontend edits, cargo check after Rust edits.
# Exit 2 feeds the compiler output back to Claude.
set -uo pipefail
root=$(cd "$(dirname "$0")/../.." && pwd)
cd "$root"
file=$(jq -r '.tool_input.file_path // .tool_response.filePath // empty')
case "$file" in
  "$root"/src-tauri/*.rs)
    out=$(cargo check --workspace --manifest-path src-tauri/Cargo.toml -q 2>&1) || { echo "$out" >&2; exit 2; } ;;
  "$root"/src/*.ts|"$root"/src/*.tsx)
    out=$(pnpm exec tsc --noEmit 2>&1) || { echo "$out" >&2; exit 2; }
    out=$(pnpm exec eslint "$file" 2>&1) || { echo "$out" >&2; exit 2; } ;;
esac
exit 0
