# Run the Django test suite against local SQLite with every external service disabled.
# Usage: scripts\test-backend.ps1 [test labels...]   (default: chatapp)
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..\backend")

$env:DJANGO_ENV = "local"
$env:USE_REDIS_REALTIME = "false"
$env:CLOUDINARY_URL = ""
$env:GEMINI_API_KEY = ""
$env:DATABASE_URL = ""
# Quiet logs (tests deliberately trigger errors) and never report to Sentry.
$env:DJANGO_LOG_LEVEL = "CRITICAL"
$env:SENTRY_DSN = ""

$labels = if ($args.Count -gt 0) { $args } else { @("chatapp") }
python manage.py test @labels
exit $LASTEXITCODE
