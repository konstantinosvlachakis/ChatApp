#!/usr/bin/env bash
# Type-check, unit-test and build the web app (the build also prerenders public routes).
# Usage: scripts/check-web.sh [--skip-build]
set -euo pipefail
cd "$(dirname "$0")/../frontend"

npx tsc --noEmit -p .
CI=true npx react-scripts test --watchAll=false --passWithNoTests

if [[ "${1:-}" != "--skip-build" ]]; then
  # CRA fails the build on lint warnings when CI=true; match the Heroku build.
  CI=false npm run build
fi
