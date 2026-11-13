#!/usr/bin/env bash
# Move caldir-core and the provider binaries to a caldir release, e.g. `scripts/bump-caldir.sh v0.14.1`.
# Pins caldir-core to the version in that release in both backends (src-tauri
# and the NSH app's app/native), regenerates their caldir-providers.sha256 from
# the release's asset digests and updates the matching Nix flake input when Nix is installed.
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <tag>" >&2
  exit 1
fi

readonly tag="$1"
readonly -a backends=(src-tauri app/native)
readonly checksums="${backends[0]}/caldir-providers.sha256"
readonly flake="flake.nix"
readonly -a targets=(
  aarch64-apple-darwin
  x86_64-apple-darwin
  aarch64-unknown-linux-musl
  x86_64-unknown-linux-musl
)

trap 'rm -f "$checksums.tmp"' EXIT

core_version="$(
  gh api -H 'Accept: application/vnd.github.raw' \
    "repos/t4t5/caldir/contents/caldir-core/Cargo.toml?ref=$tag" |
    sed -n 's/^version = "\([^"]*\)".*/\1/p' | head -n 1
)"
if [[ -z "$core_version" ]]; then
  echo "Could not read the caldir-core version from caldir $tag." >&2
  exit 1
fi

{
  echo "# caldir $tag release assets. Regenerate with: just bump-caldir <tag>"
  gh api "repos/t4t5/caldir/releases/tags/$tag" \
    --jq '.assets[] | select(.name | startswith("caldir-")) | "\(.digest | ltrimstr("sha256:"))  \(.name)"'
} > "$checksums.tmp"

for target in "${targets[@]}"; do
  if ! grep -Eq "^[0-9a-f]{64}  caldir-$target\.tar\.gz$" "$checksums.tmp"; then
    echo "Release $tag has no sha256 digest for caldir-$target.tar.gz." >&2
    exit 1
  fi
done

for backend in "${backends[@]}"; do
  manifest="$backend/Cargo.toml"
  cp "$checksums.tmp" "$backend/caldir-providers.sha256"

  # -i.bak works on both GNU and BSD sed.
  sed -i.bak -E "s|^(provider-tag = \")[^\"]*(\".*)$|\1$tag\2|" "$manifest"
  rm "$manifest.bak"
  grep -q "^provider-tag = \"$tag\"" "$manifest"

  sed -i.bak -E "s|^(caldir-core = \")[^\"]*(\".*)$|\1$core_version\2|" "$manifest"
  rm "$manifest.bak"
  grep -q "^caldir-core = \"$core_version\"" "$manifest"
  cargo update --manifest-path "$manifest" -p caldir-core --precise "$core_version"
done

if command -v nix >/dev/null; then
  sed -i.bak -E "s|^( *url = \"github:t4t5/caldir/)[^\"]*(\";)$|\1$tag\2|" "$flake"
  rm "$flake.bak"
  grep -q "^ *url = \"github:t4t5/caldir/$tag\";" "$flake"
  nix flake update caldir
fi

scripts/install-caldir-providers.sh
