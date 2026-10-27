# LangVoyage Mobile (React Native / Expo)

This is a React Native client scaffold for your existing Django backend.

## Expo Go on a phone

The app uses **Expo SDK 58**. Use an Expo Go installation that supports SDK 58
and Node **22.13+** (Node 22 LTS is recommended) for local development.

```bash
cd mobile
npm ci
EXPO_PUBLIC_API_BASE_URL=https://langvoyage-d3781c6fad54.herokuapp.com npm start -- --go --lan
```

Connect your phone and computer to the same Wi-Fi. On iPhone, scan the terminal
QR code with Camera and open it in Expo Go. Keep the development server running.
The command above uses the deployed backend and its real accounts/data.

To use a local backend instead, omit `EXPO_PUBLIC_API_BASE_URL` and run Django
on `0.0.0.0:8000`; the app derives your computer's LAN address from Expo.
Release builds require an explicit HTTPS backend URL.

Speech recognition requires a custom development build; the rest of Practice
remains available in Expo Go. Remote push notifications also require a
development build and configured EAS project credentials.

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
