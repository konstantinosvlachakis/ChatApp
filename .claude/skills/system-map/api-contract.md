# API contract (REST) — backend ↔ web ↔ mobile

Purpose: every REST endpoint, its payload shape, and which client code depends on which fields, so you don't have to re-explore views/serializers/clients.
Verified at commit c1d44c5 (2026-10-26).
Refresh: `git diff --stat c1d44c5..HEAD -- backend/chatapp/urls.py backend/chatapp/views.py backend/chatapp/auth_views.py backend/chatapp/serializers.py frontend/src mobile/src/services`, then update the affected rows.

Paths: backend views are in `backend/chatapp/views.py` unless noted. Web = `frontend/src/...`, mobile = `mobile/src/...`.

## Auth and transport conventions

- **Base path** `/api/` (`backend/core/urls.py` includes `chatapp.urls`). Web: `${BASE_URL}/api/...` (`BASE_URL` = `REACT_APP_BASE_URL`, empty = same origin). Mobile: axios `api` instance with `baseURL = ${API_BASE_URL}/api` (`mobile/src/services/api/client.ts`), so mobile paths have no `/api` prefix.
- **Trailing slashes matter.** Every path ends in `/` except `profile/data`. A wrong path does **not** 404: the SPA catch-all `^.*$` (`core/views.py:front`) answers every method with `index.html` and status 200. A typo therefore looks like a success that returns HTML.
- **Auth class** `chatapp/authentication.py:CookieOrHeaderJWTAuthentication` (the default). It tries `Authorization: Bearer <jwt>` first (mobile; the values `null`/`undefined` are ignored), then the `lv_access` cookie (web). The default permission is `IsAuthenticated`.
- **CSRF**: cookie-authenticated unsafe methods need the `X-CSRFToken` header (`AUTH_COOKIE_ENFORCE_CSRF`, default true). If it is missing, the response is 403 `{"detail":"CSRF Failed: ..."}`. Web gets the token from `GET /api/csrf/`, caches it in sessionStorage `csrfToken`, and attaches it automatically through the patched `window.fetch` and axios (`frontend/src/utils/csrf.ts`). Bearer requests (mobile) are exempt.
- **JWT**: access token lasts 1 h, refresh token 7 d (30 d with `remember_me`). `ROTATE_REFRESH_TOKENS=False`, so a refresh returns only `access`. There is no blacklist, and logout can't revoke a token.
  - Web: `POST /api/token/` sets the httpOnly cookies `lv_access`/`lv_refresh`. `utils/auth.ts:refreshSession` POSTs `/api/token/refresh/` with an empty body (the cookie is used). The **only** web code that retries after a 401 is `pages/Conversations/api/fetchUserProfile.ts`. Other web calls don't refresh.
  - Mobile: stores `access`/`refresh` from the response body in SecureStore. `client.ts` uses a single-flight refresh-on-401 (body `{refresh}`) and keeps the old refresh token when the response has none.
- **Throttles** (settings `REST_FRAMEWORK`): the global defaults are anon 300/h and user 3000/h. A view with explicit `throttle_classes` **replaces** the defaults:
  - `auth` 20/min per IP: token, token/refresh, login, register.
  - `translate` 60/min per user.
  - `report` 20/h per user.
  - Coach has its own cache-based limits on top: 12 requests per 60 s and 200 per day (429 with `detail`).
- **Pagination**: two hand-rolled page-number endpoints (not DRF paginators), `profile/data` and `conversations/<id>/messages/`. Both take `?page=&page_size=` and return `pagination:{page,page_size,total_pages,total_count,has_next,has_previous}`. An out-of-range page returns an empty list, not 404. Other lists are unpaginated.
- **Error shape**: mostly `{"error": "<msg>"}`. Exceptions:
  - token: `{"message","code"}` (`invalid_request` 400 / `no_active_account` 401).
  - coach: `{"detail"}`.
  - DRF-generated errors (401, CSRF 403, 404 from `get_object_or_404`/`Http404`, 429 throttle, 415 wrong content type): `{"detail"}`.
  - translate 400s add the flags `already_translated` / `same_language`.
- **Media URLs**: `build_media_url` / `ProfileSerializer.get_profile_image_url` return absolute URLs and force https on herokuapp/langvoyage hosts. The **exception** is `profile/moderation/`, which returns the raw stored `profile_image_url`. Clients resolve it themselves (web `Settings/page.jsx` prefixes `/media/`; mobile uses `resolveMediaUrl`).
- **WebSockets** (not REST, listed for completeness): `ws/socket-server/<conversation_id>/` and `ws/presence/` (`chatapp/routing.py`, `consumers.py`). REST writes push events to the chat group: `message_edit_event`, `message_reaction_event`, `message_pin_event` (carrying a full Message object), `message_status_event` (`message_ids`, `status`, `actor_id`) and `conversation_update_event` (`conversation_id`, `trigger`, `actor_id`).

## Shared payload shapes

- **ProfileSummary** (`serializers.py:ProfileSerializer`, other users only): `{id, username, native_language, profile_image_url (abs URL|null), is_online (true only if last_seen < ONLINE_FRESHNESS_SECONDS=90 ago), last_seen}`. It must never gain `email` or `date_of_birth`.
- **OwnProfile** (`profile_view`): `{user_id, username, age, location, location_updated_at, native_language, base_translate_language, languages_practicing[str], practice_language_levels{lang: beginner|intermediate|advanced|fluent}, profile_image_url, complementary_image_1_url, complementary_image_2_url, avatar_ring_color (default "#1b7f79"), date_of_birth, email, bio, learning_goal, recent_profile_viewers[{user_id, username, native_language, profile_image_url, viewed_at}] (max 12), support_email}`. Cached per user for 5 min. Note that the id key is `user_id`, not `id`.
- **PublicProfile** (`public_profile_view`): `{user_id, username, age, native_language, languages_practicing, practice_language_levels, profile_image_url, complementary_image_1_url, complementary_image_2_url, bio, learning_goal, reviews: [] (always empty), is_blocked_by_me, has_blocked_me}`. It has no email, date_of_birth or location.
- **PeopleCard** (`profile_data_view` items): `{username, native_language, languages_practicing, practice_language_levels, learning_goal, profile_image_url, match:{teaches_me, learns_mine, reciprocal, score}}`. It has no id, bio or premium flag.
- **Message** (`serializers.py:MessageSerializer`):
  - Fields: `{id, text, sender: ProfileSummary, status: sent|delivered|read, attachment (raw storage path), attachment_url (abs|null), timestamp, edited_at|null, is_pinned, pinned_at|null, pinned_by:{id,username}|null, reply_to:{id, text, timestamp, sender:{id, username}}|null, translated_text|null, translated_source_language|null, can_translate, reactions:[{id, user_id, username, emoji}] (oldest first), current_user_reaction: emoji|null}`.
  - The translation fields are **per requesting user**, for that user's `base_translate_language`.
  - `can_translate` is false for your own messages, for empty text, and when a translation already exists.
  - Querysets must go through `with_message_relations` (query-count tests).
- **ConversationListItem** (`ConversationSerializer`, list context): `{id, sender: ProfileSummary, receiver: ProfileSummary, created_at, updated_at, last_message: Message|null, unread_count (messages from the other user with status != read), pinned_messages: [] (empty in list), messages: [] (empty in list)}`.
  - Ordered `-updated_at`. `updated_at` only changes when a message is created.
  - Cached per user for 20 s and invalidated by version bumps.
  - `sender`/`receiver` mean the conversation creator and the other participant, **not** the viewer. Clients pick "the other" by comparing ids.
- **ConversationDetail** (`include_messages=True`): same keys as the list item, plus:
  - `messages`: the latest `CONVERSATION_DETAIL_MESSAGE_LIMIT=200` messages (`serializers.py`), oldest→newest.
  - `pinned_messages`: **all** pinned messages, newest pin first.
  - `last_message` is taken from the embedded list.
- **PracticeStats**: `{points, xp, level, correct_answers, total_answers, accuracy (% 1dp), preferred_language}`. **Leaderboard entry**: `{rank, username, points, level, xp, is_current_user}` (top 10; falls back to the global board when the language has no entries). **Challenge**: `{id, sentence_parts, options[str], hint, difficulty_bucket, language, source: library|generator|generator_daily}`. Challenge ids look like `lang:bucket:idx`, `gen:...` or `dailygen:day:lang:bucket:idx`.

## Endpoints

Columns: **Auth/thr** = authentication and throttle. "dflt" = default auth (Bearer or cookie+CSRF, IsAuthenticated) with the global throttles. "none" = AllowAny with no authentication. "unused" = no web or mobile caller.

### Auth

| Method | Path | View | Auth/thr | Request | Response | Web callers | Mobile callers | Depends on / gotchas |
|---|---|---|---|---|---|---|---|---|
| GET | /api/csrf/ | backend/core/views.py:csrf | none, global anon throttle | – | `{csrfToken}` (also sets the csrftoken cookie) | utils/csrf.ts:ensureCsrfToken | – | The web cache is cleared on login/logout (`clearClientSessionData`) because Django rotates the token |
| POST | /api/token/ | auth_views.py:CustomObtainJWTToken | none, auth | `{email, password, remember_me?}` (email is lowercased) | `{access, refresh}` + sets cookies `lv_access`/`lv_refresh`. Errors: `{message, code}` 400/401 | pages/LoginPage.jsx | services/api/auth.ts:login (LoginScreen, AuthContext) | Web shows `error.response.data.detail`, but the backend sends `message`, so web always shows the fallback "Invalid credentials." Mobile never sends `remember_me` |
| POST | /api/token/refresh/ | auth_views.py:CustomRefreshJWTToken | none, auth | `{refresh}` or empty body (falls back to the `lv_refresh` cookie) | `{access}` (no rotation) + resets cookies | utils/auth.ts:refreshSession (called only by fetchUserProfile.ts) | services/api/client.ts:refreshAccessToken | Mobile keeps the old refresh token when `refresh` is absent. If rotation is turned on, both clients already handle a new `refresh` |
| POST | /api/logout/ | auth_views.py:logout_view | none (no auth, no CSRF) | – | `{detail:"Logged out."}`, clears cookies | layout/Layout.jsx:handleLogout | – (mobile only clears SecureStore) | Doesn't revoke tokens |
| POST | /api/login/ | login_view (legacy) | none, auth | `{email, password}` | `{token}` (legacy `Token` model) / `{error}` | unused | unused | Slated for deletion |
| POST | /api/register/ | register_view | none, auth | `{username, email, password, nativeLanguage, dateOfBirth?: YYYY-MM-DD}` (**camelCase**) | 201 `{message}` / 400 `{error}` | pages/RegisterPage.jsx | services/api/auth.ts:register (RegisterScreen) | Keys are camelCase, unlike every other endpoint. Username `^[\w.@+-]{1,30}$`; Django password validators apply |

### Profile and safety

| Method | Path | View | Auth/thr | Request | Response | Web callers | Mobile callers | Depends on / gotchas |
|---|---|---|---|---|---|---|---|---|
| GET, PATCH | /api/profile/ | profile_view | dflt | – | OwnProfile | context/UserContext.tsx via pages/Conversations/api/fetchUserProfile.ts; pages/Profile/page.jsx | services/api/auth.ts:fetchProfile (AuthContext, ProfileScreen) | PATCH is accepted but **changes nothing** (it just returns OwnProfile uncached) and has no caller. Clients key the current user on `user_id` (for example, web ChatRoom compares `message.sender.id` with `user.user_id`) |
| GET | /api/profile/data | profile_data_view | dflt | `?page=1&page_size=24 (max 100)&match=all\|reciprocal\|teaches_me&level=beginner\|...&match_only=1` | `{profiles: PeopleCard[], pagination}`. Cached 30 s | pages/Community/page.tsx (uses `match=`, `has_next` infinite scroll) | services/api/auth.ts:fetchPeople (CommunityScreen: page 1, size 24 only, no `match`) | **No trailing slash.** `match_only` is legacy and maps to `teaches_me`. No client sends it (only `tests/test_partner_matching.py`), but keep it. `level` filters on the *viewer's native language* level. Web also reads `bio`/`is_premium`, which aren't returned (falls back). Dead helper: pages/Community/api/getProfileData.ts |
| GET | /api/profile/public/<username>/ | public_profile_view | dflt | username matched case-insensitively | PublicProfile; 403 `{error:"This user is unavailable."}` if either side blocked | pages/PublicProfile/page.jsx | services/api/auth.ts:fetchPublicProfile (PublicProfileScreen, ConversationsScreen) | Side effect: records a ProfileView (shows up in the target's `recent_profile_viewers`). Cached 5 min per viewer. Clients `encodeURIComponent` the username |
| POST, DELETE | /api/profile/public/<username>/block/ | block_user_view | dflt | – | `{message, is_blocked_by_me}` | DELETE only: pages/Settings/page.jsx (unblock) | blockUser / unblockUser in services/api/auth.ts (PublicProfileScreen, ConversationsScreen, SettingsScreen) | POST **deletes all conversations** between the pair. Web has no block UI |
| POST | /api/profile/public/<username>/report/ | report_user_view | dflt, report | `{reason: spam\|harassment\|inappropriate_content\|impersonation\|scam\|other, details? (required if other)}` | 201 `{message}` | – | services/api/auth.ts:reportUser (PublicProfileScreen, ConversationsScreen) | Mobile only |
| GET | /api/profile/moderation/ | moderation_summary_view | dflt | – | `{blocked_profiles:[{username, profile_image_url, created_at}], reported_profiles:[{username, profile_image_url, reason, details, created_at}]}` | pages/Settings/page.jsx | services/api/auth.ts:fetchModerationSummary (SettingsScreen) | `profile_image_url` is the **raw stored value** (not absolute) |
| PATCH | /api/profile/edit/ | profile_edit_view | dflt | Any of `{username, native_language, base_translate_language, languages_practicing[≤20], practice_language_levels{}, email, date_of_birth (YYYY-MM-DD\|""\|null), location, bio, learning_goal, avatar_ring_color (#rrggbb), profile_image_url (own/Cloudinary host only)}`. JSON only (parses `request.body`) | `{message, updated_profile:{username, native_language, base_translate_language, languages_practicing, practice_language_levels, email, date_of_birth, location, location_updated_at, bio, learning_goal, profile_image_url (raw), avatar_ring_color}}` | pages/Profile/EditProfilePage.jsx; pages/Settings/page.jsx | updateProfile (ProfileScreen, reads `updated_profile`); updateSettings (SettingsScreen) | `practice_language_levels` keys must be in `languages_practicing` (the request value, else the stored one). Other keys are silently dropped. Web sends title-cased language labels. Dead helper: pages/Profile/api/editProfile.ts |
| PATCH | /api/profile/location/ | profile_location_update_view | dflt | `{location}` or `{city, country}` | `{location, location_updated_at}` | pages/Profile/page.jsx (auto geolocation) | – | Web only |
| PATCH | /api/profile/<user_id>/update-image/ | update_profile_image | dflt | multipart `profile_image` (image ≤10 MB, no SVG) + `slot: profile\|complementary_1\|complementary_2` | `{message, slot, profile_image_url, complementary_image_1_url, complementary_image_2_url}` (abs) | pages/Profile/page.jsx | services/api/auth.ts:uploadProfilePhoto (ProfileScreen) | 403 unless `user_id` = self. Dead component components/Images/DragDropImage.jsx calls it **without the trailing slash**, which would hit the SPA catch-all |
| DELETE | /api/profile/delete/ | delete_account_view | dflt | – | `{message}` | – | services/api/auth.ts:deleteAccount (SettingsScreen) | Mobile only (web has no delete-account UI) |
| POST | /api/presence/offline/ | mark_presence_offline_view | dflt | – | `{ok:true}` | layout/Layout.jsx:handleLogout (keepalive) | – | Mobile doesn't call it on logout. Presence relies on the ws disconnect |
| POST | /api/coach/chat/ | coach_chat_view | dflt + coach limits | `{message (≤2000), target_language?, mode?: casual_chat\|correct_me\|roleplay\|quiz_me\|vocabulary_drill}` | `{reply, target_language, native_language, mode}`; 400/429/503 `{detail}` | pages/Conversations/features/CoachChatRoom.jsx (reads `detail` on error) | services/api/coach.ts:sendCoachMessage (CoachChatScreen) | History lives on the client only (web localStorage / mobile AsyncStorage). An invalid mode silently becomes `casual_chat` |

### Conversations and messages

| Method | Path | View | Auth/thr | Request | Response | Web callers | Mobile callers | Depends on / gotchas |
|---|---|---|---|---|---|---|---|---|
| GET | /api/conversations/ | ConversationListView.get | dflt | – | ConversationListItem[] | pages/Conversations/api/getConversations.ts (`useGetConversations`, query key `conversationsList`; Layout, ConversationList) | services/api/conversations.ts:fetchConversations (15 s module cache; RootNavigator, ConversationsScreen) | Side effect: marks the caller's incoming `sent` messages `delivered` and broadcasts. Both clients patch list items locally (`last_message`, `unread_count`) |
| POST | /api/conversations/ | ConversationListView.post | dflt | `{participant: username}` (**exact**, case-sensitive match) | `{id}` (existing or new) | pages/Community/api/conversation.ts:createOrGetConversation (used by pages/PublicProfile/page.jsx) | createOrGetConversation (PublicProfileScreen, ConversationsScreen) | 404 if not found, 400 for self, 403 if blocked |
| GET | /api/conversations/<id>/ | ConversationDetailView.get | dflt, participant | – | ConversationDetail | pages/Conversations/features/ChatRoomWrapper.jsx | fetchConversation (ConversationsScreen) | Marks messages delivered. Web uses `messages`/`pinned_messages` only as a seed, then re-fetches `/messages/?page=1`. **Mobile shows only the embedded `messages`** (≤200, no older history) |
| DELETE | /api/conversations/<id>/ | ConversationDetailView.delete | dflt, participant | – | `{message}` | pages/Conversations/features/ConversationList.jsx (swipe delete) | – | Deletes for **both** participants |
| GET | /api/conversations/<id>/messages/ | MessageListView.get | dflt, participant | `?page=1&page_size=30 (max 100)` | `{messages: Message[] (chronological within page; page 1 = newest), pinned_messages: Message[] (all), pagination}`. An empty page has no `pinned_messages` key | ChatRoom.jsx:fetchMessagesPage (page size 30; older pages, jump-to-pinned, first-unread search) | – | Marks messages delivered. `has_next` means older messages exist |
| POST | /api/conversations/<id>/messages/ | MessageListView.post | dflt, participant | **multipart/form only** (`parser_classes = MultiPart, Form`, so JSON gets 415): `text` (≤5000), `attachment` (image/video/audio ≤25 MB), `reply_to` (msg id in the same conversation) | 201 Message | ChatRoom.jsx (FormData) | sendConversationMessage (text + reply_to only, no attachments) | Doesn't broadcast the message itself, only `conversation_update_event` `message_created`. Both clients then send a ws `{type:"chat", id, ...}` relay with the saved id |
| PATCH | /api/conversations/<id>/read/ | mark_conversation_read_view | dflt, participant | – | `{updated: n}` | pages/Conversations/api/markConversationRead.ts (ChatRoom) | markConversationRead (ConversationsScreen) | Broadcasts `message_status_event` read + `conversation_update_event` `messages_read` |
| DELETE | /api/messages/<id>/delete/ | MessageDeleteView.delete | dflt, sender only (404 otherwise) | – | `{message}` | pages/Conversations/api/deleteMessage.ts (ChatRoom) | deleteConversationMessage (ConversationsScreen) | **No server broadcast.** Clients send a ws `deleteMessage` event themselves |
| PATCH | /api/messages/<id>/edit/ | MessageEditView.patch | dflt, sender only | `{text}` (≤5000; empty only OK if there's an attachment) | Message (`edited_at` set) | pages/Conversations/api/editMessage.ts (ChatRoom) | – | Web only. Broadcasts `message_edit_event` + `message_updated`. Same text → returns unchanged |
| POST | /api/messages/translate/ | translate_message_view | dflt, translate | `{message_id?, text?, target_language}` (name or 2-3 letter code; unknown → `en`). With `message_id` the stored text is used and the result saved per user | 200 `{translated_text, source_language, target_language, cached}`. 400 `{error, already_translated:true, translated_text, ...}` or `{error, same_language:true, ...}`. 502 if upstream fails | Conversation.jsx:handleTranslate (message_id); PracticePage.jsx (free text) | translateConversationMessage (ConversationsScreen; reads `translated_text` from the **400 already_translated body**); translatePracticeSentence (PracticeScreen) | Uses the unofficial Google `translate_a` endpoint. A non-numeric `message_id` causes a 500 (known issue). Mobile defaults the target to "english" |
| POST | /api/messages/<id>/react/ | react_to_message_view | dflt, participant | `{emoji}`: one of 👍 ❤️ 😂 😮 😢 🙏; empty = remove | Message | Conversation.jsx:handleReact | reactToMessage (ConversationsScreen) | Broadcasts `message_reaction_event` with the full Message |
| PATCH | /api/messages/<id>/pin/ | pin_message_view | dflt, participant | `{is_pinned: bool\|"true"}` | Message | pages/Conversations/api/pinMessage.ts (ChatRoom) | pinConversationMessage (ConversationsScreen) | Broadcasts `message_pin_event` + `message_pinned`/`message_unpinned`. Doesn't change `updated_at` |

### Practice

| Method | Path | View | Auth/thr | Request | Response | Web callers | Mobile callers | Depends on / gotchas |
|---|---|---|---|---|---|---|---|---|
| GET | /api/practice/state/ | practice_state_view | dflt | `?language=` | `{language, stats: PracticeStats, leaderboard[], current_rank}` | pages/PracticePage.jsx:fetchState | services/api/practice.ts:fetchPracticeState (PracticeScreen) | Creates PracticeStats on the first call |
| GET | /api/practice/challenge/ | practice_challenge_view | dflt | `?language=` | `{language, challenge: Challenge, stats}`; 500 `{error}` if no templates | PracticePage.jsx:fetchChallenge | fetchPracticeChallenge | The answer stays server-side (cache/library) |
| POST | /api/practice/submit/ | practice_submit_view | dflt | `{challenge_id, selected_word, language}` | `{correct, correct_answer, awarded_xp, awarded_points, language, stats, leaderboard, current_rank}` | PracticePage.jsx | submitPracticeAnswer | Replaying the same id farms XP (known issue). XP +15/+3, points +10/+1, level = xp//100+1 |

### Non-API routes (backend/core/urls.py)

- `admin/`: Django admin (unusable, no `is_staff`).
- Root static files from the frontend build: `favicon.ico`, `manifest.json`, `robots.txt`, `sitemap.xml`, `logo192/512.png`, `coach-avatar-favicon.svg`.
- `media/<path>`: served unauthenticated. This happens when DEBUG is on (both urlconfs add `static()`), or in prod with local storage. With Cloudinary, URLs point to Cloudinary directly.
- `^.*$` → `core/views.py:front`: SPA `index.html` (or a prerendered `<path>/index.html`; path-traversal guarded). It catches **every** unmatched path, including bad `/api/...` paths, for any method.

## Cross-client coupling / change checklist

- **The 200-message cap.** Mobile's chat history comes only from `GET /conversations/<id>/` `messages` (`CONVERSATION_DETAIL_MESSAGE_LIMIT=200`, `serializers.py`). Lowering the cap or dropping `messages` loses mobile history. Web pages older messages via `/messages/?page=N` (30 per page) and treats `has_next` as "older exist". Keep pages newest-first, with each page's array chronological.
- **Mobile pinned list.** Mobile rebuilds `pinned_messages` locally from the loaded messages after any change (`buildPinnedMessages` in ConversationsScreen). Pins older than the latest 200 disappear on mobile after the first local update. Web uses the server's `pinned_messages` (detail and every `/messages/` page).
- **Message send is multipart only.** Both clients send FormData. Adding a JSON parser is safe; removing the multipart parser breaks both. The text field is `text`, the reply field is `reply_to` (string id), and the file field is `attachment`.
- **Message shape.** Web and mobile both render `sender.id/username`, `status` ticks, `reply_to.{id,text,sender.username}`, `reactions[]` and `current_user_reaction`, `is_pinned` and `pinned_by`, `edited_at`, `attachment_url` and `translated_text`/`can_translate`. Web also tolerates `attachmentUrl` (the ws relay's camelCase). Renaming any of these breaks both clients and the ws relay payloads (`message_*_event` carry the full serialized Message).
- **`sender`/`receiver` on a conversation** are creator and other participant, not "me" and "them". Both clients derive the partner by id. Don't change their meaning.
- **List item vs detail.** List items return `messages: []` and `pinned_messages: []`. Mobile's `Conversation` type marks `messages` as required, so keep the key present (empty) in list responses.
- **`unread_count`** = messages from the other user with `status != "read"`. Web ChatRoom and mobile use it to find the first-unread anchor (web walks older pages until it is found).
- **GET side effects.** The list, detail and `/messages/` GETs all mark messages `delivered` and broadcast. Clients rely on this for delivery ticks; there is no separate "delivered" endpoint.
- **`profile/data`**:
  - No trailing slash. Keep the `match_only` legacy param, which tests cover; no current client sends it.
  - Mobile sends no `match` (gets `all`) and only loads page 1.
  - Web reads `pagination.has_next` and `match.{teaches_me,learns_mine,reciprocal}`.
  - Items have no `id`, and both clients key cards by `username`.
- **Own-profile id is `user_id`** (profile/ and public profile), while ProfileSummary uses `id`. Web compares `message.sender.id === user.user_id`, and mobile uses `user.user_id` for the update-image URL. Mobile `ProfileScreen` merges `updated_profile` from `profile/edit/`, and the image upload response is merged by both clients.
- **Translate 400 bodies are part of the contract.** Web disables the translate button on `already_translated`/`same_language`. Mobile shows `translated_text` from the 400 `already_translated` body, and practice translate (both clients) skips targets on `same_language`.
- **Error keys differ by endpoint.** Web login reads `detail` (the backend sends `message`). Coach clients read `detail`. Everything else reads `error`. If you unify the error shape, update LoginPage.jsx, CoachChatRoom.jsx and mobile alerts.
- **Register uses camelCase** (`nativeLanguage`, `dateOfBirth`), and both clients send camelCase. profile/edit uses snake_case (`native_language`, `date_of_birth`).
- **Moderation summary image URLs are raw.** Both clients resolve them with a `/media/` prefix. If you switch to `build_media_url`, make sure the clients' resolvers accept absolute URLs (they do, via `startsWith("http")`).
- **Refresh does not rotate.** Mobile keeps its refresh token if none is returned. If you enable `ROTATE_REFRESH_TOKENS` plus a blacklist, mobile already stores the new token. Web uses cookies (reset by the view), and logout should then POST the refresh token (mobile currently doesn't call `/logout/`).
- **CSRF.** Any new unsafe endpoint called from web needs no client work (global patch), as long as it goes through `window.fetch` or axios against the `BASE_URL` origin. Endpoints with `authentication_classes([])` skip CSRF.
- **Blocking.** `POST block/` deletes the shared conversations. Public profile returns 403 when either side blocked. The conversation POST and message POST return 403 if blocked. People lists exclude blocked users in both directions.
- **Client-side relays.** Delete has no server broadcast, and new messages are relayed by the client over the ws. If you move broadcasting server-side, remove the client relays (ChatRoom.jsx `sendSocketEvent`, ConversationsScreen ws `chat`/`deleteMessage`) to avoid duplicates.

## Client coverage asymmetries

- **Web only:** `presence/offline/`, `logout/`, `csrf/`, `profile/location/`, message edit, `/messages/` paging, conversation DELETE.
- **Mobile only:** `profile/delete/`, block POST, report.
- **Unused:** `login/` (legacy), `profile/` PATCH (no-op), `admin/`.
- **Dead web helpers:**
  - `pages/Community/api/getProfileData.ts`
  - `pages/Profile/api/editProfile.ts`
  - `components/Images/DragDropImage.jsx`, which also has the bad no-slash URL.
