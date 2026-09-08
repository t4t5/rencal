#!/usr/bin/env bash
# Build the provider binaries from a local caldir checkout instead of the pinned release.
# Usage: scripts/build-local-caldir-providers.sh [caldir_repo]  (default: ../caldir, relative to the repo root)
# Delete src-tauri/providers/ to go back to the pinned release.
set -euo pipefail

cd "$(dirname "$0")/.."

readonly caldir_repo="${1:-../caldir}"
readonly providers_dir="src-tauri/providers"
readonly -a providers=(google icloud outlook caldav webcal)

if [[ ! -f "$caldir_repo/Cargo.toml" ]]; then
  echo "No caldir checkout found at $caldir_repo." >&2
  exit 1
fi

cargo build --manifest-path "$caldir_repo/Cargo.toml" "${providers[@]/#/--package=caldir-provider-}"

mkdir -p "$providers_dir"
for provider in "${providers[@]}"; do
  cp "$caldir_repo/target/debug/caldir-provider-$provider" "$providers_dir/"
done

echo "local $caldir_repo" > "$providers_dir/.caldir-version"
echo "Installed caldir providers built from $caldir_repo."
