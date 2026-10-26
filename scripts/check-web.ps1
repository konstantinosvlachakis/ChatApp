# Type-check, unit-test and build the web app (the build also prerenders public routes).
# Usage: scripts\check-web.ps1 [-SkipBuild]
param([switch]$SkipBuild)
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..\frontend")

npx tsc --noEmit -p .
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$env:CI = "true"
npx react-scripts test --watchAll=false --passWithNoTests
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if (-not $SkipBuild) {
  # CRA fails the build on lint warnings when CI=true; match the Heroku build.
  $env:CI = "false"
  npm run build
  exit $LASTEXITCODE
}
