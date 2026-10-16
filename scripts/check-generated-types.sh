#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
snapshot=$(mktemp -d)
trap 'rm -rf "$snapshot"' EXIT
artifacts=(src/rpc/bindings.ts src/rpc/events.generated.ts packages/sdk/index.d.ts)

# Compare against the working tree so this also works before changes are committed.
for artifact in "${artifacts[@]}"; do
  mkdir -p "$snapshot/$(dirname "$artifact")"
  cp "$artifact" "$snapshot/$artifact"
done
just gen-types
just sdk
for artifact in "${artifacts[@]}"; do
  diff -u "$snapshot/$artifact" "$artifact"
done
