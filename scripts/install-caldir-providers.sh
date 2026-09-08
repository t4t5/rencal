#!/usr/bin/env bash
set -euo pipefail

readonly caldir_binaries_release="v0.13.1"
readonly providers_dir="src-tauri/providers"
readonly version_file="$providers_dir/.caldir-version"
readonly -a providers=(google icloud outlook caldav webcal)

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

providers_are_current() {
  [[ -f "$version_file" ]] || return 1
  [[ "$(<"$version_file")" == "$caldir_binaries_release $target" ]] || return 1

  local provider
  for provider in "${providers[@]}"; do
    [[ -x "$providers_dir/caldir-provider-$provider" ]] || return 1
  done
}

case "$target" in
  aarch64-apple-darwin)
    checksum="d007d20259c27b51be5690fdb36033218b8a259f5a342b627baded251104e0d7"
    ;;
  x86_64-apple-darwin)
    checksum="ff0495a0bd21c296ab5b5686d521cdce4506e6c21e10cb3e769343b71c300fc8"
    ;;
  aarch64-unknown-linux-musl)
    checksum="0c212791751f053ce32efdd1f232a48552460247b001e1cc7a13fc613416511f"
    ;;
  x86_64-unknown-linux-musl)
    checksum="9990fead337e581ce1a6db0af41fbd0436c9a8672880864e4ebe7845254b4c57"
    ;;
  *)
    echo "No prebuilt caldir providers are available for target $target." >&2
    exit 1
    ;;
esac

if providers_are_current; then
  exit 0
fi

archive="caldir-$target.tar.gz"
url="https://github.com/t4t5/caldir/releases/download/$caldir_binaries_release/$archive"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

echo "Downloading caldir providers $caldir_binaries_release for $target..."
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

printf '%s %s\n' "$caldir_binaries_release" "$target" > "$version_file"
echo "Installed caldir providers $caldir_binaries_release."
