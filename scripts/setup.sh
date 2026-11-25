#!/usr/bin/env sh
# Prepares everything `npm start` (mdk run) needs:
#   npm install       the mdk CLI, the vendor workers and apps (from GitHub) and
#                     the UI toolchain; the MDK version is the CLI's, pinned in
#                     package.json
#   vendor/mdk-satec  the SATEC power-meter worker, from the MDK release matching
#                     the CLI (scripts/fetch-satec.js)
#   ui/dist           the site UI the Gateway serves
#   .env              MDK_SITE_UI_DIST, the absolute path of ui/dist that
#                     mdk.yaml's gateway config reads
#
# Set NPM to wrap npm (e.g. NPM="sfw npm") if your environment requires it.
set -eu
# Fail on a missing or wrong credential instead of prompting for one.
export GIT_TERMINAL_PROMPT=0

ROOT=$(cd "$(dirname "$0")/.." && pwd)
NPM=${NPM:-npm}

cd "$ROOT"
$NPM install --no-audit --no-fund
node scripts/fetch-satec.js
$NPM run build:ui

{ grep -v '^MDK_SITE_UI_DIST=' .env 2>/dev/null || true; printf 'MDK_SITE_UI_DIST=%s/ui/dist\n' "$ROOT"; } > .env.tmp
mv .env.tmp .env

echo "setup: ready. Next: npm start"
