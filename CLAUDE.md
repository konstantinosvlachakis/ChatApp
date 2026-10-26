# LangVoyage (ChatApp)

Language-exchange chat app: Django + DRF + Channels backend (`backend/`), React web app (`frontend/`, served by Django in production), Expo mobile app (`mobile/`). Deployed to Heroku from `master` (Procfile: `release` = migrate + reset_presence + collectstatic; `web` = daphne).

## Read before exploring
- `.claude/skills/project-status` — overview, open backlog, roadmap.
- `.claude/skills/system-map` — how the parts talk: REST contract with web/mobile callers, websocket events, data model, caches, end-to-end flows. Check it before changing an endpoint, event, payload, model or cache key.
- `.claude/skills/{backend,web,mobile}-status` — per-area files, invariants, open issues.
Each file has a "verified at commit" stamp; diff from that commit and re-read only what changed.

## Commands
- Backend tests: `scripts/test-backend.sh` (or `scripts\test-backend.ps1`) — SQLite, no external services.
- Web: `scripts/check-web.sh [--skip-build]` (or `.ps1 [-SkipBuild]`) — tsc (src only), unit tests, build + prerender.
- Mobile: `cd mobile && npx tsc --noEmit`.
- CI (`.github/workflows/ci.yml`) runs all three on every PR and on pushes to `master`.

## Contract rules
- The mobile app reads full chat history from conversation detail `messages` (capped at `CONVERSATION_DETAIL_MESSAGE_LIMIT`); web pages via `/api/conversations/<id>/messages/?page=`. Changing a payload means checking both clients (see system-map).
- Never change websocket event names/payloads without updating web and mobile handlers in the same PR.
- Query counts are guarded by `backend/chatapp/tests/test_query_counts.py`; new list endpoints need prefetching and a bound test.
- Any PR that changes an endpoint, event, model, cache key or flow updates the matching system-map file and its stamp.
- All client calls go through the API client (web `frontend/src/lib/api.ts`, mobile `mobile/src/services/api/client.ts`), and every API error uses the envelope `{"error": str, "code": str, ...}` (`backend/core/exceptions.py`).

## Git and PRs
- Author every commit as `konstantinosvlachakis` with the email from that author's history: `git -c user.name=konstantinosvlachakis -c user.email="$(git log --author='^konstantinosvlachakis <' -1 --format=%ae)" commit ...` (also for rebases). Never add `Co-Authored-By` or any Claude attribution to commits or PRs.
- Branch from `master`, one PR per change; stack dependent PRs. Messages: `type(scope): summary` + short bullets.
- Ask before committing or pushing. Never push directly to `master` and never `gh pr merge --admin`; the user merges on GitHub (stacks bottom-up, "Create a merge commit").

## Security
- Never open or print `.env` files or secret values; refer to env vars by name. Use placeholders for hosts/IPs.
- No package installs, cloud/Heroku commands or migrations against production without explicit approval.
- Keep the backend's authz invariants (participant checks, websocket auth, upload limits, CSRF on cookie auth) — see backend-status.
