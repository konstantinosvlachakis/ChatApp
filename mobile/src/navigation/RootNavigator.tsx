import React from "react";
import {
  ActivityIndicator,
  Animated,
  DeviceEventEmitter,
  Image,
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  UIManager,
  View,
  useWindowDimensions,
} from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { API_BASE_URL } from "../config/api";
import { useAuth } from "../context/AuthContext";
import { fetchConversations } from "../services/api/conversations";
import { tokenStorage } from "../services/storage";
import { LoginScreen } from "../screens/LoginScreen";
import { RegisterScreen } from "../screens/RegisterScreen";
import { CommunityScreen } from "../screens/CommunityScreen";
import { ConversationsScreen } from "../screens/ConversationsScreen";
import { CoachChatScreen } from "../screens/CoachChatScreen";
import { ProfileScreen } from "../screens/ProfileScreen";
import { SettingsScreen } from "../screens/SettingsScreen";
import { PublicProfileScreen } from "../screens/PublicProfileScreen";
import { useTheme } from "../context/ThemeContext";
import type { ThemeColors } from "../theme/colors";

const Stack = createNativeStackNavigator();
const Tabs = createBottomTabNavigator();
const PeopleStack = createNativeStackNavigator();
const ChatsStack = createNativeStackNavigator();

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type BannerState = {
  id: string;
  username: string;
  text: string;
  conversationId: number;
  avatarUrl?: string | null;
};

type PresenceSocketPayload =
  | { type: "presence_update"; user_id: number; is_online: boolean }
  | { type: "typing_status"; conversation_id: number; sender_id: number; is_typing: boolean }
  | { type: "conversation_update"; conversation_id?: number; trigger?: string; actor_id?: number };

function resolveMediaUrl(path?: string | null) {
  if (!path) return "https://placehold.co/80x80";
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  if (path.startsWith("/media/")) return `${API_BASE_URL}${path}`;
  if (path.startsWith("media/")) return `${API_BASE_URL}/${path}`;
  return `${API_BASE_URL}/media/${path}`;
}

function AppTabs() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const navigation = useNavigation<any>();
  const { height } = useWindowDimensions();
  const wsBaseUrl = React.useMemo(() => API_BASE_URL.replace(/^http/, "ws"), []);
  const [unreadChatsCount, setUnreadChatsCount] = React.useState(0);
  const [activeTabName, setActiveTabName] = React.useState("People");
  const [banners, setBanners] = React.useState<BannerState[]>([]);
  const didSeedUnreadRef = React.useRef(false);
  const previousUnreadByConversationRef = React.useRef<Record<number, number>>({});
  const unreadFetchMetaRef = React.useRef<{ inFlight: boolean; lastRunAt: number }>({
    inFlight: false,
    lastRunAt: 0,
  });
  const bannerTimersRef = React.useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const bannerAnimRef = React.useRef<
    Record<string, { translateY: Animated.Value; opacity: Animated.Value }>
  >({});
  const dismissingBannerIdsRef = React.useRef<Set<string>>(new Set());
  const presenceUpdatesSocketRef = React.useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const dynamicStyles = React.useMemo(() => createDynamicStyles(colors), [colors]);

  const dismissBanner = React.useCallback((bannerId: string, animated = true) => {
    if (dismissingBannerIdsRef.current.has(bannerId)) return;
    dismissingBannerIdsRef.current.add(bannerId);
    const timer = bannerTimersRef.current[bannerId];
    if (timer) {
      clearTimeout(timer);
      delete bannerTimersRef.current[bannerId];
    }
    const bannerAnim = bannerAnimRef.current[bannerId];

    const completeDismiss = () => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setBanners((prev) => prev.filter((banner) => banner.id !== bannerId));
      delete bannerAnimRef.current[bannerId];
      dismissingBannerIdsRef.current.delete(bannerId);
    };

    if (!animated || !bannerAnim) {
      completeDismiss();
      return;
    }

    Animated.parallel([
      Animated.timing(bannerAnim.translateY, {
        toValue: -18,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(bannerAnim.opacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      completeDismiss();
    });
  }, []);

  const showBanner = React.useCallback(
    (username: string, text: string, conversationId: number, avatarUrl?: string | null) => {
      const id = `${conversationId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      bannerAnimRef.current[id] = {
        translateY: new Animated.Value(-24),
        opacity: new Animated.Value(0),
      };
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setBanners((prev) => [
        { id, username, text: text || "Sent you a message", conversationId, avatarUrl },
        ...prev,
      ]);
      bannerTimersRef.current[id] = setTimeout(() => {
        dismissBanner(id);
      }, 3800);
      requestAnimationFrame(() => {
        const bannerAnim = bannerAnimRef.current[id];
        if (!bannerAnim) return;
        Animated.parallel([
          Animated.spring(bannerAnim.translateY, {
            toValue: 0,
            friction: 8,
            tension: 80,
            useNativeDriver: true,
          }),
          Animated.timing(bannerAnim.opacity, {
            toValue: 1,
            duration: 220,
            useNativeDriver: true,
          }),
        ]).start();
      });
    },
    [dismissBanner]
  );

  const loadUnreadChatsCount = React.useCallback(async () => {
    const now = Date.now();
    if (unreadFetchMetaRef.current.inFlight) return;
    if (now - unreadFetchMetaRef.current.lastRunAt < 4000) return;

    unreadFetchMetaRef.current.inFlight = true;
    unreadFetchMetaRef.current.lastRunAt = now;
    try {
      const conversations = await fetchConversations();
      const totalUnread = conversations.reduce(
        (sum: number, conversation: { unread_count?: number }) => {
        return sum + (conversation.unread_count || 0);
        },
        0
      );
      setUnreadChatsCount(totalUnread);

      if (activeTabName !== "Chats" && didSeedUnreadRef.current) {
        for (const conversation of conversations) {
          const previousUnread = previousUnreadByConversationRef.current[conversation.id] || 0;
          const currentUnread = conversation.unread_count || 0;
          const lastMessage = conversation.last_message;
          const lastSenderId = lastMessage?.sender?.id;
          const isIncoming = Boolean(lastMessage && lastSenderId && lastSenderId !== user?.user_id);

          if (currentUnread > previousUnread && isIncoming) {
            const otherUser =
              conversation.sender.id === user?.user_id ? conversation.receiver : conversation.sender;
            showBanner(
              otherUser.username,
              lastMessage?.text || "Sent you a message",
              conversation.id,
              otherUser.profile_image_url
            );
          }
        }
      }

      previousUnreadByConversationRef.current = conversations.reduce<Record<number, number>>(
        (acc: Record<number, number>, conversation: { id: number; unread_count?: number }) => {
          acc[conversation.id] = conversation.unread_count || 0;
          return acc;
        },
        {}
      );
      if (!didSeedUnreadRef.current) {
        didSeedUnreadRef.current = true;
      }
    } catch {
      // Keep last badge value if request fails.
    } finally {
      unreadFetchMetaRef.current.inFlight = false;
    }
  }, [activeTabName, showBanner, user?.user_id]);

  React.useEffect(() => {
    loadUnreadChatsCount();
    const refreshListener = DeviceEventEmitter.addListener("conversations_refresh", () => {
      loadUnreadChatsCount();
    });
    return () => {
      refreshListener.remove();
      Object.values(bannerTimersRef.current).forEach((timer) => clearTimeout(timer));
      bannerTimersRef.current = {};
      bannerAnimRef.current = {};
      dismissingBannerIdsRef.current.clear();
    };
  }, [loadUnreadChatsCount]);

  React.useEffect(() => {
    let cancelled = false;

    const clearReconnectTimeout = () => {
      if (!reconnectTimeoutRef.current) return;
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    };

    const closeSocket = () => {
      if (!presenceUpdatesSocketRef.current) return;
      presenceUpdatesSocketRef.current.close();
      presenceUpdatesSocketRef.current = null;
    };

    const connect = async () => {
      if (!user?.user_id || cancelled) return;

      const token = await tokenStorage.getAccessToken();
      if (!token || cancelled) return;

      const socket = new WebSocket(`${wsBaseUrl}/ws/presence/?token=${encodeURIComponent(token)}`);
      presenceUpdatesSocketRef.current = socket;

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data) as PresenceSocketPayload;
          if (payload.type === "conversation_update") {
            loadUnreadChatsCount();
          }
        } catch {
          // Ignore malformed payloads.
        }
      };

      socket.onclose = () => {
        if (cancelled) return;
        clearReconnectTimeout();
        reconnectTimeoutRef.current = setTimeout(() => {
          connect().catch(() => {});
        }, 1500);
      };
    };

    connect().catch(() => {});

    return () => {
      cancelled = true;
      clearReconnectTimeout();
      closeSocket();
    };
  }, [loadUnreadChatsCount, user?.user_id, wsBaseUrl]);

  const tabBarReserve = 124;
  const bannerApproxHeight = 56;
  const bannerTop = Math.min(
    Math.round(height * 0.1),
    Math.max(8, height - tabBarReserve - bannerApproxHeight)
  );

  return (
    <View style={styles.appTabsContainer}>
      {banners.length > 0 ? (
        <View pointerEvents="box-none" style={[styles.bannerStack, { top: bannerTop }]}>
          {banners.map((banner, index) => {
            const bannerAnim = bannerAnimRef.current[banner.id];
            return (
              <Animated.View
                key={banner.id}
                style={[
                  index > 0 && styles.bannerStackItem,
                  bannerAnim
                    ? {
                        transform: [{ translateY: bannerAnim.translateY }],
                        opacity: bannerAnim.opacity,
                      }
                    : undefined,
                ]}
              >
              <Pressable
                style={dynamicStyles.banner}
                onPress={() => {
                  navigation.navigate("AppTabs", {
                    screen: "Chats",
                    params: {
                      screen: "ChatsHome",
                      params: {
                        openConversationId: banner.conversationId,
                        openFromBannerAt: Date.now(),
                      },
                    },
                  });
                  dismissBanner(banner.id);
                }}
              >
                <Image source={{ uri: resolveMediaUrl(banner.avatarUrl) }} style={dynamicStyles.bannerAvatar} />
                <View style={styles.bannerContent}>
                  <Text numberOfLines={1} style={dynamicStyles.bannerTitle}>
                    {banner.username}
                  </Text>
                  <Text numberOfLines={1} style={dynamicStyles.bannerText}>
                    {banner.text}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.mutedText} />
              </Pressable>
              </Animated.View>
            );
          })}
        </View>
      ) : null}
      <Tabs.Navigator
        screenListeners={{
          state: (event) => {
            const state = event.data.state as any;
            const routeName = state?.routeNames?.[state?.index] || "People";
            setActiveTabName(routeName);
          },
        }}
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarStyle: {
            backgroundColor: colors.tabBarBackground,
            borderTopColor: colors.border,
          },
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.mutedText,
          tabBarIcon: ({ color, size, focused }) => {
            let iconName: keyof typeof Ionicons.glyphMap = "ellipse";
            let iconColor = color;

            if (route.name === "People") {
              iconName = focused ? "people" : "people-outline";
            } else if (route.name === "Chats") {
              const hasUnreadChats = unreadChatsCount > 0;
              iconName = hasUnreadChats || focused ? "chatbubbles" : "chatbubbles-outline";
              if (hasUnreadChats) {
                iconColor = colors.danger;
              }
            } else if (route.name === "Profile") {
              iconName = focused ? "person-circle" : "person-circle-outline";
            } else if (route.name === "Settings") {
              iconName = focused ? "settings" : "settings-outline";
            }

            return <Ionicons name={iconName} size={size} color={iconColor} />;
          },
        })}
      >
        <Tabs.Screen name="People" component={PeopleStackNavigator} />
        <Tabs.Screen
          name="Chats"
          component={ChatsStackNavigator}
          options={{
            tabBarBadge: unreadChatsCount > 0 ? unreadChatsCount : undefined,
            tabBarBadgeStyle: {
              backgroundColor: colors.danger,
              color: "#ffffff",
              fontSize: 11,
              fontWeight: "700",
            },
          }}
        />
        <Tabs.Screen name="Profile" component={ProfileScreen} />
        <Tabs.Screen name="Settings" component={SettingsScreen} />
      </Tabs.Navigator>
    </View>
  );
}

export function RootNavigator() {
  const { isAuthenticated, loading } = useAuth();
  const { colors } = useTheme();

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.background,
        }}
      >
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ marginTop: 10, color: colors.mutedText }}>
          Starting app...
        </Text>
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {isAuthenticated ? (
        <Stack.Screen name="AppTabs" component={AppTabs} />
      ) : (
        <>
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Register" component={RegisterScreen} />
        </>
      )}
    </Stack.Navigator>
  );
}

function PeopleStackNavigator() {
  return (
    <PeopleStack.Navigator screenOptions={{ headerShown: false }}>
      <PeopleStack.Screen name="CommunityHome" component={CommunityScreen} />
      <PeopleStack.Screen name="PublicProfile" component={PublicProfileScreen} />
    </PeopleStack.Navigator>
  );
}

function ChatsStackNavigator() {
  return (
    <ChatsStack.Navigator screenOptions={{ headerShown: false }}>
      <ChatsStack.Screen name="ChatsHome" component={ConversationsScreen} />
      <ChatsStack.Screen name="CoachChat" component={CoachChatScreen} />
    </ChatsStack.Navigator>
  );
}

const styles = StyleSheet.create({
  appTabsContainer: {
    flex: 1,
  },
  bannerStack: {
    position: "absolute",
    left: 12,
    right: 12,
    zIndex: 50,
  },
  bannerStackItem: {
    marginTop: 8,
  },
  bannerContent: {
    flex: 1,
  },
});

const createDynamicStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    banner: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 7,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      shadowColor: colors.cardShadow,
      shadowOpacity: 0.1,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
      elevation: 4,
    },
    bannerAvatar: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: colors.surfaceMuted,
    },
    bannerTitle: {
      color: colors.text,
      fontSize: 13,
      fontWeight: "700",
    },
    bannerText: {
      color: colors.mutedText,
      fontSize: 12,
      marginTop: 1,
    },
  });
