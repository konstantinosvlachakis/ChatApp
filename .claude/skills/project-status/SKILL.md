---
name: project-status
description: Current state of the LangVoyage ChatApp monorepo (backend, web, mobile) — architecture overview, security backlog, feature roadmap and repo conventions. Load at the start of any task in this repo before exploring code, then load backend-status / web-status / mobile-status for the area you touch.
---

# LangVoyage — project status

Last verified: 2026-10-26 at commit `c1d44c5` (branch `master`, the deploy branch).

## Refresh before trusting this
Run `git log --oneline c1d44c5..HEAD -- backend frontend mobile` and
`git diff --stat c1d44c5..HEAD`. Only re-read the areas that changed; then update
the "Last verified" line and any stale section in the matching skill(s).

## What the product is
Language-exchange chat app: users list native + practicing languages (with levels),
find partners in Community, chat 1:1 (text, attachments, voice notes, WebRTC calls),
translate messages, react/reply/pin/edit, practice challenges with XP, and an AI
"LangVoyage Coach" backed by Gemini.

## Layout
| Area | Path | Stack | Skill |
|---|---|---|---|
| Backend | `backend/` (`core/` project, `chatapp/` app) | Django 5 + DRF + Channels, SimpleJWT, Postgres, Redis, Cloudinary, Gemini | `backend-status` |
| Web | `frontend/` | React (CRA / react-scripts 5), Tailwind, React Query, axios | `web-status` |
| Mobile | `mobile/` | Expo / React Native, React Navigation, axios, expo-secure-store | `mobile-status` |
| Deploy | `Procfile` | Heroku auto-deploys `master`: `release` = migrate + reset_presence + collectstatic; `web` = daphne ASGI | — |
| Map | `.claude/skills/system-map` | REST contract, websocket events, data model, caches, flows | `system-map` |
| Tooling | `scripts/`, `.github/workflows/ci.yml`, `CLAUDE.md` | test/check scripts, CI on every PR | — |
| Docs | `docs/architecture.mmd`, `PROGRESS.md` | | |

The web build is served by Django in production (same origin as the API).

## Security audit (2026-10-26) — fixed
Commits `0c2d908` (mobile), `f7b0fda` (backend), `c7b792e` (web), `79ec3a9` (untracked `.env`, `frontend/dump.rdb`, `backend/media/`).
Headlines: websocket authz + server-side sender, participant checks on all
conversation/message actions, upload type/size validation, no email/DOB leakage,
CSRF on cookie auth, DRF throttling, coach input caps + daily limit, HSTS,
web socket room-leak fix, route guard, logout cleanup, mobile https-only release URL.

## Security backlog (open)
- **User action:** rotate every credential that was in the committed `.env` — it is still in git history (history rewrite needs a force-push; ask first).
- Refresh tokens not rotated/blacklisted → logout doesn't revoke (backend + web + mobile change).
- Legacy `/api/login/` + `Token` model issue non-expiring tokens; unused → delete.
- Backend still accepts `?token=` on websockets; web has a localhost-only legacy token fallback. Remove both together.
- `/media/` served without auth (filenames now random) → signed/private delivery.
- Practice points farmable by replaying answers.
- Web profile page requests geolocation automatically and sends coords to a third-party geocoder → make opt-in.
- CRA is unmaintained; `postinstall` runs a build; unused deps (socket.io-client, zod, react-icons).
- Old collected static files tracked in `backend/backend/staticfiles/` (685 files) → remove.

## Performance work (2026-10-26) — merged
PRs #14–#18: STORAGES fix (attachments to Cloudinary, compressed static), Gemini 25s deadline,
N+1 removal + migration 0031 indexes, presence to contacts only, psycopg3 pool, web bundle 202→94 KB.
Follow-ups: lower CONVERSATION_DETAIL_MESSAGE_LIMIT from 200 now that mobile pages older messages
(keep mobile `DETAIL_MESSAGE_LIMIT` in sync); message list virtualization (new dep).

## Reliability PR (`fix/reliability`, 2026-10-26)
Server-broadcast `message_created`/`message_deleted` (client chat/delete relays dropped, per-user fields
stripped from broadcasts), web global 401 refresh-and-retry + socket refresh on 4401/4403, ws rejections
accept-then-close so clients see the code, exponential reconnect backoff + jitter (web, mobile RootNavigator),
mobile heartbeat + older-message paging, profile-view cache fix, locked conversation get-or-create,
createsuperuser no longer crashes, login shows backend `message`.

## Feature roadmap (language-exchange focus) — chosen 2026-10-26
| Feature | Status |
|---|---|
| Reciprocal partner matching (their native = my target AND vice versa, level/goal filters, "perfect match" badge) | Done (PR #10) |
| Inline corrections (suggest correction on a partner's message, shown as diff) | Not started |
| Phrasebook (save message/translation/correction) + daily streaks from real chat activity | Not started |
| Topic prompts (level-appropriate, Gemini with fallback list) + per-conversation language balance indicator | Not started |
Update this table as features land.

## Conventions
- Commits: author as `konstantinosvlachakis` (per-command `git -c user.name/user.email`), never a Claude co-author line. Short `type(scope): summary` + bullets. Ask before committing/pushing.
- Never open or print `.env` files or secret values; refer to env vars by name only.
- Don't install packages or run cloud/Heroku commands without explicit approval.
