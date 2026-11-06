#!/usr/bin/env bash
# `nsh test` bundles each test from `.nsh/test/`, where it finds no `nsh.json`
# and so none of the app's import aliases. Give it one, then run the tests.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p .nsh/test
cat > .nsh/test/nsh.json <<'JSON'
{
  "resolve": {
    "alias": {
      "@js-temporal/polyfill": "../../lib/temporal.ts",
      "@": "../.."
    }
  }
}
JSON
exec nsh test . "$@"
