import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Outlet, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "react-query";
import { PresenceProvider } from "../context/PresenceContext";
import { useUser } from "../context/UserContext";
import { useGetConversations } from "../pages/Conversations/api/getConversations";
import { CONVERSATIONS_LIST_QUERY_KEY } from "../pages/Conversations/api/conversationListCache";
import {
  CONVERSATION_LIST_REFETCH_DEBOUNCE_MS,
  createTrailingDebounce,
  shouldRefetchListOnFocus,
} from "../pages/Conversations/api/conversationListRefetch";
import { BASE_URL, getWebSocketBaseUrl } from "../constants/constants";
import { DEFAULT_AVATAR_URL } from "../constants/avatar";
import { RouteErrorBoundary } from "../components/ErrorBoundary";
import api from "../lib/api";
import { resetConnectivity, setSocketReconnecting } from "../lib/connectivity";
import AppHeader from "./AppHeader";
import BottomTabBar from "./BottomTabBar";
import { isOpenChatPath } from "./navItems";
import { getNotificationPermission, requestNotificationPermission } from "../utils/notifications";
import "./appShell.css";
import {
  SESSION_REFRESHED_EVENT,
  clearClientSessionData,
  getLegacyAccessToken,
  refreshSessionOnce,
} from "../utils/auth";
import {
  SOCKET_AUTH_CLOSE_CODES,
  getReconnectDelayMs,
  isDocumentHidden,
} from "../utils/reconnect";

const DEFAULT_PROFILE_AVATAR = DEFAULT_AVATAR_URL;

const resolveAvatarUrl = (image) => {
  if (!image) return DEFAULT_PROFILE_AVATAR;
  if (image.startsWith("http://") || image.startsWith("https://")) return image;
  if (image.startsWith("/media/")) return `${BASE_URL}${image}`;
  if (image.startsWith("media/")) return `${BASE_URL}/${image}`;
  return `${BASE_URL}/media/${image}`;
};

const Layout = () => {
  const location = useLocation(); // To identify the active page
  const isChatRoute = location.pathname.startsWith("/conversations");
  const isPeopleRoute = location.pathname === "/community";
  const isOpenChat = isOpenChatPath(location.pathname);
  const routeContainerClass = isPeopleRoute
    ? "w-full max-w-[1440px]"
    : "w-full md:w-[90vw] max-w-[1500px]";
  const navigate = useNavigate();
  const { user, setUser, loading: userLoading } = useUser();
  const queryClient = useQueryClient();
  // No refetch on every focus: socket events keep the list current, and the effects below
  // refetch only when events may have been missed (see shouldRefetchListOnFocus).
  const { data: conversations = [] } = useGetConversations({
    config: {
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: 15000,
      enabled: Boolean(user?.user_id),
    },
  });
  const previousUnreadMapRef = useRef(new Map());
  const hasHydratedUnreadRef = useRef(false);
  const presenceSocketRef = useRef(null);
  const presenceHeartbeatRef = useRef(null);
  const presenceReconnectRef = useRef(null);
  const presenceListenersRef = useRef(new Set());
  // `conversation_update` is applied by ConversationList, which is mounted only on
  // /conversations*. Elsewhere a visible tab refetches (debounced) so the unread badge
  // stays live; a hidden tab remembers the miss and refetches on focus/entry.
  const isChatRouteRef = useRef(isChatRoute);
  const missedListUpdateRef = useRef(false);
  const listHiddenAtRef = useRef(null);
  const offRouteListRefetchRef = useRef(null);
  const [onlineUserIds, setOnlineUserIds] = useState(() => new Set());

  // Also used by Settings (via the Outlet context): `{ accountDeleted: true }` skips the
  // presence call (the account is gone) but still clears the auth cookies and local session.
  const handleLogout = async (options) => {
    const accountDeleted = options?.accountDeleted === true;
    // Best effort: logout must complete locally even if the server is unreachable.
    if (!accountDeleted) {
      await api.post("/api/presence/offline/", undefined, { timeoutMs: 5000 }).catch(() => {});
    }
    await api.post("/api/logout/", undefined, { timeoutMs: 5000 }).catch(() => {});

    presenceHeartbeatRef.current && window.clearInterval(presenceHeartbeatRef.current);
    presenceHeartbeatRef.current = null;
    presenceReconnectRef.current && window.clearTimeout(presenceReconnectRef.current);
    presenceReconnectRef.current = null;
    presenceSocketRef.current?.close();
    presenceSocketRef.current = null;
    setOnlineUserIds(new Set());
    resetConnectivity();
    clearClientSessionData();
    queryClient.clear();
    setUser(null);
    navigate("/login");
  };

  const unreadConversationCount = useMemo(
    () =>
      conversations.reduce(
        (count, conversation) =>
          count + ((conversation.unread_count || 0) > 0 ? 1 : 0),
        0
      ),
    [conversations]
  );
  const avatarUrl = useMemo(() => {
    if (user?.profile_image_url) {
      return resolveAvatarUrl(user.profile_image_url);
    }
    return DEFAULT_PROFILE_AVATAR;
  }, [user?.profile_image_url]);

  const subscribeToPresenceEvents = useCallback((listener) => {
    presenceListenersRef.current.add(listener);
    return () => {
      presenceListenersRef.current.delete(listener);
    };
  }, []);

  const presenceContextValue = useMemo(
    () => ({ onlineUserIds, subscribeToPresenceEvents }),
    [onlineUserIds, subscribeToPresenceEvents]
  );

  useEffect(() => {
    if (getNotificationPermission() === "default") requestNotificationPermission();
  }, []);

  useEffect(() => {
    if (!user?.user_id) return undefined;

    const wsBaseUrl = getWebSocketBaseUrl();
    let isUnmounted = false;
    let reconnectAttempt = 0;
    // Auth rejections (4401/4403) stop reconnecting; one session refresh is attempted per
    // successful connection, and any later refresh (SESSION_REFRESHED_EVENT) retries once.
    let stoppedForAuth = false;
    let authRefreshUsed = false;
    let waitingForVisibleTab = false;
    let hasConnectedBefore = false;

    const clearPresenceTimers = () => {
      if (presenceHeartbeatRef.current) {
        window.clearInterval(presenceHeartbeatRef.current);
        presenceHeartbeatRef.current = null;
      }
      if (presenceReconnectRef.current) {
        window.clearTimeout(presenceReconnectRef.current);
        presenceReconnectRef.current = null;
      }
    };

    const connectPresenceSocket = () => {
      if (isUnmounted) return;
      clearPresenceTimers();

      const legacyAccessToken = getLegacyAccessToken();
      const socketUrl = legacyAccessToken
        ? `${wsBaseUrl}/ws/presence/?token=${encodeURIComponent(legacyAccessToken)}`
        : `${wsBaseUrl}/ws/presence/`;
      const socket = new WebSocket(socketUrl);
      presenceSocketRef.current = socket;

      socket.onopen = () => {
        clearPresenceTimers();
        setSocketReconnecting(false);
        reconnectAttempt = 0;
        stoppedForAuth = false;
        authRefreshUsed = false;
        if (hasConnectedBefore) {
          // The socket was down, so conversation_update events may have been missed.
          missedListUpdateRef.current = false;
          queryClient.invalidateQueries({ queryKey: CONVERSATIONS_LIST_QUERY_KEY });
        }
        hasConnectedBefore = true;
        presenceHeartbeatRef.current = window.setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: "heartbeat" }));
          }
        }, 20000);
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "initial_online_users") {
            setOnlineUserIds(new Set(data.user_ids || data.userIds || []));
            return;
          }
          if (data.type === "presence_update" && typeof data.user_id === "number") {
            setOnlineUserIds((prev) => {
              const next = new Set(prev);
              if (data.is_online) {
                next.add(data.user_id);
              } else {
                next.delete(data.user_id);
              }
              return next;
            });
            presenceListenersRef.current.forEach((listener) => listener(data));
            return;
          }
          if (data.type === "conversation_update" && !isChatRouteRef.current) {
            if (isDocumentHidden()) {
              missedListUpdateRef.current = true;
            } else {
              offRouteListRefetchRef.current?.();
            }
          }
          presenceListenersRef.current.forEach((listener) => listener(data));
        } catch (_error) {
          // Ignore malformed presence events.
        }
      };

      socket.onclose = (event) => {
        clearPresenceTimers();
        if (isUnmounted || presenceSocketRef.current !== socket) return;
        if (SOCKET_AUTH_CLOSE_CODES.has(event.code)) {
          setSocketReconnecting(false);
          stoppedForAuth = true;
          if (!authRefreshUsed) {
            authRefreshUsed = true;
            // Success dispatches SESSION_REFRESHED_EVENT, which reconnects below.
            refreshSessionOnce();
          }
          return;
        }
        scheduleReconnect();
      };
    };

    const scheduleReconnect = () => {
      if (isUnmounted) return;
      if (isDocumentHidden()) {
        // Don't poll a down backend from background tabs; reconnect when shown again.
        waitingForVisibleTab = true;
        return;
      }
      const delay = getReconnectDelayMs(reconnectAttempt);
      // The first retry is quick; only show "Reconnecting…" once a retry has failed too.
      if (reconnectAttempt > 0) setSocketReconnecting(true);
      reconnectAttempt += 1;
      presenceReconnectRef.current = window.setTimeout(() => {
        connectPresenceSocket();
      }, delay);
    };

    const handleVisibilityChange = () => {
      if (!waitingForVisibleTab || isDocumentHidden()) return;
      waitingForVisibleTab = false;
      connectPresenceSocket();
    };

    const handleSessionRefreshed = () => {
      if (isUnmounted || !stoppedForAuth) return;
      stoppedForAuth = false;
      connectPresenceSocket();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener(SESSION_REFRESHED_EVENT, handleSessionRefreshed);
    connectPresenceSocket();

    return () => {
      isUnmounted = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener(SESSION_REFRESHED_EVENT, handleSessionRefreshed);
      clearPresenceTimers();
      setSocketReconnecting(false);
      presenceSocketRef.current?.close();
      presenceSocketRef.current = null;
      setOnlineUserIds(new Set());
    };
  }, [queryClient, user?.user_id]);

  useEffect(() => {
    const refetch = createTrailingDebounce(
      () => queryClient.invalidateQueries({ queryKey: CONVERSATIONS_LIST_QUERY_KEY }),
      CONVERSATION_LIST_REFETCH_DEBOUNCE_MS
    );
    offRouteListRefetchRef.current = refetch;
    return () => {
      refetch.cancel();
      offRouteListRefetchRef.current = null;
    };
  }, [queryClient]);

  useEffect(() => {
    isChatRouteRef.current = isChatRoute;
    if (isChatRoute && missedListUpdateRef.current) {
      missedListUpdateRef.current = false;
      queryClient.invalidateQueries({ queryKey: CONVERSATIONS_LIST_QUERY_KEY });
    }
  }, [isChatRoute, queryClient]);

  useEffect(() => {
    if (!user?.user_id) return undefined;

    const refreshListIfStale = () => {
      if (isDocumentHidden()) return;
      const needsRefetch = shouldRefetchListOnFocus({
        missedUpdate: missedListUpdateRef.current,
        hiddenAt: listHiddenAtRef.current,
        now: Date.now(),
      });
      missedListUpdateRef.current = false;
      listHiddenAtRef.current = null;
      if (needsRefetch) {
        queryClient.invalidateQueries({ queryKey: CONVERSATIONS_LIST_QUERY_KEY });
      }
    };
    const handleVisibilityChange = () => {
      if (isDocumentHidden()) {
        listHiddenAtRef.current = listHiddenAtRef.current ?? Date.now();
        return;
      }
      refreshListIfStale();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", refreshListIfStale);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", refreshListIfStale);
    };
  }, [queryClient, user?.user_id]);

  useEffect(() => {
    const currentMap = new Map();
    conversations.forEach((conversation) => {
      currentMap.set(conversation.id, conversation.unread_count || 0);
    });

    if (!hasHydratedUnreadRef.current) {
      previousUnreadMapRef.current = currentMap;
      hasHydratedUnreadRef.current = true;
      return;
    }

    conversations.forEach((conversation) => {
      const previousUnread = previousUnreadMapRef.current.get(conversation.id) || 0;
      const nextUnread = conversation.unread_count || 0;
      const lastMessage = conversation.last_message;
      const senderUsername = lastMessage?.sender?.username || "";
      const isIncoming = Boolean(senderUsername) && senderUsername !== user?.username;
      const isCurrentlyOpenConversation =
        location.pathname === `/conversations/${conversation.id}`;

      if (nextUnread > previousUnread && isIncoming && !isCurrentlyOpenConversation) {
        if ("Notification" in window && Notification.permission === "granted") {
          const notification = new Notification(`New message from ${senderUsername}`, {
            body: lastMessage?.text || "You received a new message.",
            tag: `conversation-${conversation.id}`,
          });
          notification.onclick = () => {
            window.focus();
            navigate(`/conversations/${conversation.id}`);
          };
        }
      }
    });

    previousUnreadMapRef.current = currentMap;
  }, [conversations, navigate, user?.username, location.pathname]);


  // Client-side guard only (the API enforces auth): don't render app pages without a session.
  if (!userLoading && !user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <PresenceProvider value={presenceContextValue}>
      <div
        className={`lv-shell flex flex-col ${
          isChatRoute ? "h-[100dvh] overflow-hidden" : "min-h-[100dvh]"
        } ${isOpenChat ? "lv-shell-open-chat" : ""}`}
      >
        <AppHeader
          user={user}
          avatarUrl={avatarUrl}
          unreadCount={unreadConversationCount}
          onLogout={handleLogout}
        />

        <main
          className={
            isChatRoute
              ? "min-h-0 flex-1 overflow-hidden"
              : "min-h-0 flex-1"
          }
        >
          <div
            className={`mx-auto ${routeContainerClass} overflow-x-hidden px-3 sm:px-4 md:px-6 ${
              isChatRoute ? "h-full" : ""
            }`}
          >
            <div
              className={`overflow-x-hidden ${
                isChatRoute ? "h-full" : "min-h-full"
              }`}
            >
              <RouteErrorBoundary>
                <Outlet context={{ onLogout: handleLogout }} />
              </RouteErrorBoundary>
            </div>
          </div>
        </main>

        <footer className={`lv-footer ${isChatRoute ? "hidden" : "hidden md:block"}`}>
          <div className="lv-footer-inner">
            <nav className="lv-footer-col" aria-label="Explore">
              <strong>Explore</strong>
              <Link to="/community">People</Link>
              <Link to="/practice">Practice</Link>
              <Link to="/premium">Premium</Link>
            </nav>
            <nav className="lv-footer-col" aria-label="Help">
              <strong>Help</strong>
              <Link to="/settings">Settings</Link>
              {user?.support_email && <a href={`mailto:${user.support_email}`}>Contact support</a>}
              {user?.support_email && (
                <a href={`mailto:${user.support_email}?subject=${encodeURIComponent("Bug report")}`}>Report a bug</a>
              )}
            </nav>
            <nav className="lv-footer-col" aria-label="Legal">
              <strong>Legal</strong>
              <Link to="/terms-and-conditions">Terms of Service</Link>
              <Link to="/privacy-policy">Privacy</Link>
            </nav>
          </div>
          <p className="lv-footer-copy">© {new Date().getFullYear()} LangVoyage. All rights reserved.</p>
        </footer>

        <BottomTabBar unreadCount={unreadConversationCount} />
      </div>
    </PresenceProvider>
  );
};

export default Layout;
