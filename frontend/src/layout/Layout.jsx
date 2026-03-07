import { useEffect, useMemo, useRef, useState } from "react";
import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import { useUser } from "../context/UserContext";
import { useGetConversations } from "../pages/Conversations/api/getConversations";
import { BASE_URL } from "../constants/constants";

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
  const navigate = useNavigate();
  const { user, setUser } = useUser();
  const { data: conversations = [] } = useGetConversations({
    config: {
      refetchInterval: false,
      refetchOnWindowFocus: true,
      staleTime: 15000,
      enabled: Boolean(
        sessionStorage.getItem("accessToken") || localStorage.getItem("accessToken")
      ),
    },
  });
  const previousUnreadMapRef = useRef(new Map());
  const hasHydratedUnreadRef = useRef(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef(null);

  const handleLogout = () => {
    sessionStorage.removeItem("accessToken");
    sessionStorage.removeItem("refreshToken");
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
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

  useEffect(() => {
    if (!("Notification" in window)) return;
    if (Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

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
    <div
      className={`flex flex-col bg-gray-50 ${
        isChatRoute ? "h-[100dvh] overflow-hidden" : "min-h-[100dvh]"
      }`}
    >
      {/* Header/Menu */}
      <header className="sticky top-0 z-30 bg-gray-700 text-white px-3 py-3 shadow-md sm:px-4">
        <nav className="mx-auto max-w-7xl">
          {/* Top row */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <Link
                to="/profile"
                className="inline-flex items-center gap-2.5 rounded-xl  px-2 py-1.5"
                aria-label="Go to profile"
              >
                <img
                  src={`${BASE_URL}/media/logo.png`}
                  alt="LangVoyage Logo"
                  className="h-9 w-9 rounded-lg object-cover"
                  onError={(event) => {
                    event.currentTarget.onerror = null;
                    event.currentTarget.src = "/logo192.png";
                  }}
                />
                <span className="truncate text-base font-bold tracking-wide sm:text-xl">
                  LangVoyage
                </span>
              </Link>
            </div>
            <button
              type="button"
              onClick={() => setMobileMenuOpen((open) => !open)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/20 bg-white/10 text-white md:hidden"
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
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-medium sm:px-3 sm:py-2 sm:text-sm ${
                    location.pathname === "/community"
                      ? "bg-white text-blue-600 shadow"
                      : "hover:bg-blue-700 hover:text-white"
                  }`}
                >
                  People
                </Link>
                <Link
                  to="/conversations"
                  className={`relative rounded-lg px-2.5 py-1.5 text-xs font-medium sm:px-3 sm:py-2 sm:text-sm ${
                    location.pathname === "/conversations"
                      ? "bg-white text-blue-600 shadow"
                      : "hover:bg-blue-700 hover:text-white"
                  }`}
                >
                  Conversations
                  {unreadConversationCount > 0 && (
                    <span className="absolute -right-1 -top-1 inline-flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
                      {unreadConversationCount}
                    </span>
                  )}
                </Link>
                <Link
                  to="/profile"
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-medium sm:px-3 sm:py-2 sm:text-sm ${
                    location.pathname === "/profile"
                      ? "bg-white text-blue-600 shadow"
                      : "hover:bg-blue-700 hover:text-white"
                  }`}
                >
                  Profile
                </Link>
              </div>
              <div className="relative ml-auto" ref={profileMenuRef}>
                <button
                  type="button"
                  onClick={() => setProfileMenuOpen((open) => !open)}
                  className={`inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium sm:px-3 sm:py-2 sm:text-sm ${
                    profileMenuOpen
                      ? "bg-white text-blue-600 shadow"
                      : "hover:bg-blue-700 hover:text-white"
                  }`}
                  aria-expanded={profileMenuOpen}
                  aria-haspopup="menu"
                >
                  <img
                    src={avatarUrl}
                    alt="Profile avatar"
                    className="h-6 w-6 rounded-full border border-white/50 object-cover"
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
                  className={`absolute right-0 mt-2 w-56 origin-top-right rounded-xl border border-slate-200 bg-white p-1.5 text-slate-700 shadow-xl transition-all duration-200 ${
                    profileMenuOpen
                      ? "pointer-events-auto translate-y-0 opacity-100"
                      : "pointer-events-none -translate-y-2 opacity-0"
                  }`}
                  role="menu"
                >
                  <Link
                    to="/settings"
                    className="block rounded-lg px-3 py-2 text-sm hover:bg-slate-100"
                    role="menuitem"
                  >
                    Settings
                  </Link>
                  <Link
                    to="/privacy-policy"
                    className="block rounded-lg px-3 py-2 text-sm hover:bg-slate-100"
                    role="menuitem"
                  >
                    Privacy Policy
                  </Link>
                  <Link
                    to="/terms-and-conditions"
                    className="block rounded-lg px-3 py-2 text-sm hover:bg-slate-100"
                    role="menuitem"
                  >
                    Terms and Conditions
                  </Link>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="mt-1 block w-full rounded-lg px-3 py-2 text-left text-sm text-rose-600 hover:bg-rose-50"
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
            <div className="mt-3 rounded-xl border border-white/15 bg-slate-800/95 p-2 md:hidden">
              <Link
                to="/community"
                className={`block rounded-lg px-3 py-2 text-sm font-medium ${
                  location.pathname === "/community"
                    ? "bg-white text-blue-600 shadow"
                    : "text-white hover:bg-white/10"
                }`}
              >
                People
              </Link>
              <Link
                to="/conversations"
                className={`mt-1 block rounded-lg px-3 py-2 text-sm font-medium ${
                  location.pathname === "/conversations"
                    ? "bg-white text-blue-600 shadow"
                    : "text-white hover:bg-white/10"
                }`}
              >
                Conversations
                {unreadConversationCount > 0 && (
                  <span className="ml-2 inline-flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
                    {unreadConversationCount}
                  </span>
                )}
              </Link>
              <Link
                to="/profile"
                className={`mt-1 block rounded-lg px-3 py-2 text-sm font-medium ${
                  location.pathname === "/profile"
                    ? "bg-white text-blue-600 shadow"
                    : "text-white hover:bg-white/10"
                }`}
              >
                Profile
              </Link>
              <Link
                to="/settings"
                className={`mt-1 block rounded-lg px-3 py-2 text-sm font-medium ${
                  location.pathname === "/settings"
                    ? "bg-white text-blue-600 shadow"
                    : "text-white hover:bg-white/10"
                }`}
              >
                Settings
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-red-500 px-3 py-2 text-sm font-medium text-white hover:bg-red-600"
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
          className={`mx-auto w-full max-w-7xl overflow-x-hidden px-3 sm:px-4 md:px-6 ${
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
  );
};

export default Layout;
