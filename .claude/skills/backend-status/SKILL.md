---
name: backend-status
description: Current state of the LangVoyage Django backend (backend/) — models, API and websocket routes, auth/CSRF/throttling model, security invariants, env var names, how to run tests, and open issues. Load before changing or reviewing anything under backend/.
---

# Backend status (Django + DRF + Channels)

Last verified: 2026-10-27 at commit `b57487f`; updated in PRs `fix/reliability`, `feat/api-resilience`, `perf/backend-db` (#29, merged) and `fix/chat-races` (pending: practice submit idempotency). Refresh: `git log --oneline b57487f..HEAD -- backend` — re-read only changed files, then update this file.

## Map
- `core/settings.py` — env-driven config; `DJANGO_ENV` picks local vs production; Sentry init (only with `SENTRY_DSN`) + `scrub_sentry_event`; `LOGGING` (console, `[request_id]` in every line, level `DJANGO_LOG_LEVEL`). `core/asgi.py` (Channels), `core/urls.py` (API under `/api/`, `/api/health/`, JSON 404 for unknown `/api/*`, `/media/`, SPA fallback; `handler500`), `core/views.py` (serves frontend build — GET/HEAD only, other methods 405; path-traversal guarded; `health`, `api_not_found`, `server_error`).
- `core/exceptions.py` — the API error envelope: `api_exception_handler` (DRF `EXCEPTION_HANDLER`), `ApiErrorEnvelopeMiddleware` (adds `code`/`error` to hand-written `/api/` errors), helpers `error_response` / `json_error` / `error_payload`. `core/observability.py` — `RequestIdMiddleware` (first middleware; `X-Request-ID`), `RequestIdLogFilter`, request-id contextvar, `scrub_sentry_extras`, `tag_sentry_request_id`.
- `chatapp/models.py` — `Profile` (custom user: username, email, native_language, languages_practicing[list], practice_language_levels{dict}, bio, learning_goal, location, presence fields, avatar ring), `PracticeStats`, legacy `Token`, `Conversation` (sender/receiver pair), `Message` (text, attachment, reply_to, status, edited_at, pinned_*), `MessageTranslation`, `MessageReaction`, `BlockedUser`, `UserReport`, `ProfileView`.
- `chatapp/views.py` — most REST views (profile, community, conversations, messages, translate, react, pin, practice, coach). `auth_views.py` — JWT obtain/refresh (cookie-setting), logout. `authentication.py` — cookie/Bearer JWT auth with CSRF enforcement for cookie auth. `throttles.py` — scoped throttles.
- `chatapp/consumers.py` — `ChatConsumer` (`ws/socket-server/<conversation_id>/`), `PresenceConsumer` (`ws/presence/`). `routing.py`. DB calls use `db_async` (`database_sync_to_async` with `thread_sensitive=False`: default thread pool, `close_old_connections` around each call) — never the default thread-sensitive mode, which serializes every socket in the process on one thread.
- `chatapp/gemini.py` — coach client (key in `x-goog-api-key` header, timeouts → "coach unavailable").
- `chatapp/serializers.py` — public `ProfileSerializer` must NOT include email/date_of_birth.
- Management commands: `load_dummy_data`, `prewarm_daily_practice`. Latest migration: `0031_query_perf_indexes`.

## Query performance (keep these true; tests in `tests/test_query_counts.py`)
- Any queryset serialized with `MessageSerializer` goes through `serializers.with_message_relations(qs, request.user)` (select_related sender/pinned_by/reply_to__sender + prefetch reactions and the caller's translations). Single messages re-serialized after a write use `reload_message_for_serializer`. The serializer falls back to per-row queries when not prefetched.
- `GET /conversations/<id>/` embeds only the latest `CONVERSATION_DETAIL_MESSAGE_LIMIT` (200) messages, oldest→newest; older history is `GET /conversations/<id>/messages/?page=N`. Web re-fetches page 1 right away; mobile uses the embedded list as its first page and pages older history from `/messages/` (page size 50).
- Message create/delete are broadcast to the chat room by the views (`message_created`/`message_deleted`); the chat consumer ignores client `chat`/`deleteMessage` frames. Message broadcasts strip `PER_USER_MESSAGE_FIELDS` (`serializers.message_broadcast_payload`).
- `practice_submit_view` scores a challenge once per serving: `cache.add` on `practice:scored:v1:user:{uid}:id:{hash}` (36 h); repeats return the same 200 shape with `already_scored: true` and 0 awarded; `practice_challenge_view` deletes the key when it serves that id again. Tests: `tests/test_practice.py`.
- `record_profile_view` bumps the profile cache version only when the top viewer changes (otherwise the public-profile cache never hits).
- Conversation create is a locked get-or-create on the unordered pair (no DB unique constraint; legacy duplicates resolve to the oldest).
- Conversation list: unread count is a correlated subquery; delivery marking (`mark_messages_delivered`) bumps both participants' list cache versions.
- `Message.save()` touches `Conversation.updated_at` only on create (pin/edit/status must not reorder the list).
- Slow outside calls run with the DB connection released (`views.release_db_connection()`; with the pool, close = return to pool; skipped inside `transaction.atomic`). Call it after the reads the call needs: coach (Gemini), translate (Google), practice generator (inside `fetch_generated_challenge`), message attachment upload (saved to storage *before* `Message.objects.create`, which gets the stored name; the upload is deleted if the insert fails), profile image upload. `ATOMIC_REQUESTS` is off.
- Practice: the request path (`build_challenge`) makes at most one generator call: `top_up_daily_library` adds one item to a pool below `PRACTICE_DAILY_LIBRARY_MIN_READY` under a `cache.add` lock per language/bucket/day (others serve the pool or the static library), and the realtime branch runs only if no call was made. Bulk refill is `get_or_build_daily_library` (the `prewarm_daily_practice` command).
- Community list (`profile_data:version`) is bumped only by blocks/unblocks and account deletion; registration and profile/image edits rely on the 30 s TTL.

URL names: token_obtain_pair, token_refresh, logout, login (legacy), register, profile, delete_account, moderation_summary, presence_offline, coach_chat, profile_data, public_profile, block_user, report_user, profile_edit, profile_location_update, update_profile_image, conversation_list, conversation_messages, mark_conversation_read, delete_message, edit_message, translate_message, react_to_message, pin_message, practice_state, practice_challenge, practice_submit.

## Security invariants (keep these true; tests in `tests/test_security.py`)
- Every conversation/message endpoint checks the user is a participant (403 otherwise). Blocking is respected.
- Chat websocket: requires auth (cookie with Origin check, Bearer header, or legacy `?token=`), numeric room id, participant only; rejections `accept()` then close (chat 4403 for any rejection, presence 4401 when unauthenticated) so browsers see the code instead of 1006. Rejected sockets never join a group. 64 KB frame cap.
- Uploads: image/video/audio only (no SVG), 25 MB attachments / 10 MB profile images, server-generated filenames.
- Cookie-authenticated unsafe requests require `X-CSRFToken` (`AUTH_COOKIE_ENFORCE_CSRF`, keep true).
- Throttles: `auth` 20/min per IP, translate 60/min, reports 20/hour, plus global user/anon. `DRF_NUM_PROXIES=1` in prod.
- Registration uses Django password validators; username `^[\w.@+-]{1,30}$`; email lowercased.
- Coach: mode allow-listed, language sanitised, 2000-char cap, 200/day per user. Messages/translation capped at 5000 chars.
- Errors return generic messages; details are logged, never returned. Every API error uses the envelope `{error, code, ...}` (5xx include `request_id`); keep `error` a string. Legacy `message` (token) / `detail` (coach, DRF errors) keys stay one release.
- `/api/health/` stays AllowAny, unauthenticated and unthrottled, and never returns hosts or exception text.

## Env var names (values never in repo)
Core: `DJANGO_ENV`, `DJANGO_SECRET_KEY`, `DATABASE_URL`/`NEON_DATABASE_URL`, `REDIS_URL`/`REDISCLOUD_URL`/`REDIS_CACHE_URL`, `USE_REDIS_REALTIME`, `CLOUDINARY_URL`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_TIMEOUT_SECONDS`, `DJANGO_ALLOWED_HOSTS`.
Observability (optional): `SENTRY_DSN` (enables Sentry), `SENTRY_TRACES_SAMPLE_RATE` (default 0), `HEROKU_SLUG_COMMIT`/`SOURCE_VERSION` (release, set by Heroku), `DJANGO_LOG_LEVEL` (default INFO; the test scripts use CRITICAL).
Hardening (all optional, safe defaults): `SECURE_HSTS_*`, `DRF_THROTTLE_{AUTH,USER,ANON,TRANSLATE,REPORT}`, `DRF_NUM_PROXIES`, `AUTH_COOKIE_ENFORCE_CSRF`, `COACH_CHAT_DAILY_LIMIT`, `COACH_CHAT_MAX_MESSAGE_LENGTH`, `MESSAGE_MAX_LENGTH`, `TRANSLATION_MAX_LENGTH`, `MESSAGE_ATTACHMENT_MAX_BYTES`, `PROFILE_IMAGE_MAX_BYTES`, `WS_MAX_MESSAGE_BYTES`.

## Run tests (local sqlite, no external services)
```bash
cd backend && DJANGO_ENV=local USE_REDIS_REALTIME=false CLOUDINARY_URL= GEMINI_API_KEY= DATABASE_URL= python manage.py test chatapp
```
Baseline: **158 tests, all passing** (2026-10-27, branch `fix/chat-races`; 154 on `perf/backend-db`, 137 on `feat/api-resilience`, 105 on `fix/reliability`, 95 at `c1d44c5`). Shortcut: `scripts/test-backend.sh` (also sets `DJANGO_LOG_LEVEL=CRITICAL`, `SENTRY_DSN=`). Test helpers in `tests/factory.py`; envelope/health/request-id/Sentry tests in `tests/test_api_resilience.py`; connection release, translate upstream errors, community-list invalidation and the practice refill lock in `tests/test_backend_perf.py`; practice scoring once per served challenge in `tests/test_practice.py`. `test_realtime_perf.capture_queries` patches `CursorWrapper` so it sees queries from the consumers' worker threads.

## Open issues
Refresh-token rotation/blacklist missing; legacy `/api/login/` + `Token` to delete; `?token=` ws auth to remove; `/media/` unauthenticated; no DB uniqueness on conversation pairs (needs a duplicate-merge migration); practice replay farming (double submits/replays of a served id fixed; unserved known `dailygen:` ids still scorable once, guard per process without Redis); presence ignores blocks; non-numeric `message_id` in translate → 500; throttles per-process without Redis; `requirements.txt` UTF-16 and local Django 5.1.6 vs pinned 5.2.5; admin unusable (no `is_staff`; `createsuperuser` now just creates a regular account).
