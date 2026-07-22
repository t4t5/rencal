#!/usr/bin/env bash
set -euo pipefail

linux_src="src-tauri/icons-src/linux.svg"
mac_src="src-tauri/icons-src/mac.svg"
out_dir="src-tauri/icons"

if [[ ! -f "$linux_src" ]]; then
  echo "Missing $linux_src" >&2
  exit 1
fi
if [[ ! -f "$mac_src" ]]; then
  echo "Missing $mac_src" >&2
  exit 1
fi

# Remove outputs from older versions of this script, then generate only the
# desktop assets referenced by tauri.conf.json and the Linux package config.
rm -rf "$out_dir/ios" "$out_dir/android" "$out_dir/macos" "$out_dir/windows"
rm -f "$out_dir/64x64.png" "$out_dir/icon.png" "$out_dir/master.png"
rm -rf "$out_dir/linux"
mkdir -p "$out_dir/linux"
cp "$linux_src" "$out_dir/linux/icon.svg"

# Linux: Tauri uses these PNGs for its bundles, while desktop environments can
# render the packaged SVG sharply at any scale.
for spec in "32:32x32.png" "128:128x128.png" "256:128x128@2x.png"; do
  size="${spec%%:*}"
  filename="${spec#*:}"
  magick -background none "$linux_src" \
    -resize "${size}x${size}" \
    -alpha on \
    -strip \
    -define png:color-type=6 \
    -define png:exclude-chunk=bKGD \
    "PNG32:$out_dir/$filename"
done

# Windows: embed common display sizes in one multi-resolution ICO.
magick -background none "$linux_src" \
  -alpha on \
  -define icon:auto-resize=256,128,64,48,32,16 \
  "$out_dir/icon.ico"

# macOS: let Tauri generate the multi-resolution ICNS. Other generated platform
# assets stay in the temporary directory because renCal is desktop-only.
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT
pnpm tauri icon "$mac_src" -o "$tmp_dir"
cp "$tmp_dir/icon.icns" "$out_dir/icon.icns"
