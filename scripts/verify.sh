#!/usr/bin/env bash
# Full verification for the Nuxt taskboard fixture:
#
#   1. clean production install -> rm -rf node_modules && npm ci (frozen lockfile)
#   2. scripts/build.sh -> release marker (VERSION) + `nuxt build` (.output)
#   3. `nuxt typecheck` -> strict Vue/TS typecheck over the project
#   4. `node --check scripts/browser-smoke.js` -> client/script syntax check
#   5. scripts/smoke.sh -> real production process: CRUD over HTTP, negatives,
#      search/filter, graceful-stop restart persistence, database-unavailable
#      readiness, and a real headless-browser check via playwright-core
#
# Usage:
#   scripts/verify.sh
#
# Exit codes: 0 = all checks passed, nonzero = a check failed. The first
# failing step aborts with its own nonzero code.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NODE="${NODE:-$(command -v node)}"
NPM="${NPM:-$(command -v npm)}"
[ -x "$NODE" ] || { echo "node executable not found" >&2; exit 1; }
[ -x "$NPM" ] || { echo "npm executable not found" >&2; exit 1; }

step() { printf '\n=== %s ===\n' "$*"; }

step "clean production install with frozen lockfile"
(cd "$ROOT" && rm -rf node_modules .nuxt .output && "$NPM" ci --no-audit --no-fund)

step "build release marker + production build (scripts/build.sh)"
"$ROOT/scripts/build.sh"

step "strict typecheck (nuxt typecheck)"
(cd "$ROOT" && npx nuxt typecheck)

step "client/script syntax check (node --check)"
"$NODE" --check "$ROOT/scripts/browser-smoke.js"

step "production smoke: real process + CRUD + negatives + persistence + readiness + browser"
"$ROOT/scripts/smoke.sh"

step "verification complete (all steps passed)"
printf '%s\n' "node: $("$NODE" --version)"
printf '%s\n' "npm: $("$NPM" --version)"
printf '%s\n' "node_modules installed: $([ -d "$ROOT/node_modules" ] && echo yes || echo no)"
printf '%s\n' "release marker: $(cat "$ROOT/VERSION")"