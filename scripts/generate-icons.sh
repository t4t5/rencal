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

rm -rf "$out_dir/ios" "$out_dir/android"
mkdir -p "$out_dir/linux" "$out_dir/macos" "$out_dir/windows"
cp "$linux_src" "$out_dir/linux/icon.svg"
cp "$mac_src" "$out_dir/macos/icon.svg"

# Linux: ship a real SVG plus common hicolor PNG sizes so launchers do not
# upscale a low-resolution icon.
for size in 16 24 32 48 64 128 256 512 1024; do
  magick -background none "$linux_src" \
    -resize "${size}x${size}" \
    -alpha on \
    -strip \
    -define png:color-type=6 \
    -define png:exclude-chunk=bKGD \
    "PNG32:$out_dir/linux/${size}x${size}.png"
done

# Windows: generate a multi-size ICO from the Linux artwork by default.
magick -background none "$linux_src" \
  -alpha on \
  -define icon:auto-resize=256,128,64,48,32,16 \
  "$out_dir/windows/icon.ico"

# macOS: let Tauri generate the ICNS from the macOS-specific artwork.
# Tauri also emits mobile icons, but they stay in this temp directory and are
# discarded because renCal is desktop-only.
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT
pnpm tauri icon "$mac_src" -o "$tmp_dir/macos"
cp "$tmp_dir/macos/icon.icns" "$out_dir/macos/icon.icns"

# Keep Tauri's current root-level icon paths populated for compatibility with
# tauri.conf.json and notification resources.
cp "$out_dir/linux/32x32.png" "$out_dir/32x32.png"
cp "$out_dir/linux/64x64.png" "$out_dir/64x64.png"
cp "$out_dir/linux/128x128.png" "$out_dir/128x128.png"
cp "$out_dir/linux/256x256.png" "$out_dir/128x128@2x.png"
cp "$out_dir/linux/512x512.png" "$out_dir/icon.png"
cp "$out_dir/linux/1024x1024.png" "$out_dir/master.png"
cp "$out_dir/macos/icon.icns" "$out_dir/icon.icns"
cp "$out_dir/windows/icon.ico" "$out_dir/icon.ico"
