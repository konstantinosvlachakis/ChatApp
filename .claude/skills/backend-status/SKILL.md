---
name: backend-status
description: Current state of the LangVoyage Django backend (backend/) — models, API and websocket routes, auth/CSRF/throttling model, security invariants, env var names, how to run tests, and open issues. Load before changing or reviewing anything under backend/.
---

# Backend status (Django + DRF + Channels)

Last verified: 2026-10-26 at commit `79ec3a9`. Refresh: `git log --oneline 79ec3a9..HEAD -- backend` — re-read only changed files, then update this file.

## Map
- `core/settings.py` — env-driven config; `DJANGO_ENV` picks local vs production. `core/asgi.py` (Channels), `core/urls.py` (API under `/api/`, `/media/`, SPA fallback), `core/views.py` (serves frontend build; path-traversal guarded).
- `chatapp/models.py` — `Profile` (custom user: username, email, native_language, languages_practicing[list], practice_language_levels{dict}, bio, learning_goal, location, presence fields, avatar ring), `PracticeStats`, legacy `Token`, `Conversation` (sender/receiver pair), `Message` (text, attachment, reply_to, status, edited_at, pinned_*), `MessageTranslation`, `MessageReaction`, `BlockedUser`, `UserReport`, `ProfileView`.
- `chatapp/views.py` — most REST views (profile, community, conversations, messages, translate, react, pin, practice, coach). `auth_views.py` — JWT obtain/refresh (cookie-setting), logout. `authentication.py` — cookie/Bearer JWT auth with CSRF enforcement for cookie auth. `throttles.py` — scoped throttles.
- `chatapp/consumers.py` — `ChatConsumer` (`ws/socket-server/<conversation_id>/`), `PresenceConsumer` (`ws/presence/`). `routing.py`.
- `chatapp/gemini.py` — coach client (key in `x-goog-api-key` header, timeouts → "coach unavailable").
- `chatapp/serializers.py` — public `ProfileSerializer` must NOT include email/date_of_birth.
- Management commands: `load_dummy_data`, `prewarm_daily_practice`. Latest migration: `0030_profileview`.

URL names: token_obtain_pair, token_refresh, logout, login (legacy), register, profile, delete_account, moderation_summary, presence_offline, coach_chat, profile_data, public_profile, block_user, report_user, profile_edit, profile_location_update, update_profile_image, conversation_list, conversation_messages, mark_conversation_read, delete_message, edit_message, translate_message, react_to_message, pin_message, practice_state, practice_challenge, practice_submit.

## Security invariants (keep these true; tests in `tests/test_security.py`)
- Every conversation/message endpoint checks the user is a participant (403 otherwise). Blocking is respected.
- Chat websocket: requires auth (cookie with Origin check, Bearer header, or legacy `?token=`), numeric room id, participant only; closes 4401 (unauthenticated) / 4403 (forbidden). Sender name/id set server-side. 64 KB frame cap.
- Uploads: image/video/audio only (no SVG), 25 MB attachments / 10 MB profile images, server-generated filenames.
- Cookie-authenticated unsafe requests require `X-CSRFToken` (`AUTH_COOKIE_ENFORCE_CSRF`, keep true).
- Throttles: `auth` 20/min per IP, translate 60/min, reports 20/hour, plus global user/anon. `DRF_NUM_PROXIES=1` in prod.
- Registration uses Django password validators; username `^[\w.@+-]{1,30}$`; email lowercased.
- Coach: mode allow-listed, language sanitised, 2000-char cap, 200/day per user. Messages/translation capped at 5000 chars.
- Errors return generic messages; details are logged, never returned.

## Env var names (values never in repo)
Core: `DJANGO_ENV`, `DJANGO_SECRET_KEY`, `DATABASE_URL`/`NEON_DATABASE_URL`, `REDIS_URL`/`REDISCLOUD_URL`/`REDIS_CACHE_URL`, `USE_REDIS_REALTIME`, `CLOUDINARY_URL`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_TIMEOUT_SECONDS`, `DJANGO_ALLOWED_HOSTS`.
Hardening (all optional, safe defaults): `SECURE_HSTS_*`, `DRF_THROTTLE_{AUTH,USER,ANON,TRANSLATE,REPORT}`, `DRF_NUM_PROXIES`, `AUTH_COOKIE_ENFORCE_CSRF`, `COACH_CHAT_DAILY_LIMIT`, `COACH_CHAT_MAX_MESSAGE_LENGTH`, `MESSAGE_MAX_LENGTH`, `TRANSLATION_MAX_LENGTH`, `MESSAGE_ATTACHMENT_MAX_BYTES`, `PROFILE_IMAGE_MAX_BYTES`, `WS_MAX_MESSAGE_BYTES`.

## Run tests (local sqlite, no external services)
```bash
cd backend && DJANGO_ENV=local USE_REDIS_REALTIME=false CLOUDINARY_URL= GEMINI_API_KEY= DATABASE_URL= python manage.py test chatapp
```
Baseline: **65 tests, all passing** (2026-10-26). Test helpers in `tests/factory.py`.

## Open issues
Refresh-token rotation/blacklist missing; legacy `/api/login/` + `Token` to delete; `?token=` ws auth to remove; relay trusts client `attachmentUrl`; `/media/` unauthenticated; practice replay farming; presence ignores blocks; non-numeric `message_id` in translate → 500; throttles per-process without Redis; `requirements.txt` UTF-16 and local Django 5.1.6 vs pinned 5.2.5; admin unusable (no `is_staff`).
