# LangVoyage Mobile (React Native / Expo)

This is a React Native client scaffold for your existing Django backend.

## 1) Install dependencies

```bash
cd mobile
npm install
```

## 2) Configure backend URL

Edit `src/config/api.ts`:
- Android emulator: `http://10.0.2.2:8000`
- iOS simulator: `http://localhost:8000`
- Real device: `http://<YOUR_LAN_IP>:8000`

## 3) Run

```bash
npm run start
```

Then press:
- `i` for iOS simulator
- `a` for Android emulator

## Current scaffold includes

- Auth context + token persistence (`AsyncStorage`)
- Navigation structure (Auth stack + App tabs)
- Starter screens mapped from web app:
  - People (`CommunityScreen`)
  - Chats (`ConversationsScreen`)
  - Profile (`ProfileScreen`)
  - Settings (`SettingsScreen`)
- Axios API client + key endpoints

## Next migration steps

1. Move your exact web UI patterns into RN components.
2. Add websocket chat behavior for conversations.
3. Replace simple settings inputs with your mobile dropdown selector UX.
4. Add push notifications (`expo-notifications`).
