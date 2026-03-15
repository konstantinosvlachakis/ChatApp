import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import { PresenceProvider } from "../context/PresenceContext";
import { useUser } from "../context/UserContext";
import { useGetConversations } from "../pages/Conversations/api/getConversations";
import { BASE_URL } from "../constants/constants";
import CoachAvatar from "../components/CoachAvatar";
import { clearLegacyTokens, getLegacyAccessToken } from "../utils/auth";

const DEFAULT_PROFILE_AVATAR = `${BASE_URL}/media/profile_images/MainAfter.jpg`;

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
  const routeContainerClass = "w-full md:w-[90vw] max-w-[1500px]";
  const navigate = useNavigate();
  const { user, setUser } = useUser();
  const { data: conversations = [] } = useGetConversations({
    config: {
      refetchInterval: false,
      refetchOnWindowFocus: true,
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
  const [onlineUserIds, setOnlineUserIds] = useState(() => new Set());
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef(null);

  const handleLogout = async () => {
    await fetch(`${BASE_URL}/api/presence/offline/`, {
      method: "POST",
      credentials: "include",
      keepalive: true,
    }).catch(() => {});
    await fetch(`${BASE_URL}/api/logout/`, {
      method: "POST",
      credentials: "include",
    }).catch(() => {});

    presenceHeartbeatRef.current && window.clearInterval(presenceHeartbeatRef.current);
    presenceHeartbeatRef.current = null;
    presenceReconnectRef.current && window.clearTimeout(presenceReconnectRef.current);
    presenceReconnectRef.current = null;
    presenceSocketRef.current?.close();
    presenceSocketRef.current = null;
    setOnlineUserIds(new Set());
    clearLegacyTokens();
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

  useEffect(() => {
    if (!("Notification" in window)) return;
    if (Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (!user?.user_id) return undefined;

    const wsBaseUrl = BASE_URL.replace(/^http/, "ws");
    let isUnmounted = false;

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
          presenceListenersRef.current.forEach((listener) => listener(data));
        } catch (_error) {
          // Ignore malformed presence events.
        }
      };

      socket.onclose = () => {
        clearPresenceTimers();
        if (isUnmounted) return;
        const isAuthClose = socket.code === 1008 || socket.code === 4401 || socket.code === 4403;
        if (isAuthClose) {
          return;
        }
        presenceReconnectRef.current = window.setTimeout(() => {
          connectPresenceSocket();
        }, 3000);
      };
    };

    connectPresenceSocket();

    return () => {
      isUnmounted = true;
      clearPresenceTimers();
      presenceSocketRef.current?.close();
      presenceSocketRef.current = null;
      setOnlineUserIds(new Set());
    };
  }, [user?.user_id]);

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

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    setProfileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileMenuOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileMenuOpen]);

  useEffect(() => {
    const onPointerDown = (event) => {
      if (!profileMenuRef.current) return;
      if (!profileMenuRef.current.contains(event.target)) {
        setProfileMenuOpen(false);
      }
    };
    const onEscape = (event) => {
      if (event.key === "Escape") {
        setProfileMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onEscape);
    };
  }, []);

  return (
    <PresenceProvider value={{ onlineUserIds, subscribeToPresenceEvents }}>
      <div
        className={`flex flex-col bg-gray-50 ${
          isChatRoute ? "h-[100dvh] overflow-hidden" : "min-h-[100dvh]"
        }`}
      >
      {/* Header/Menu */}
      <header
        className="sticky top-0 z-30 py-3 text-white shadow-md"
        style={{ backgroundColor: "var(--lv-navy)", boxShadow: "0 10px 30px rgba(8,19,32,0.18)" }}
      >
        <nav
          className={`mx-auto ${routeContainerClass} px-3 sm:px-4 md:px-6`}
        >
          {/* Top row */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <Link
                to="/profile"
                className="inline-flex items-center gap-2.5 rounded-xl  px-2 py-1.5"
                aria-label="Go to profile"
              >
                <CoachAvatar size={36} hideBadge />
                <span className="truncate text-base font-bold tracking-wide sm:text-xl">
                  LangVoyage
                </span>
              </Link>
            </div>
            <button
              type="button"
              onClick={() => setMobileMenuOpen((open) => !open)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border text-white md:hidden"
              style={{ borderColor: "rgba(255,255,255,0.18)", backgroundColor: "rgba(255,255,255,0.08)" }}
              aria-label="Toggle menu"
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-5 w-5"
                  aria-hidden="true"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              ) : (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-5 w-5"
                  aria-hidden="true"
                >
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              )}
            </button>
          </div>

          {/* Desktop nav */}
          <div className="mt-3 hidden md:block">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Link
                  to="/community"
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-medium sm:px-3 sm:py-2 sm:text-sm transition ${
                    location.pathname === "/community"
                      ? "bg-white shadow"
                      : "text-white hover:text-white"
                  }`}
                  style={
                    location.pathname === "/community"
                      ? { color: "var(--lv-primary)" }
                      : { backgroundColor: "transparent" }
                  }
                >
                  People
                </Link>
                <Link
                  to="/conversations"
                  className={`relative rounded-lg px-2.5 py-1.5 text-xs font-medium sm:px-3 sm:py-2 sm:text-sm transition ${
                    location.pathname.startsWith("/conversations")
                      ? "bg-white shadow"
                      : "text-white hover:text-white"
                  }`}
                  style={
                    location.pathname.startsWith("/conversations")
                      ? { color: "var(--lv-primary)" }
                      : { backgroundColor: "transparent" }
                  }
                >
                  Conversations
                  {unreadConversationCount > 0 && (
                    <span
                      className="absolute -right-1 -top-1 inline-flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-semibold text-white"
                      style={{ backgroundColor: "var(--lv-danger)" }}
                    >
                      {unreadConversationCount}
                    </span>
                  )}
                </Link>
                <Link
                  to="/profile"
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-medium sm:px-3 sm:py-2 sm:text-sm transition ${
                    location.pathname === "/profile"
                      ? "bg-white shadow"
                      : "text-white hover:text-white"
                  }`}
                  style={
                    location.pathname === "/profile"
                      ? { color: "var(--lv-primary)" }
                      : { backgroundColor: "transparent" }
                  }
                >
                  Profile
                </Link>
                <Link
                  to="/practice"
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-medium sm:px-3 sm:py-2 sm:text-sm transition ${
                    location.pathname === "/practice"
                      ? "bg-white shadow"
                      : "text-white hover:text-white"
                  }`}
                  style={
                    location.pathname === "/practice"
                      ? { color: "var(--lv-primary)" }
                      : { backgroundColor: "transparent" }
                  }
                >
                  Practice
                </Link>
                <Link
                  to="/premium"
                  className={`inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium sm:px-3 sm:py-2 sm:text-sm transition ${
                    location.pathname === "/premium"
                      ? "bg-white shadow"
                      : "text-white hover:text-white"
                  }`}
                  style={
                    location.pathname === "/premium"
                      ? { color: "var(--lv-primary)" }
                      : {
                          backgroundColor: "rgba(236,177,208,0.09)",
                          border: "1px solid rgba(236,177,208,0.16)",
                        }
                  }
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    className="h-3.5 w-3.5"
                    style={{
                      color:
                        location.pathname === "/premium"
                          ? "var(--lv-danger)"
                          : "var(--lv-blush)",
                    }}
                    aria-hidden="true"
                  >
                    <path d="m12 3.2 5.8 5.8-5.8 11.8L6.2 9 12 3.2Z" />
                  </svg>
                  Premium
                </Link>
              </div>
              <div className="relative ml-auto" ref={profileMenuRef}>
                <button
                  type="button"
                  onClick={() => setProfileMenuOpen((open) => !open)}
                  className={`inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium sm:px-3 sm:py-2 sm:text-sm transition ${
                    profileMenuOpen
                      ? "bg-white shadow"
                      : "text-white hover:text-white"
                  }`}
                  style={
                    profileMenuOpen
                      ? { color: "var(--lv-primary)" }
                      : { backgroundColor: "transparent" }
                  }
                  aria-expanded={profileMenuOpen}
                  aria-haspopup="menu"
                >
                  <img
                    src={avatarUrl}
                    alt="Profile avatar"
                    className="h-7 w-7 rounded-full border border-white/50 object-cover sm:h-8 sm:w-8"
                  />
                  <span className="max-w-[120px] truncate">{user?.username || "Account"}</span>
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={`h-4 w-4 transition-transform duration-200 ${
                      profileMenuOpen ? "rotate-180" : ""
                    }`}
                    aria-hidden="true"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
                <div
                  className={`absolute right-0 mt-2 w-56 origin-top-right rounded-xl border bg-white p-1.5 shadow-xl transition-all duration-200 ${
                    profileMenuOpen
                      ? "pointer-events-auto translate-y-0 opacity-100"
                      : "pointer-events-none -translate-y-2 opacity-0"
                  }`}
                  style={{ borderColor: "var(--lv-border)", color: "var(--lv-text)" }}
                  role="menu"
                >
                  <Link
                    to="/settings"
                    className="block rounded-lg px-3 py-2 text-sm"
                    style={{ color: "var(--lv-text)" }}
                    role="menuitem"
                  >
                    Settings
                  </Link>
                  <Link
                    to="/privacy-policy"
                    className="block rounded-lg px-3 py-2 text-sm"
                    style={{ color: "var(--lv-text)" }}
                    role="menuitem"
                  >
                    Privacy Policy
                  </Link>
                  <Link
                    to="/terms-and-conditions"
                    className="block rounded-lg px-3 py-2 text-sm"
                    style={{ color: "var(--lv-text)" }}
                    role="menuitem"
                  >
                    Terms and Conditions
                  </Link>
                  <Link
                    to="/premium"
                    className="mt-1 flex items-center gap-2 rounded-lg px-3 py-2 text-sm"
                    style={{
                      color: "var(--lv-text)",
                      backgroundColor: "rgba(236,177,208,0.09)",
                    }}
                    role="menuitem"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      className="h-3.5 w-3.5"
                      style={{ color: "var(--lv-danger)" }}
                      aria-hidden="true"
                    >
                      <path d="m12 3.2 5.8 5.8-5.8 11.8L6.2 9 12 3.2Z" />
                    </svg>
                    Premium
                  </Link>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="mt-1 block w-full rounded-lg px-3 py-2 text-left text-sm"
                    style={{ color: "var(--lv-danger)" }}
                    role="menuitem"
                  >
                    Sign out
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Mobile nav */}
          {mobileMenuOpen && (
            <div className="fixed inset-0 z-40 md:hidden">
              <button
                type="button"
                className="absolute inset-0 backdrop-blur-[2px]"
                style={{ backgroundColor: "rgba(8,19,32,0.58)" }}
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Close menu backdrop"
              />
              <aside
                className="absolute right-0 top-0 h-full w-[min(72vw,300px)] border-l p-3.5 shadow-2xl"
                style={{
                  borderColor: "rgba(255,255,255,0.12)",
                  background: "linear-gradient(180deg, #14314a 0%, #081320 100%)",
                }}
              >
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <img
                      src={avatarUrl}
                      alt="Profile avatar"
                      className="h-10 w-10 rounded-full border border-white/25 object-cover"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white">
                        {user?.username || "Account"}
                      </p>
                      <p className="text-xs text-white/60">Navigation</p>
                    </div>
                  </div>
                    <button
                      type="button"
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border text-white"
                      style={{ borderColor: "rgba(255,255,255,0.18)", backgroundColor: "rgba(255,255,255,0.08)" }}
                      onClick={() => setMobileMenuOpen(false)}
                      aria-label="Close menu"
                    >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-5 w-5"
                      aria-hidden="true"
                    >
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>

                <div className="space-y-0.5">
                  <Link
                    to="/community"
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex min-h-[42px] items-center rounded-lg px-2.5 text-sm font-semibold transition ${
                      location.pathname === "/community"
                        ? ""
                        : "text-white/90 hover:text-white"
                    }`}
                    style={
                      location.pathname === "/community"
                        ? { color: "var(--lv-link)", backgroundColor: "rgba(255,255,255,0.06)" }
                        : {}
                    }
                  >
                    People
                  </Link>
                  <Link
                    to="/conversations"
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex min-h-[42px] items-center rounded-lg px-2.5 text-sm font-semibold transition ${
                      location.pathname.startsWith("/conversations")
                        ? ""
                        : "text-white/90 hover:text-white"
                    }`}
                    style={
                      location.pathname.startsWith("/conversations")
                        ? { color: "var(--lv-link)", backgroundColor: "rgba(255,255,255,0.06)" }
                        : {}
                    }
                  >
                    <span>Conversations</span>
                    {unreadConversationCount > 0 && (
                      <span
                        className="ml-1 inline-flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-semibold text-white"
                        style={{ backgroundColor: "var(--lv-danger)" }}
                      >
                        {unreadConversationCount}
                      </span>
                    )}
                  </Link>
                  <Link
                    to="/profile"
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex min-h-[42px] items-center rounded-lg px-2.5 text-sm font-semibold transition ${
                      location.pathname === "/profile"
                        ? ""
                        : "text-white/90 hover:text-white"
                    }`}
                    style={
                      location.pathname === "/profile"
                        ? { color: "var(--lv-link)", backgroundColor: "rgba(255,255,255,0.06)" }
                        : {}
                    }
                  >
                    Profile
                  </Link>
                  <Link
                    to="/settings"
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex min-h-[42px] items-center rounded-lg px-2.5 text-sm font-semibold transition ${
                      location.pathname === "/settings"
                        ? ""
                        : "text-white/90 hover:text-white"
                    }`}
                    style={
                      location.pathname === "/settings"
                        ? { color: "var(--lv-link)", backgroundColor: "rgba(255,255,255,0.06)" }
                        : {}
                    }
                  >
                    Settings
                  </Link>
                  <Link
                    to="/premium"
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex min-h-[42px] items-center gap-2 rounded-lg px-2.5 text-sm font-semibold transition ${
                      location.pathname === "/premium"
                        ? ""
                        : "text-white/90 hover:text-white"
                    }`}
                    style={
                      location.pathname === "/premium"
                        ? { color: "var(--lv-link)", backgroundColor: "rgba(255,255,255,0.06)" }
                        : {
                            backgroundColor: "rgba(236,177,208,0.09)",
                            border: "1px solid rgba(236,177,208,0.16)",
                          }
                    }
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      className="h-3.5 w-3.5"
                      style={{
                        color:
                          location.pathname === "/premium"
                            ? "var(--lv-danger)"
                            : "var(--lv-blush)",
                      }}
                      aria-hidden="true"
                    >
                      <path d="m12 3.2 5.8 5.8-5.8 11.8L6.2 9 12 3.2Z" />
                    </svg>
                    Premium
                  </Link>
                  <Link
                    to="/practice"
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex min-h-[42px] items-center rounded-lg px-2.5 text-sm font-semibold transition ${
                      location.pathname === "/practice"
                        ? ""
                        : "text-white/90 hover:text-white"
                    }`}
                    style={
                      location.pathname === "/practice"
                        ? { color: "var(--lv-link)", backgroundColor: "rgba(255,255,255,0.06)" }
                        : {}
                    }
                  >
                    Practice
                  </Link>
                </div>

                <div className="mt-4 border-t border-white/10 pt-4">
                  <Link
                    to="/privacy-policy"
                    onClick={() => setMobileMenuOpen(false)}
                    className="block rounded-lg px-3 py-2 text-sm text-white/80 transition hover:bg-white/10 hover:text-white"
                  >
                    Privacy Policy
                  </Link>
                  <Link
                    to="/terms-and-conditions"
                    onClick={() => setMobileMenuOpen(false)}
                    className="mt-1 block rounded-lg px-3 py-2 text-sm text-white/80 transition hover:bg-white/10 hover:text-white"
                  >
                    Terms & Conditions
                  </Link>
                </div>

                <button
                  type="button"
                  onClick={handleLogout}
                  className="mt-5 inline-flex min-h-[46px] w-full items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-white transition"
                  style={{ backgroundColor: "var(--lv-danger)" }}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-4 w-4"
                    aria-hidden="true"
                  >
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                  Sign out
                </button>
              </aside>
            </div>
          )}
        </nav>
      </header>

      {/* Main Content */}
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
            <Outlet />
          </div>
        </div>
      </main>

      {/* Footer */}
        <footer
          className={`bg-gray-800 py-3 text-center text-xs text-gray-400 sm:text-sm ${
            isChatRoute ? "hidden" : "hidden sm:block"
          }`}
        >
          © {new Date().getFullYear()} LangVoyage. All rights reserved.
        </footer>
      </div>
    </PresenceProvider>
  );
};

export default Layout;
