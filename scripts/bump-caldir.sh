#!/usr/bin/env bash
# Move caldir-core and the provider binaries to a caldir release, e.g. `scripts/bump-caldir.sh v0.13.1`.
# Regenerates src-tauri/caldir-providers.sha256 from the release's asset digests.
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <tag>" >&2
  exit 1
fi

readonly tag="$1"
readonly manifest="src-tauri/Cargo.toml"
readonly checksums="src-tauri/caldir-providers.sha256"
readonly -a targets=(
  aarch64-apple-darwin
  x86_64-apple-darwin
  aarch64-unknown-linux-musl
  x86_64-unknown-linux-musl
)

trap 'rm -f "$checksums.tmp"' EXIT

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

mv "$checksums.tmp" "$checksums"

# -i.bak works on both GNU and BSD sed.
sed -i.bak -E "s|^(caldir-core = .*tag = \")[^\"]*(\".*)$|\1$tag\2|" "$manifest"
rm "$manifest.bak"
grep -q "^caldir-core = .*tag = \"$tag\"" "$manifest"

cargo fetch --manifest-path "$manifest"
scripts/install-caldir-providers.sh
