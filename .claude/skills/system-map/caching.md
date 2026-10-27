# Caching (backend, web, mobile)

Purpose: every cache layer, its keys, TTLs and what invalidates each one, so you can change data flows without stale-data bugs.
**Verified at commit c1d44c5 (2026-10-26); updated in PRs `fix/reliability`, `feat/api-resilience` and `fix/chat-races` (pending: `practice:scored`).**
Refresh: `git diff --stat c1d44c5..HEAD -- backend/core/settings.py backend/chatapp/views.py backend/chatapp/consumers.py backend/chatapp/throttles.py frontend/src/libs frontend/src/pages/Conversations/api frontend/src/pages/Conversations/features/ChatRoom.jsx frontend/src/pages/Conversations/features/ConversationList.jsx frontend/src/layout/Layout.jsx frontend/src/context/UserContext.tsx frontend/src/utils/auth.ts mobile/src/services mobile/src/features`. Re-read only the files that changed, then update this file. To find new keys: `grep -rn "cache\.\(get\|set\|add\|incr\|delete\)" backend/chatapp`.

## Backend infrastructure (core/settings.py)
| Setting | `USE_REDIS_REALTIME=true` **and** `REDIS_URL`/`REDISCLOUD_URL` set | Otherwise (default; includes local and tests) |
|---|---|---|
| `CACHES["default"]` | `django.core.cache.backends.redis.RedisCache`, LOCATION `REDIS_CACHE_URL` or the Redis URL, socket connect/read timeout 2 s | `LocMemCache` `"chatapp-default-cache"`: **per process**, default MAX_ENTRIES 300 with culling |
| `CHANNEL_LAYERS["default"]` | `channels_redis.core.RedisChannelLayer` | `InMemoryChannelLayer` (per process) |

- Only the `default` alias exists. There's no `cache_page` and no template/session cache. The only HTTP Cache-Control header is `no-store` on `/api/health/`. Sessions use the DB (`SESSION_ENGINE` db).
- DB pool (production + Postgres only, `DB_POOL_ENABLED` default true): `CONN_MAX_AGE=0` and `OPTIONS.pool = {min_size: DB_POOL_MIN_SIZE (1), max_size: DB_POOL_MAX_SIZE (8), timeout: DB_POOL_TIMEOUT_SECONDS (10)}` (psycopg3). Local uses SQLite.
- Version-key scheme (profile, profile-list, conversation-list): `get_*_cache_version` reads the version key, setting it to 1 with no expiry (`None`) if it's missing. `bump_*_cache_version` runs `cache.incr`, sets it to 2 on `ValueError` (missing key) and swallows any other error (best effort). Payload keys embed `v{n}`, so a bump orphans old payloads, which then expire by TTL.

## Backend cache keys (all in `chatapp/views.py` unless noted)
| Key template | Set in | TTL | Invalidated / bumped by | Notes |
|---|---|---|---|---|
| `profile:version:user:{user_id}` | `get_profile_cache_version` | none | `bump_profile_cache_version` ← `record_profile_view` (only when the viewer was not already the most recent viewer), `profile_edit_view`, `profile_location_update_view`, `update_profile_image`, `delete_account_view`, `block_user_view` POST/DELETE (target only) | Per-user version |
| `profile:v{ver}:user:{id}:host:{host}` | `profile_view` GET | 300 s (`PROFILE_CACHE_TIMEOUT_SECONDS`) | profile version above | Own profile, includes email/DOB and `recent_profile_viewers`. Per user + host |
| `public_profile:v{ver}:user:{profile_id}:viewer:{viewer_id}:host:{host}` | `public_profile_view` | 300 s | profile version of `profile_id` | Hits on repeat views by the same viewer. A view that changes the top viewer still bumps the version before the lookup, so that first request misses |
| `profile_data:version` | `get_profile_list_cache_version` | none | `bump_profile_list_cache_version` ← `register_view`, `profile_edit_view` (only when username, native_language or languages_practicing change), `update_profile_image`, `delete_account_view`, `block_user_view` POST/DELETE | **One global version** for everyone's community list |
| `profile_data:v{ver}:user:{uid}:page:{p}:size:{s}:match:{all\|reciprocal\|teaches_me}:level:{lvl\|-}` | `profile_data_view` | 30 s | global list version | Per viewer (match scores and block exclusion are viewer-specific). An empty-page payload is cached too |
| `conversation_list:version:user:{user_id}` | `get_conversation_list_cache_version` | none | `bump_conversation_list_cache_version` ← `mark_messages_delivered` (both participants of each affected message), `MessageListView.post`, `MessageDeleteView.delete`, `MessageEditView.patch` (only if the text changed), `pin_message_view`, `ConversationDetailView.delete`, `ConversationListView.post` (only on create), `mark_conversation_read_view` (only if something was updated), `block_user_view` (both users), `delete_account_view` (deleted user only) | Per user |
| `conversation_list:v{ver}:user:{uid}:host:{host}` | `ConversationListView.get` | 20 s | conversation-list version | `mark_messages_delivered` runs before the lookup on every request, so new deliveries bump the version and the request misses. A cached `[]` is honoured (`is not None` check) |
| `coach_chat:rate_limit:user:{uid}` | `consume_coach_chat_rate_limit` | `COACH_CHAT_RATE_LIMIT_WINDOW_SECONDS` (60) | expiry only | Fixed window, max `COACH_CHAT_RATE_LIMIT_REQUESTS` (12). Get-then-set (not atomic on the first hit) |
| `coach_chat:daily_limit:user:{uid}:date:{YYYYMMDD UTC}` | `consume_coach_chat_daily_limit` | 25 h | expiry / date roll | `cache.add` + `incr` (atomic). Limit `COACH_CHAT_DAILY_LIMIT` (200); ≤0 disables it |
| `translate:v1:google:auto->{target_code}:{sha256(normalized text)}` | `translate_message_view` (key from `build_translation_cache_key`) | 30 days | never | **Shared** across users. Value `{translated_text, source_language, target_language}`. Same-language results are *not* cached. Cache errors are swallowed. The per-user DB row `MessageTranslation` is the durable copy |
| `practice:generated_answer:user:{uid}:id:{challenge_id}` | `store_generated_answer` (from `build_challenge`) | 600 s | expiry | Value `{answer, language}`. Read by `get_generated_answer` / `get_challenge_answer`. Ids are `gen:<16 hex>` or `dailygen:{date}:{lang}:{bucket}:{index}` |
| `practice:scored:v1:user:{uid}:id:{sha256(challenge_id)[:32]}` | `practice_submit_view` (`cache.add`, atomic) | 36 h (`PRACTICE_SCORED_TTL_SECONDS`) | deleted by `practice_challenge_view` when it serves that id to the user again; deleted if the stats update raises | Value `{correct}` of the first attempt. Present → the submit awards nothing (`already_scored: true`). Per process without Redis |
| `practice:generator_budget:v1:date:{YYYYMMDD}` | `consume_practice_generator_budget` | 36 h | date roll | Global daily count of generator API calls, limit `PRACTICE_GENERATOR_DAILY_REQUEST_LIMIT` (20). Read by `get_remaining_practice_generator_budget` |
| `practice:daily_library:v1:date:{YYYYMMDD}:lang:{lang}:bucket:{1-3}` | `get_or_build_daily_library` (also the `prewarm_daily_practice` command) | 36 h | date roll | **Shared** pool of generated challenges (list of dicts). Refilled when it has fewer than `PRACTICE_DAILY_LIBRARY_MIN_READY` (8) items, up to `PRACTICE_DAILY_LIBRARY_SIZE` (20). `get_challenge_answer` builds this key inline as the fallback for `dailygen:` ids |
| `practice:daily_library_seen:v1:date:{YYYYMMDD}:user:{uid}:lang:{lang}:bucket:{b}` | `store_seen_daily_indexes` | 36 h | date roll; reset in memory when every index has been seen | Per user: pool indexes already served |
| `practice:recent_signatures:v1:user:{uid}:lang:{lang}:bucket:{b}` | `store_recent_practice_signature` | 36 h | rolling (last 6) | Per user: recent sentences, used to avoid repeats |
| `health:check:{uuid4 hex}` | `core/views.py:_check_cache` (`GET /api/health/`) | 10 s | deleted right after the read | Round-trip probe only; never read by anything else |
| `throttle_{scope}_{ident}` (DRF `SimpleRateThrottle`) | DRF throttles (`chatapp/throttles.py` + defaults) | the rate's window | expiry | Scopes: `anon` (IP, 300/h), `user` (uid, 3000/h), `auth` (IP, 20/min, applied even when authenticated: `AuthRateThrottle.get_cache_key`), `translate` (uid, 60/min), `report` (uid, 20/h). Rates come from env vars `DRF_THROTTLE_*`. IP from `NUM_PROXIES` (1 in prod) |

Not in the Django cache but still caching:
- Serializer per-instance memo: `_latest_messages_cache` on ConversationSerializer and `_user_translation_cache` on Message objects. These are per-request only.
- `PresenceTrackingMixin.contact_ids` is cached per socket. It's re-read when the user goes offline.

## Web (frontend/src)
React Query **v3** (`react-query`), one `queryClient` from `libs/react-query.ts`, provided in `AppProviders.jsx`. Defaults: `staleTime 30 s`, `retry false`, `refetchOnWindowFocus false`, `useErrorBoundary true`; `cacheTime` keeps the v3 default (5 min).

| Query key | Defined / filled | Options | Updated by |
|---|---|---|---|
| `["conversationsList"]` (`CONVERSATIONS_LIST_QUERY_KEY` in `api/conversationListCache.js`) | `useGetConversations` (`api/getConversations.ts`), GET `/api/conversations/` | `initialData []` with `initialDataUpdatedAt 0` (so the first mount fetches), `staleTime 15 s`, `cacheTime 5 min`, `refetchOnMount`, `refetchOnReconnect`, `useErrorBoundary false`. Also used by `Layout.jsx` (unread badge: `refetchOnWindowFocus true`, enabled once the user is loaded) | **Patch** (`setQueryData`, fall back to invalidate when the patch returns false): `applyNewMessageToConversationList` (chat socket `message_created`, and after our own POST in ChatRoom; moves the conversation to the top, sets `last_message`, `markRead` zeroes unread for incoming), `markConversationReadInList` (opening a chat), `applyMessageStatusToConversationList` (socket `message_status`). **Invalidate**: socket `message_edited`, `message_pinned`, `message_deleted`; local edit/pin handlers; delete-conversation mutation (`ConversationList.jsx`); presence-socket `conversation_update` (only while `ConversationList` is mounted) |
| `["conversationMessagesPage", conversationId, page]` | `fetchMessagesPage` in `ChatRoom.jsx` (`setQueryData` with no observer) | v3 defaults | `invalidateConversationHistoryCache` runs `invalidateQueries(["conversationMessagesPage", id])` on every socket message_created/message_deleted/reaction/status/edit/pin event and after local send/edit/pin. Every current caller passes `force: true`, so the cached read path is unused (write-only cache) |
| `["userProfile"]` | Only `useEditProfile` (`pages/Profile/api/editProfile.ts`, optimistic set / rollback / invalidate) | — | Dead: no query populates it and the hook is unused. The current user lives in `UserContext`, not React Query |

Logout (`Layout.handleLogout`): POST `/api/presence/offline/` → POST `/api/logout/` → close the presence socket → `clearClientSessionData()` → `queryClient.clear()`.

Browser storage:
| Key | Store | Written by | Cleared by |
|---|---|---|---|
| `user_profile_cache:v1` → `{user, cachedAt}` | localStorage | `UserContext` effect whenever `user` changes. Hydrates the initial state (24 h TTL), then `refreshUserProfile` refetches `/api/profile/` | `clearClientSessionData`, set when `user` becomes null, expiry/parse error. Contains the own profile including email/DOB |
| `chat:draft:{conversationId}` / `chat:draft:global` | localStorage | `MessageInput.jsx` | Send; `clearClientSessionData` (prefix `chat:draft:`) |
| `chat:coach:messages:{userId\|guest}`, `chat:coach:preferences:{userId\|guest}` | localStorage | `pages/Conversations/features/coachConversation.js` | **Never** (survives logout) |
| `csrfToken` | sessionStorage | `utils/csrf.ts` (from `/api/csrf/`) | `clearClientSessionData` |
| `accessToken`, `refreshToken` | session + local (local only with rememberMe) | `setLegacyTokens` (legacy localhost-only fallback) | `clearLegacyTokens` (inside `clearClientSessionData`; also on profile 401) |
| `csrfToken`, `authToken` | localStorage | `utils/storage.js` | Dead file, not imported |

`clearClientSessionData` (utils/auth.ts) runs on logout, on a 401 in `UserContext.refreshUserProfile`, and after login.

## Mobile (mobile/src)
- **Module cache** in `services/api/conversations.ts`: `cachedConversations` + `cachedConversationsAt` (TTL 15 s), in-flight dedup `conversationsRequest`, and `cacheGeneration`.
  - `fetchConversations({force})`: returns the cache unless `force` (an in-flight request is always shared). It writes the cache only if the generation hasn't changed since the request started.
  - `clearConversationsCache()`: nulls everything and bumps the generation. Called by `logout()` and `deleteAccount()` (`services/api/auth.ts`).
  - `ConversationsScreen.loadConversations`: shows the cache, then revalidates with force. Throttled to once per 4 s unless forced; `conversation_update` forces it.
  - `RootNavigator.loadUnreadChatsCount`: always `force: true`, but has a 4 s non-forced throttle and an in-flight skip.
- **SecureStore** (`keychainService "langvoyage.auth"`): `lv_access_token`, `lv_refresh_token` (`tokenStorage` in `services/storage.ts`). Cleared by `logout`, `deleteAccount`, failed refresh (`client.ts`) and a failed bootstrap (`AuthContext.hydrate`).
- **AsyncStorage**: `lv_theme_mode` (`ThemeContext`), `lv_profile_view_last_notified_at:{userId}` (`RootNavigator` profile-view notifications), `coach:messages:{userId|guest}` and `coach:preferences:{userId|guest}` (`features/coachConversation.ts`). None of these are cleared on logout or account deletion.

## Staleness gotchas
1. **Without Redis (LocMem), every cache is per process.** A bump in one daphne process doesn't invalidate another's payloads, throttles and coach limits are per process, the practice pools aren't shared, and the `prewarm_daily_practice` command fills only its own short-lived process memory (useless). `InMemoryChannelLayer` also breaks cross-process websocket fan-out. Production needs `USE_REDIS_REALTIME=true`.
2. **Version-key resurrection**: version keys have no TTL. If one is evicted (LocMem culls at 300 entries; Redis eviction policy), `get_*` resets it to 1 and any still-live `v1` payload is served again.
3. `record_profile_view` bumps the viewed profile's version only when the top viewer changes (fixed in `fix/reliability`; it used to bump on every view, so `public_profile` never hit). Consequence: repeat views by the current top viewer leave `recent_profile_viewers[0].viewed_at` stale for up to 5 min in the viewed user's `profile:` cache (mobile's "viewed your profile" banner won't re-fire for that viewer meanwhile).
4. Conversation-list payloads are **not** re-versioned on: reactions, translations, the other participant's profile edits (username/avatar), presence changes (`is_online`/`last_seen` in the embedded summaries), or another user's account deletion (their conversations cascade away but the counterpart's list version isn't bumped). Each is stale for up to 20 s. Clients use the presence socket for live online state.
5. The community list (`profile_data`) isn't bumped for `practice_language_levels`, `learning_goal`, or `profile_image_url` set via `profile_edit_view`. Each is stale for up to 30 s, which also affects the `level` filter.
6. ~~`MessageDeleteView` doesn't broadcast~~ — it now sends `message_deleted` to the room and `conversation_update` (`message_deleted`), so web lists invalidate.
7. Web: `conversation_update` is only handled while `ConversationList` is mounted. On other pages the Layout unread badge refreshes only on focus or remount (15 s staleTime).
8. Web: `invalidateQueries` on `conversationMessagesPage` doesn't drop data. A future non-`force` `fetchMessagesPage` call would read stale pages through `getQueryData`.
9. Web `user_profile_cache:v1` (24 h) briefly renders a stale profile before the refetch. It keeps PII in localStorage until logout.
10. Translation cache entries are shared and never invalidated (30 days). If the provider improves its output, old results persist until expiry.
11. Practice: answers for `dailygen:` ids fall back to the shared pool, so a user can still submit a known id/answer they were never served while the pool lives (36 h); each id scores once per user until it is served to them again (`practice:scored`). Without Redis the guard is per process. Remaining replay-farming backlog.
12. Mobile: a refresh failure clears tokens but not `cachedConversations` (15 s TTL, so the window is small). Coach and profile-view AsyncStorage keys survive logout and account deletion.
