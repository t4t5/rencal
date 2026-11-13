#!/usr/bin/env bash
# Write a release's two update manifests from the archives `nsh package` made.
#
#   nsh-latest.json + latest.json.sig   what the NSH app reads (app/nsh.json "updater")
#   latest.json                         what renCal up to v0.9, built on Tauri, reads
#
# The second moves those installs to this release: their updater only needs a
# signed archive holding the .app. Drop it once nobody is left on v0.9.
#
# Usage: scripts/write-update-manifests.sh <out_dir> <archive>...
# Needs NSH_UPDATE_KEY (the contents of `nsh keygen`'s .secret, whose .pub is
# updater.publicKey) and, with a macOS archive, TAURI_SIGNING_PRIVATE_KEY and
# TAURI_SIGNING_PRIVATE_KEY_PASSWORD. NOTES_FILE names a file with what changed.
set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <out_dir> <archive>..." >&2
  exit 1
fi

readonly repo="t4t5/rencal"
out="$(mkdir -p "$1" && cd "$1" && pwd)"
shift
archives=()
for archive in "$@"; do
  archives+=("$(realpath "$archive")")
done

cd "$(dirname "$0")/../app"
version="$(jq -r .version nsh.json)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

: "${NSH_UPDATE_KEY:?Set NSH_UPDATE_KEY to the update signing key.}"
(umask 077 && printf '%s' "$NSH_UPDATE_KEY" > "$work/update.secret")

notes_args=()
if [[ -n "${NOTES_FILE:-}" ]]; then
  notes_args=(--notes "$NOTES_FILE")
fi

nsh update-manifest "${archives[@]}" --key "$work/update.secret" "${notes_args[@]}" --out "$work"
# The NSH app looks for the signature under this name next to its manifest.
mv "$work/latest.json" "$out/nsh-latest.json"
mv "$work/latest.json.sig" "$out/latest.json.sig"

# The old updater's manifest: one entry per macOS archive, the only platform it updates.
platforms="{}"
for archive in "${archives[@]}"; do
  name="$(basename "$archive")"
  case "$name" in
    *-macos-aarch64.tar.gz) platform="darwin-aarch64" ;;
    *-macos-x86_64.tar.gz) platform="darwin-x86_64" ;;
    *) continue ;;
  esac

  # It replaces the installed .app with the archive's one top-level directory.
  roots="$(tar -tzf "$archive" | cut -d/ -f1 | sort -u)"
  if [[ "$roots" != *.app || "$(wc -l <<< "$roots")" -ne 1 ]]; then
    echo "$name must hold exactly one .app at its top level, found: $roots" >&2
    exit 1
  fi

  : "${TAURI_SIGNING_PRIVATE_KEY:?Set TAURI_SIGNING_PRIVATE_KEY to sign $name for v0.9 installs.}"
  cp "$archive" "$work/$name"
  npx --yes @tauri-apps/cli@2 signer sign "$work/$name" >/dev/null
  platforms="$(
    jq --arg platform "$platform" \
      --arg url "https://github.com/$repo/releases/download/v$version/$name" \
      --rawfile signature "$work/$name.sig" \
      '.[$platform] = { signature: $signature, url: $url }' <<< "$platforms"
  )"
done

if [[ "$platforms" == "{}" ]]; then
  echo "No macOS archive given: latest.json for v0.9 installs was not written." >&2
  exit 0
fi

jq -n --arg version "$version" \
  --arg notes "$([[ -n "${NOTES_FILE:-}" ]] && cat "$NOTES_FILE" || true)" \
  --arg pub_date "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --argjson platforms "$platforms" \
  '{ version: $version, notes: $notes, pub_date: $pub_date, platforms: $platforms }' \
  > "$out/latest.json"
