// Push notifications for new chat messages (backend: chatapp/push.py, POST/DELETE /push/devices/).
//
// - initNotifications() (App.tsx, once): foreground handler, Android "messages" channel,
//   tap listener (warm and cold start).
// - registerForPushNotifications() (AppTabs, after login / on start when authenticated):
//   explains + asks permission once, gets the Expo push token and registers it.
// - unregisterPushDevice() (AuthContext.logout, before the tokens are cleared).
// - setOpenConversationId() (ConversationsScreen): no banner for the chat already on screen.
// - subscribeToNotificationOpens() (AppTabs): taps are queued until the app is logged in.
import { Alert, AppState, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { api } from "./api/client";

const MESSAGES_CHANNEL_ID = "messages";
const PROMPTED_KEY = "lv_push_permission_prompted";
const REGISTERED_TOKEN_KEY = "lv_push_registered_token";
const UNREGISTER_TIMEOUT_MS = 5_000;

let initialized = false;
let openConversationId: number | null = null;
let warnedMissingProjectId = false;
let registerInFlight: Promise<void> | null = null;
let pendingOpenConversationId: number | null = null;
const handledResponseIds = new Set<string>();
const openListeners = new Set<(conversationId: number) => void>();

const logOnce = (message: string) => {
  if (__DEV__) console.warn(`[push] ${message}`);
};

/** The conversation currently on screen (null when none). */
export function setOpenConversationId(conversationId: number | null) {
  openConversationId = conversationId;
}

function messageConversationId(data: unknown): number | null {
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  if (record.type !== "message") return null;
  const id = Number(record.conversation_id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function handleResponse(response: Notifications.NotificationResponse | null) {
  if (!response) return;
  const identifier = response.notification.request.identifier;
  if (handledResponseIds.has(identifier)) return;
  handledResponseIds.add(identifier);
  if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
  const conversationId = messageConversationId(response.notification.request.content.data);
  if (!conversationId) return;
  if (openListeners.size === 0) {
    // Not logged in (or still starting): AppTabs picks it up once it mounts.
    pendingOpenConversationId = conversationId;
    return;
  }
  openListeners.forEach((listener) => listener(conversationId));
}

/** Called by AppTabs (mounted only when authenticated); replays a tap that arrived earlier. */
export function subscribeToNotificationOpens(listener: (conversationId: number) => void) {
  openListeners.add(listener);
  if (pendingOpenConversationId) {
    const conversationId = pendingOpenConversationId;
    pendingOpenConversationId = null;
    listener(conversationId);
  }
  return () => {
    openListeners.delete(listener);
  };
}

export function initNotifications() {
  if (initialized || Platform.OS === "web") return;
  initialized = true;

  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const conversationId = messageConversationId(notification.request.content.data);
      const isOpenChat =
        conversationId !== null &&
        conversationId === openConversationId &&
        AppState.currentState === "active";
      return {
        shouldShowBanner: !isOpenChat,
        shouldShowList: !isOpenChat,
        shouldPlaySound: !isOpenChat,
        shouldSetBadge: false,
      };
    },
  });

  if (Platform.OS === "android") {
    Notifications.setNotificationChannelAsync(MESSAGES_CHANNEL_ID, {
      name: "Messages",
      importance: Notifications.AndroidImportance.HIGH,
      sound: "default",
      vibrationPattern: [0, 200, 120, 200],
    }).catch(() => {});
  }

  Notifications.addNotificationResponseReceivedListener(handleResponse);
  // Cold start: the tap that launched the app.
  Notifications.getLastNotificationResponseAsync()
    .then((response) => {
      handleResponse(response);
      if (response) Notifications.clearLastNotificationResponseAsync().catch(() => {});
    })
    .catch(() => {});
}

function getProjectId(): string | null {
  const fromConfig = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)
    ?.eas?.projectId;
  const projectId = fromConfig || Constants.easConfig?.projectId;
  return typeof projectId === "string" && projectId ? projectId : null;
}

function askWithExplanation(): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      "Get message notifications?",
      "LangVoyage can let you know when a language partner sends you a message.",
      [
        { text: "Not now", style: "cancel", onPress: () => resolve(false) },
        { text: "Turn on", onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) }
    );
  });
}

async function ensurePermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  // Ask once per install; afterwards the user can enable it in system settings.
  if (await AsyncStorage.getItem(PROMPTED_KEY)) return false;
  await AsyncStorage.setItem(PROMPTED_KEY, "1");
  if (!(await askWithExplanation())) return false;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

async function registerOnce() {
  if (Platform.OS === "web") return;
  if (!Device.isDevice) {
    logOnce("Push notifications need a physical device; skipping registration.");
    return;
  }
  const projectId = getProjectId();
  if (!projectId) {
    if (!warnedMissingProjectId) {
      warnedMissingProjectId = true;
      logOnce("No EAS projectId (run `eas init`); push notifications are disabled.");
    }
    return;
  }
  if (!(await ensurePermission())) return;

  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  if (!token) return;
  await api.post("/push/devices/", {
    token,
    platform: Platform.OS === "ios" ? "ios" : "android",
  });
  await AsyncStorage.setItem(REGISTERED_TOKEN_KEY, token);
}

/** Register (or refresh) this device's push token for the logged-in user. Never throws. */
export function registerForPushNotifications(): Promise<void> {
  if (!registerInFlight) {
    registerInFlight = registerOnce()
      .catch((error) => {
        logOnce(`Push registration failed: ${String(error?.message || error)}`);
      })
      .finally(() => {
        registerInFlight = null;
      });
  }
  return registerInFlight;
}

/** Re-register whenever the OS rotates the device token. Returns an unsubscribe function. */
export function watchPushTokenChanges() {
  if (Platform.OS === "web") return () => {};
  const subscription = Notifications.addPushTokenListener(() => {
    registerForPushNotifications();
  });
  return () => subscription.remove();
}

/** Remove this device's token from the account (logout). Best effort, bounded, never throws. */
export async function unregisterPushDevice() {
  pendingOpenConversationId = null;
  try {
    const token = await AsyncStorage.getItem(REGISTERED_TOKEN_KEY);
    if (!token) return;
    await AsyncStorage.removeItem(REGISTERED_TOKEN_KEY);
    await api.delete("/push/devices/", { data: { token }, timeout: UNREGISTER_TIMEOUT_MS });
  } catch {
    // Offline or expired session: the server deactivates the token when it moves to
    // another account or Expo reports it unregistered.
  }
}
