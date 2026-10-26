---
name: mobile-status
description: Current state of the LangVoyage Expo/React Native app (mobile/) — navigation, API/auth/token handling, release requirements, verification and open issues. Load before changing or reviewing anything under mobile/.
---

# Mobile status (Expo / React Native)

Last verified: 2026-10-26 at commit `79ec3a9`; updated in PR `fix/reliability`. Refresh: `git log --oneline 79ec3a9..HEAD -- mobile` — re-read only changed files, then update this file.

## Navigation (`src/navigation/RootNavigator.tsx`)
Auth stack: `Login`, `Register`. App: `AppTabs` (tabs `People`, `Practice`, `Chats`, `Profile`, `Premium`) + `Settings`. People stack: `CommunityHome`, `PublicProfile`. Chats stack: `ChatsHome`, `CoachChat`.
Screens in `src/screens/`, shared UI in `src/components/` (`PartnerCard`, `ReportUserModal`, `CoachAvatar`), theme in `src/theme/`, types in `src/types/`.

## API and auth
- `src/config/api.ts` — base URL. Dev falls back to loopback / Android emulator / Metro LAN host. **Release (`!__DEV__`) requires `EXPO_PUBLIC_API_BASE_URL` with `https://` or the app refuses to start.**
- `src/services/api/client.ts` — axios with Bearer header and single-flight refresh-on-401. Tokens stored via `expo-secure-store` (`src/services/storage.ts`).
- `src/services/api/{auth,conversations,coach,practice}.ts`. `clearConversationsCache()` (with generation guard) runs on logout and account deletion.
- `src/context/AuthContext.tsx` — session bootstrap (any startup failure logs out — UX choice).
- WebSockets send the JWT in a header (not the URL); backend closes with 4401/4403. Presence sockets heartbeat every 20 s (`src/services/realtime.ts`). `RootNavigator`'s presence socket reconnects with exponential backoff + jitter (paused while backgrounded) and on 4401/4403 refreshes the token once (`refreshAccessToken`, exported from `client.ts`).
- Chat (`ConversationsScreen`): messages/deletes/edits arrive as server `message_created`/`message_deleted`/`message_edited` events (deduped by id against the POST response; no client relay). The detail's embedded ≤200 messages are the first page; scrolling to the top loads older pages from `/conversations/<id>/messages/?page=&page_size=50`.
- Coach history/preferences: `src/features/coachConversation.ts` (AsyncStorage, survives logout).

## Verify
```bash
cd mobile && npx tsc --noEmit
```
As of 2026-10-26 the only errors are TS2307 because these declared deps aren't installed locally: `@expo-google-fonts/sora`, `@expo-google-fonts/manrope`, `react-native-country-flag`, `expo-speech`, `expo-secure-store`. Run `npm install` in `mobile/` (needs user approval) — token storage fails at runtime without `expo-secure-store`.

## Release checklist
- Set `EXPO_PUBLIC_API_BASE_URL=https://...` in EAS env / git-ignored `.env`.
- Replace placeholder bundle id / package `com.anonymous.langvoyagemobile` in `app.json`.
- Camera permission is disabled (`expo-image-picker` `cameraPermission: false`); microphone kept for speech recognition.

## Open issues
`resolveMediaUrl` accepts any absolute http(s) URL (restrict to API origin + https); coach history not cleared on account deletion; logout can't revoke refresh token until backend adds blacklist (then POST refresh token on logout).
