#!/usr/bin/env bash
# Install the caldir provider binaries for the caldir release pinned in src-tauri/Cargo.toml.
set -euo pipefail

cd "$(dirname "$0")/.."

readonly manifest="src-tauri/Cargo.toml"
readonly checksums_file="src-tauri/caldir-providers.sha256"
readonly providers_dir="src-tauri/providers"
readonly version_file="$providers_dir/.caldir-version"
readonly -a providers=(google icloud outlook caldav webcal)

# The pinned tag is the one on the caldir-core line under [workspace.dependencies].
tag="$(sed -n 's/^caldir-core = .*tag = "\([^"]*\)".*/\1/p' "$manifest")"
if [[ -z "$tag" ]]; then
  echo "Could not read the caldir release tag from the caldir-core line in $manifest." >&2
  exit 1
fi

if [[ -n "${CALDIR_TARGET:-}" ]]; then
  target="$CALDIR_TARGET"
else
  case "$(uname -s):$(uname -m)" in
    Darwin:arm64 | Darwin:aarch64) target="aarch64-apple-darwin" ;;
    Darwin:x86_64) target="x86_64-apple-darwin" ;;
    Linux:aarch64 | Linux:arm64) target="aarch64-unknown-linux-musl" ;;
    Linux:x86_64) target="x86_64-unknown-linux-musl" ;;
    *)
      echo "No prebuilt caldir providers are available for $(uname -s) $(uname -m)." >&2
      exit 1
      ;;
  esac
fi

if [[ -f "$version_file" && "$(<"$version_file")" == local* ]]; then
  echo "Using locally built caldir providers ($(<"$version_file")). Delete $providers_dir to go back to caldir $tag." >&2
  exit 0
fi

providers_are_current() {
  [[ -f "$version_file" ]] || return 1
  [[ "$(<"$version_file")" == "$tag $target" ]] || return 1

  local provider
  for provider in "${providers[@]}"; do
    [[ -x "$providers_dir/caldir-provider-$provider" ]] || return 1
  done
}

if providers_are_current; then
  exit 0
fi

checksums_tag="$(sed -n 's/^# caldir \(v[^ ]*\) .*/\1/p' "$checksums_file")"
if [[ "$checksums_tag" != "$tag" ]]; then
  echo "$checksums_file is for caldir $checksums_tag but $manifest pins $tag." >&2
  echo "Run: just bump-caldir $tag" >&2
  exit 1
fi

archive="caldir-$target.tar.gz"
checksum="$(awk -v name="$archive" '$2 == name { print $1 }' "$checksums_file")"
if [[ ${#checksum} -ne 64 ]]; then
  echo "No checksum for $archive in $checksums_file: no prebuilt caldir providers for target $target." >&2
  exit 1
fi

url="https://github.com/t4t5/caldir/releases/download/$tag/$archive"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

echo "Downloading caldir providers $tag for $target..."
curl --fail --location --retry 3 --show-error --silent \
  --output "$tmp_dir/$archive" \
  "$url"

if command -v sha256sum >/dev/null 2>&1; then
  actual_checksum="$(sha256sum "$tmp_dir/$archive" | cut -d ' ' -f 1)"
else
  actual_checksum="$(shasum -a 256 "$tmp_dir/$archive" | cut -d ' ' -f 1)"
fi

if [[ "$actual_checksum" != "$checksum" ]]; then
  echo "Checksum verification failed for $archive." >&2
  echo "Expected: $checksum" >&2
  echo "Actual:   $actual_checksum" >&2
  exit 1
fi

tar -xzf "$tmp_dir/$archive" -C "$tmp_dir"
mkdir -p "$providers_dir"

for provider in "${providers[@]}"; do
  binary="caldir-provider-$provider"
  if [[ ! -f "$tmp_dir/$binary" ]]; then
    echo "The downloaded archive does not contain $binary." >&2
    exit 1
  fi
  install -m 755 "$tmp_dir/$binary" "$providers_dir/$binary"
done

printf '%s %s\n' "$tag" "$target" > "$version_file"
echo "Installed caldir providers $tag."
