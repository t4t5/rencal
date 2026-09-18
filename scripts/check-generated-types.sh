#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
snapshot=$(mktemp -d)
trap 'rm -rf "$snapshot"' EXIT
artifacts=(bindings.ts events.generated.ts)

# Compare against the working tree so this also works before changes are committed.
for artifact in "${artifacts[@]}"; do
  cp "src/rpc/$artifact" "$snapshot/$artifact"
done
just gen-types
for artifact in "${artifacts[@]}"; do
  diff -u "$snapshot/$artifact" "src/rpc/$artifact"
done
