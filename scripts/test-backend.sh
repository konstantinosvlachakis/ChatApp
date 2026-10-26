#!/usr/bin/env bash
# Run the Django test suite against local SQLite with every external service disabled.
# Usage: scripts/test-backend.sh [test labels...]   (default: chatapp)
set -euo pipefail
cd "$(dirname "$0")/../backend"

export DJANGO_ENV=local
export USE_REDIS_REALTIME=false
export CLOUDINARY_URL=
export GEMINI_API_KEY=
export DATABASE_URL=
# Quiet logs (tests deliberately trigger errors) and never report to Sentry.
export DJANGO_LOG_LEVEL=CRITICAL
export SENTRY_DSN=

python manage.py test "${@:-chatapp}"
