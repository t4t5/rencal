#!/usr/bin/env bash
# Dumps the computed value of every documented theme token, for every built-in
# theme plus sample Omarchy palettes, into crates/rencal-theme/tests/fixtures/.
# These are the parity oracle for the Rust resolver (GPUI_PORT_PLAN.md §4.2).
#
# The CSS is the app's own production build (Tailwind + the rencal-themes Vite
# plugin), evaluated by headless Chromium. Chromium comes from nixpkgs unless
# CHROMIUM points at a binary.
set -euo pipefail

cd "$(dirname "$0")/../../.."
here=scripts/fixtures/themes
out=crates/rencal-theme/tests/fixtures
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

pnpm exec vite build --outDir "$work/build" --emptyOutDir --logLevel error >/dev/null
css=("$work"/build/assets/index-*.css)
if [[ ${#css[@]} -ne 1 ]]; then
  echo "Expected one CSS bundle in $work/build/assets." >&2
  exit 1
fi

# Built-ins as listed in the manifest, plus the dev-only contract probe.
themes_json="$(
  sed -nE 's/.*\{ id: "([^"]+)", name: "[^"]+", appearance: "(light|dark)" \}.*/{"id":"\1","appearance":"\2"}/p' \
    src/themes/manifest.ts | paste -sd, -
)"
themes_json="[${themes_json},{\"id\":\"contract-debug\",\"appearance\":\"dark\"}]"

cat >"$work/probe.html" <<EOF
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<link rel="stylesheet" href="file://${css[0]}">
</head>
<body>
<pre id="out"></pre>
<script>
window.RENCAL_FIXTURE_INPUT = {
  themes: ${themes_json},
  omarchy: $(cat "$here/omarchy-samples.json"),
};
</script>
<script src="file://$PWD/$here/probe.js"></script>
</body>
</html>
EOF

if [[ -n "${CHROMIUM:-}" ]]; then
  chromium=("$CHROMIUM")
else
  chromium=(nix --extra-experimental-features 'nix-command flakes' shell nixpkgs#chromium -c chromium)
fi
"${chromium[@]}" --headless --disable-gpu --no-sandbox --allow-file-access-from-files \
  --user-data-dir="$work/profile" --dump-dom "file://$work/probe.html" 2>/dev/null >"$work/dom.html"

mkdir -p "$out"
python3 - "$work/dom.html" "$out" <<'PY'
import html, json, pathlib, re, sys

dom = pathlib.Path(sys.argv[1]).read_text()
match = re.search(r'<pre id="out">(.*?)</pre>', dom, re.S)
if not match or not match.group(1).strip():
    sys.exit("probe produced no output; open the generated probe.html in a browser to debug")
data = json.loads(html.unescape(match.group(1)))
out = pathlib.Path(sys.argv[2])
for old in out.glob("*.json"):
    old.unlink()
for theme_id, theme in data["themes"].items():
    name = theme_id.replace(":", "-")
    body = {"generator": data["generator"], "id": theme_id, **theme}
    (out / f"{name}.json").write_text(json.dumps(body, indent=2) + "\n")
    print(f"wrote {out / name}.json")
PY
