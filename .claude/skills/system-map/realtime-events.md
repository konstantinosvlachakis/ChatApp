# Realtime events (websockets) — system map

Purpose: every websocket endpoint and event type across backend, web and mobile, so you don't have to re-read `consumers.py` / `ChatRoom.jsx` / `ConversationsScreen.tsx`.

Verified at commit c1d44c5 (2026-10-26).
Refresh: `git diff --stat c1d44c5..HEAD -- backend/chatapp/consumers.py backend/chatapp/views.py frontend/src mobile/src`, then update only the affected rows and bump the commit line.

## Wiring
- `backend/core/asgi.py`: `ProtocolTypeRouter` → `http` = Django; `websocket` = `URLRouter(chatapp.routing.websocket_urlpatterns)`. There is **no** auth/session middleware; consumers authenticate the JWT themselves.
- `backend/chatapp/routing.py` (live): `ws/presence/` → `PresenceConsumer`; `ws/socket-server/<room_name>/` → `ChatConsumer`.
- `backend/chatapp/urls.py` also has a `websocket_urlpatterns` list (`<int:conversation_id>` kwarg). It is **dead**: asgi doesn't use it, and the kwarg name doesn't match the `room_name` the consumer reads.
- Channel layer: Redis when `USE_REDIS_REALTIME` is set, otherwise in-memory (`CHANNEL_LAYERS` in `core/settings.py`). Production runs `daphne` (`Procfile`).

## Auth (`PresenceTrackingMixin.get_user_id_from_token`, shared by both consumers)
Checks run in this order; the first token found wins:
1. `Authorization: Bearer <jwt>` header (mobile).
2. `lv_access` cookie (`AUTH_COOKIE_ACCESS`, web). Accepted only if `_origin_is_allowed()` passes: no Origin header is OK (native clients); otherwise the Origin must be in `CORS_ALLOWED_ORIGINS`, match the handshake `Host`, or match explicit `ALLOWED_HOSTS` (the `*` entry is ignored).
3. Legacy `?token=` query param. Web sends it only on localhost when a legacy token is in storage (`getLegacyAccessToken`). Slated for removal.

The token is validated with SimpleJWT `AccessToken` (1 h lifetime). Neither consumer re-checks expiry once the socket is open.

## Sockets
| | Presence socket | Chat socket |
|---|---|---|
| URL | `ws/presence/` | `ws/socket-server/<conversation_id>/` |
| Consumer | `PresenceConsumer` | `ChatConsumer` |
| Reject | `close(4401)` if not authenticated | `close(4403)` for **any** failure: no or invalid token, non-numeric id, or not a participant (`get_participant_details`). It never sends 4401, although `backend-status` says it does. |
| Groups | `presence_user_<own id>` (`user_presence_group_name`) | `str(conversation_id)` (the bare numeric id) |
| On connect | `increment_presence`; if the user just came online → `broadcast_presence(True)`; then sends `initial_online_users` | `increment_presence` (chat sockets count toward presence too); if the user just came online → broadcast |
| On disconnect | `decrement_presence`; if the user just went offline → `broadcast_presence(False)` (contacts re-read) | Sends `typing_event`(stopped) to the room and `typing_status_event`(false) to the other user's presence group; then `decrement_presence` and a possible offline broadcast |
| Frame cap | `WS_MAX_MESSAGE_BYTES` (64 KB); bigger frames are silently dropped | same, plus chat text ≤ `MESSAGE_MAX_LENGTH` (5000) |
| Client→server types | `heartbeat` only | `chat` (default when `type` is missing), `deleteMessage`, `user_typing`, `user_stopped_typing`, `call_invite`, `call_accept`, `call_reject`, `call_end`, `webrtc_offer`, `webrtc_answer`, `webrtc_ice_candidate` |

### Presence semantics (`consumers.py`)
- `Profile.ws_connection_count` counts every open socket (presence and chat) across processes. It changes only through atomic `F()` UPDATEs.
- `increment_presence`: if the user is already online and `last_seen` is fresh → count+1 and return "not new". Otherwise → count+1, `is_online=True`, `last_seen=now`, and return "came online". A stale online row is treated as coming online, so contacts get told again.
- `decrement_presence`: count>1 → count−1. count≤1 and online → `0`, `is_online=False`, `last_seen=now`, and return "went offline". The loop retries 3× on races.
- Freshness: a user counts as online only when `is_online` is true **and** `last_seen` is within `ONLINE_FRESHNESS_SECONDS` (90). The same rule is used by `get_online_contact_ids` (initial list) and `ProfileSerializer.get_is_online` (REST).
- Heartbeat: web sends `{"type":"heartbeat"}` every 20 s (`Layout.jsx`). `PresenceConsumer.receive` writes `last_seen` at most once per `PRESENCE_TOUCH_INTERVAL_SECONDS` (60) per socket, measured from connect or the last touch (monotonic clock). `touch_presence` also skips the write if another socket touched `last_seen` within the last 30 s. The chat socket ignores heartbeats.
- Audience: `get_presence_contact_ids` returns users who share a conversation with this user, minus blocked pairs in either direction. Presence and typing are only ever sent to the `presence_user_<contact>` groups, never globally. Contacts are cached per socket for the online event and re-read for the offline event.
- `POST /api/presence/offline/` (`mark_presence_offline_view`, called by web logout) forces count=0 and offline, then sends `broadcast_presence_update(False)`.
- `reset_presence` management command runs in `Procfile` `release` (migrate → reset_presence → collectstatic). It sets count=0 and `is_online=False` for everyone, clearing counts left behind by crashed dynos.

## Event catalog
Wire names are given as sent. "Internal" is the channel-layer `type` (the consumer method name). Unless stated, chat-socket relays skip the sender's own channel (`sender_channel_name`); events that originate in views.py go to every socket in the group, including the actor's.

| Event `type` (wire) | Dir | Socket | Sent by | Target | Payload | Web handler | Mobile handler | Notes |
|---|---|---|---|---|---|---|---|---|
| `heartbeat` | C→S | presence | web `layout/Layout.jsx` `connectPresenceSocket` (setInterval 20 s) | — | — | — | **never sent** | Touches `last_seen` at most every 60 s |
| `initial_online_users` | S→C | presence | `PresenceConsumer.connect` | own socket | `user_ids[]` (only fresh online contacts) | `Layout.jsx` onmessage → `setOnlineUserIds` (exposed via `PresenceContext`) | `ConversationsScreen` presence effect → `setOnlineUserIds`; ignored by `RootNavigator` | Clients also accept `userIds` |
| `presence_update` | S→C | presence | `send_presence_update` ← `broadcast_presence` (consumers connect/disconnect) or `views.broadcast_presence_update` (presence/offline view). Internal `presence_update_event` | `presence_user_<contact>` for each contact | `user_id`, `is_online` | `Layout.jsx` updates the set and fans out to listeners; `ConversationList` clears typing for that user when offline; `ChatRoom` effect clears typing when the other user leaves `onlineUserIds`; `ChatHeader` shows the dot | `ConversationsScreen` → `setOnlineUserIds` | |
| `typing_status` | S→C | presence | `ChatConsumer.receive` (typing) and `ChatConsumer.disconnect`. Internal `typing_status_event` | `presence_user_<other participant>` | `conversation_id`, `sender_id`, `is_typing` | `ConversationList` subscriber → `presenceTypingByConversation` (sidebar dots) | `ConversationsScreen` → `setRemoteTyping` | Lets the list show typing without a chat socket |
| `conversation_update` | S→C | presence | `views.broadcast_conversation_update`. Internal `conversation_update_event` | `presence_user_<id>` for **both** participants | `conversation_id`, `trigger`, `actor_id` | `ConversationList` → `invalidateQueries(["conversationsList"])`. Ignored elsewhere: `Layout` only forwards to listeners, and `ConversationList` is mounted only under `/conversations` | `RootNavigator` → `loadUnreadChatsCount` (tab badge); `ConversationsScreen` → `bumpConversationToTop` + `loadConversations(true)` | Triggers: `message_created` (`MessageListView.post`), `message_updated` (`MessageEditView.patch`), `messages_read` (`mark_conversation_read_view`), `message_pinned`/`message_unpinned` (`pin_message_view`). **Not** sent on delete, delivered, react, or new conversation |
| `chat` | C→S | chat | web `ChatRoom.handleSendMessage` (after REST POST, one retry after 250 ms); mobile `ConversationsScreen.sendMessage` (one retry after 220 ms) | — | `id`, `message`, `attachmentUrl`, `replyTo` (+ `sender`, `senderId`, which are ignored) | | | Relay only: the REST POST already persisted the message. The server drops it if `message` isn't a str or exceeds 5000 chars |
| `chat` | S→C | chat | `ChatConsumer.chat_message` | room except sender | `id`, `message`, `sender` (server username), `senderId` (server id), `attachmentUrl` (**client-supplied**), `replyTo` (**client-supplied**) | `ChatRoom` onmessage: dedupe by id, append, `markConversationRead` if incoming, `applyNewMessageToConversationList` (`markRead` if incoming) or invalidate, `invalidateConversationHistoryCache` | `ConversationsScreen` chat effect: append (drops `attachmentUrl`), `bumpConversationToTop`, mark read if focused, `loadConversations(true)` | No `status`/`timestamp` from the server; clients stamp local time |
| `deleteMessage` | C→S | chat | web `ChatRoom.handleDeleteMessage`, mobile `ConversationsScreen.deleteMessage` (after REST DELETE) | — | `messageId` (must be int) | | | **No ownership check**: any participant can make the peer hide any message id locally |
| `deleteMessage` | S→C | chat | `ChatConsumer.delete_message` | room except sender | `messageId` | `ChatRoom`: filter it out + invalidate history cache | `ConversationsScreen`: filter it out | `MessageDeleteView` itself broadcasts nothing |
| `user_typing` / `user_stopped_typing` | C→S | chat | web `ChatRoom.handleTyping`/`handleStopTyping` (+ cleanup); mobile `sendTypingEvent` (`emitTypingStarted`/`Stopped`, cleanup) | — | (`sender`, ignored) | | | Also produces `typing_status` on the presence socket |
| `user_typing` / `user_stopped_typing` | S→C | chat | `ChatConsumer.typing_event` (internal `typing_event`; also sent on disconnect as stopped) | room except sender | `senderId` | `ChatRoom` → `setIsOtherUserTyping` + `onConversationTypingChange` | `ConversationsScreen` → `setRemoteTyping` | |
| `message_status` | S→C | chat | `views.broadcast_message_status_update` ← `mark_messages_delivered` (on GET conversation list/detail/messages, `delivered`) and `mark_conversation_read_view` (`read`). Internal `message_status_event` | room group `str(conversation_id)` (all sockets) | `messageIds[]`, `status`, `actorId` | `ChatRoom` → `mergeMessageStatusUpdate` + `applyMessageStatusToConversationList` (or invalidate) | `ConversationsScreen` → maps the status onto messages | Only reaches open chat sockets |
| `message_reaction` | S→C | chat | `views.react_to_message_view`. Internal `message_reaction_event` | room (all) | `message` (full `MessageSerializer` of the **actor**: `current_user_reaction`/translations are the actor's) | `ChatRoom` → `mergeMessageUpdate` | `ConversationsScreen` → `applyMessageUpdate` (also accepts `messageReaction`) | Serializer context is the actor; receivers may get the wrong `current_user_reaction` |
| `message_edited` | S→C | chat | `views.MessageEditView.patch`. Internal `message_edit_event` | room (all) | `message` (serialized) | `ChatRoom` → `mergeMessageUpdate`, close the editor, invalidate list | **not handled** | |
| `message_pinned` | S→C | chat | `views.pin_message_view` (pin and unpin). Internal `message_pin_event` | room (all) | `message` (serialized, `pinned_at`/`pinned_by`) | `ChatRoom` → `mergeMessageUpdate`, invalidate list | `ConversationsScreen` → `applyMessageUpdate` | |
| `webrtc_offer` | C→S / S→C | chat | web `ChatRoom.startCall`. Internal `call_event` | room except sender | `sdp`, `callMode` (`audio`/`video`) | `ChatRoom`: if not idle → reply `call_reject` "User is busy."; else store the offer, `setCallState("incoming")` (UI in `CallPanel.jsx`) | none (no calls on mobile) | Starts a 30 s `CALL_TIMEOUT_MS` |
| `webrtc_answer` | both | chat | `ChatRoom.acceptIncomingCall` | room except sender | `sdp` | `setRemoteDescription`, flush ICE, state `connecting` | none | |
| `webrtc_ice_candidate` | both | chat | `ChatRoom.createPeerConnection` `onicecandidate` | room except sender | `candidate` | `addIceCandidate`, or queue in `pendingIceCandidatesRef` until the remote description is set | none | ICE servers from `getIceServers` (`REACT_APP_WEBRTC_ICE_SERVERS`, default public STUN) |
| `call_accept` | both | chat | `ChatRoom.acceptIncomingCall` (sent after the answer) | room except sender | — | caller: `calling` → `connecting` | none | |
| `call_reject` | both | chat | `ChatRoom.declineIncomingCall`, accept failure, busy auto-reply | room except sender | `reason` | `setCallError(reason)` + `resetCallState` | none | |
| `call_end` | both | chat | `ChatRoom.endCall` (hang-up/timeout); socket-effect cleanup if a call is active | room except sender | `callMode`, `durationSeconds` | `appendCallSummary` + `resetCallState` | none | Summary is local-only (not persisted) |
| `call_invite` | C→S / S→C | chat | **nobody** (server allow-lists it) | room except sender | `callMode` | not handled (warns "Unknown message type") | none | Dead type |

Count: 21 distinct wire types (`heartbeat`, `initial_online_users`, `presence_update`, `typing_status`, `conversation_update`, `chat`, `deleteMessage`, `user_typing`, `user_stopped_typing`, `message_status`, `message_reaction`, `message_edited`, `message_pinned`, `webrtc_offer`, `webrtc_answer`, `webrtc_ice_candidate`, `call_accept`, `call_reject`, `call_end`, `call_invite`; mobile also accepts the alias `messageReaction`). Seven of them run in both directions.

## Client socket lifecycle
- **Web presence** (`layout/Layout.jsx`): one socket per logged-in tab, keyed on `user.user_id`. Heartbeat every 20 s. Reconnects after 3 s unless the close code is 1008/4401/4403. Closed on logout (`handleLogout` also calls presence/offline and logout). Listeners subscribe via `usePresence().subscribeToPresenceEvents` (`context/PresenceContext.jsx`).
- **Web chat** (`pages/Conversations/features/ChatRoom.jsx`): one socket per open conversation. Reconnect backoff is `[800,1500,3000,5000]` ms; it stops on `SOCKET_AUTH_CLOSE_CODES` {1008,4401,4403}. The per-effect `isDisposed` flag ignores stale sockets. `socketStatus` drives the UI.
- **Mobile presence**: **two** sockets while the Chats tab is mounted. `navigation/RootNavigator.tsx` handles only `conversation_update` and reconnects every 1.5 s on any close, including 4401. `screens/ConversationsScreen.tsx` handles presence/typing/conversation_update and never reconnects. Both send `Authorization: Bearer` from `tokenStorage` (`services/storage.ts`). WS base = `API_BASE_URL.replace(/^http/,"ws")`.
- **Mobile chat** (`ConversationsScreen`): opened for `selectedConversation.id`. It also re-runs when `isFocused` changes, so switching tabs drops and reopens it. No reconnect.

## Known gaps / bugs
1. **Mobile never sends `heartbeat`.** `last_seen` is written only on connect, so after about 90 s `is_online` (REST) and `initial_online_users` report mobile users as offline, even though no `presence_update(false)` was sent. When the next socket opens, `increment_presence` treats the stale row as "came online" and broadcasts online again.
2. **Chat sockets count toward presence but cannot heartbeat.** A user with only a chat socket open goes stale the same way.
3. **The chat relay trusts client fields.** `attachmentUrl`, `replyTo` and `id` come from the client. Web scheme-checks attachment URLs in `Conversation.jsx`; mobile drops `attachmentUrl`. A malicious client can also relay a `chat` frame that was never persisted (clients render it until the next reload). The server should re-read the message from the DB by id.
4. **`deleteMessage` relay has no authorization.** Any participant can make the other side hide any message id. `MessageDeleteView` doesn't broadcast itself.
5. **New messages reach an open chat only through the client relay.** `MessageListView.post` sends only `conversation_update`. If the sender's socket is down (both clients retry once, then give up), the receiver sees the message only after a list refetch, and web `ChatRoom` doesn't refetch the open chat on `conversation_update`.
6. **Expired access token on web.** The web app refreshes only in `fetchUserProfile` (at app load). After the 1 h access cookie expires, socket reconnects get 4401/4403 and stop permanently (no refresh-and-retry), and REST calls 401 until the page is reloaded.
7. **Expired token on mobile.** Sockets reuse the stored access token, which is refreshed only by an HTTP 401. `RootNavigator` then loops on 4401 every 1.5 s until some REST call refreshes the token. `ConversationsScreen` sockets just die.
8. Mobile ignores `message_edited` (no live edits) and has no WebRTC calls. Web never sends or handles `call_invite`.
9. `message_reaction` payloads are serialized for the actor, so `current_user_reaction` and `translated_text` can be wrong for the receiver. Web `mergeMessageUpdate` may overwrite the receiver's own reaction state; verify before relying on it.
10. Web `conversation_update` is handled only while `ConversationList` is mounted (`/conversations*`). On other pages the nav unread badge and the browser `Notification` in `Layout.jsx` update only on window focus or remount.
11. Web logout calls `presence/offline`, which zeroes the count while other tabs' sockets are still open. That user then shows offline until another socket connects.
12. The ChatConsumer close code is 4403 even for a missing or expired token (it is documented as 4401). Clients treat both codes the same.
13. Presence and typing events are filtered by block, but the chat room itself is not: a blocked pair can still relay typing and call events over an already-open chat socket. REST POST is blocked.
14. Dead `websocket_urlpatterns` in `chatapp/urls.py`.
