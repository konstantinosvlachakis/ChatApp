---
name: web-status
description: Current state of the LangVoyage React web app (frontend/) — routes, auth/CSRF/websocket flow, key files, verification commands and open issues. Load before changing or reviewing anything under frontend/.
---

# Web status (React, CRA)

Last verified: 2026-10-26 at commit `79ec3a9`; updated in PR `fix/reliability`. Refresh: `git log --oneline 79ec3a9..HEAD -- frontend` — re-read only changed files, then update this file.

## Routes (`src/AppRoutes.jsx`; public-only build uses `src/PublicAppRoutes.jsx`)
Public: `/`, `/privacy-policy`, `/terms-and-conditions`, `/login`, `/register`.
Protected (wrapped in `layout/Layout.jsx`, which redirects to `/login` without a session): `/profile`, `/profile/edit`, `/settings`, `/community`, `/people/:username`, `/conversations`, `/conversations/:id`, `/practice`, `/premium`, `/premium/compare`.

## Auth, CSRF and sockets
- Auth = httpOnly JWT cookies set by the backend. `src/index.js` calls `initCsrfProtection()` (`utils/csrf.ts`), which globally patches `window.fetch` and the default `axios` instance: backend-origin requests get `credentials: include` and, for unsafe methods, `X-CSRFToken` (token from `/api/csrf/`, cached in sessionStorage). So raw `fetch`/`axios` calls in pages are fine — don't bypass `window.fetch`.
- `utils/axios.ts` — configured instance (same CSRF behaviour). `utils/auth.ts` — refresh + `clearClientSessionData()` (called on logout, 401, after login). Legacy localhost-only token fallback (`getLegacyAccessToken`) still exists — slated for removal.
- `context/UserContext.tsx` (current user), `context/PresenceContext.jsx`.
- WebSockets: build URLs with `getWebSocketBaseUrl()` from `constants/constants.ts` (forces `wss:` on https). Chat socket lives in `pages/Conversations/features/ChatRoom.jsx`; presence socket in `layout/Layout.jsx`. Both use `utils/reconnect.ts` (exponential backoff + jitter, capped 30 s, paused while the tab is hidden), stop on close codes 1008/4401/4403 after one `refreshSessionOnce()`, reconnect once on the `session-refreshed` window event, and ignore stale sockets (per-effect `isDisposed`). Messages/deletes arrive as server `message_created`/`message_deleted` events; the client never relays them.
- Session refresh: the patched `window.fetch` and both axios instances refresh once (single-flight `refreshSessionOnce` in `utils/auth.ts`) and retry on a 401 (auth endpoints excluded); a failed refresh → `handleSessionExpired()` (clear session data, `/login` on protected paths).
- `BASE_URL` comes from `REACT_APP_BASE_URL` (empty in prod = same origin).

## Key feature files
Chat: `pages/Conversations/features/{ChatRoom,Conversation,MessageInput,ChatHeader,ConversationList,CallPanel,CoachChatRoom,Sidebar}.jsx` (+ `api/*.ts`). Community: `pages/Community/page.tsx`. Profiles: `pages/Profile/*`, `pages/PublicProfile/page.jsx`. Practice: `pages/PracticePage.jsx`. Coach history: `features/coachConversation.js` (localStorage).
Safety rules: attachment/user URLs go through the http/https/blob scheme check in `Conversation.jsx`; usernames in paths use `encodeURIComponent`; no `console.log` of user data; no `dangerouslySetInnerHTML`.

## Verify
```bash
cd frontend
npx tsc --noEmit            # clean for src/ (playwright types missing is pre-existing)
CI=true npx react-scripts test --watchAll=false   # 2 suites / 2 tests (Settings, utils/reconnect); from a .claude worktree add --testMatch "**/src/**/*.test.{js,jsx,ts,tsx}"
npm run build               # builds + prerenders 5 public routes
```
Note `package.json` has `postinstall: npm run build` and POSIX-style e2e scripts.

## Open issues
Geolocation auto-requested and sent to a third-party geocoder (make opt-in); legacy token fallback + `?token=` ws param; coach history persists after logout; public STUN only (TURN needs backend-issued short-lived creds; `REACT_APP_WEBRTC_ICE_SERVERS` supported); dead `utils/storage.js`; unused deps (socket.io-client, zod, emoji-picker-element, react-icons); CRA unmaintained (consider Vite); hook-dependency lint warnings in ChatRoom/MessageInput/CoachChatRoom.
