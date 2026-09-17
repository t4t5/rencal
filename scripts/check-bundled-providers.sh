#!/usr/bin/env bash
# Check the actual Linux packages, not the intermediate AppDir. An optional bundle
# directory lets release CI check downloaded artifacts using the same test.
set -euo pipefail
shopt -s nullglob

cd "$(dirname "$0")/.."
bundle="$(realpath "${1:-src-tauri/target/release/bundle}")"
appimages=("$bundle"/appimage/*.AppImage)
debs=("$bundle"/deb/*.deb)
if [[ ${#appimages[@]} -ne 1 || ${#debs[@]} -ne 1 ]]; then
  echo "Expected exactly one AppImage and one deb in $bundle/{appimage,deb}." >&2
  exit 1
fi

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/appimage" "$work/deb"
# Extraction does not require FUSE or a desktop session.
(cd "$work/appimage" && "${appimages[0]}" --appimage-extract >/dev/null)
data_archive="$(ar t "${debs[0]}" | grep -E '^data\.tar(\.(gz|xz|zst|bz2))?$')"
ar p "${debs[0]}" "$data_archive" > "$work/$data_archive"
tar -xf "$work/$data_archive" -C "$work/deb"

status=0
for provider in google icloud outlook caldav webcal; do
  name="caldir-provider-$provider"
  input="src-tauri/providers/$name"
  if [[ ! -s "$input" || ! -x "$input" ]]; then
    echo "Missing or empty input provider: $input (install real providers first)." >&2
    status=1
    continue
  fi
  for copy in \
    "$work/appimage/squashfs-root/usr/libexec/renCal/providers/$name" \
    "$work/deb/usr/lib/renCal/providers/$name"; do
    if ! cmp --silent "$input" "$copy"; then
      echo "Packaging modified or dropped $copy" >&2
      status=1
    fi
    if [[ ! -x "$copy" ]]; then
      echo "Provider is missing or not executable: $copy" >&2
      status=1
      continue
    fi
    if ! dynamic="$(readelf -dW "$copy")"; then
      echo "Could not read ELF metadata: $copy" >&2
      status=1
    elif grep -qE 'RPATH|RUNPATH' <<< "$dynamic"; then
      echo "Provider has an RPATH/RUNPATH: $copy" >&2
      status=1
    fi
    # A corrupted musl static-PIE dies before main(), even with --help.
    if ! timeout 10s "$copy" --help >"$work/startup.log" 2>&1; then
      echo "Provider failed to start: $copy" >&2
      cat "$work/startup.log" >&2
      status=1
    fi
  done
done

if [[ -e "$work/appimage/squashfs-root/usr/lib/renCal/providers" ]]; then
  echo "AppImage still ships providers under usr/lib/renCal/providers (linuxdeploy rewrites these)." >&2
  status=1
fi
if [[ $status -eq 0 ]]; then
  echo "All five providers are byte-identical, have no RPATH/RUNPATH, and start in both packages."
fi
exit "$status"
