import React, { useEffect, useMemo, useRef } from "react";
import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import { useUser } from "../context/UserContext";
import { useGetConversations } from "../pages/Conversations/api/getConversations";

const Layout = () => {
  const location = useLocation(); // To identify the active page
  const navigate = useNavigate();
  const { user, setUser } = useUser();
  const { data: conversations = [] } = useGetConversations({
    config: {
      refetchInterval: 4000,
      refetchOnWindowFocus: true,
      enabled: Boolean(
        sessionStorage.getItem("accessToken") || localStorage.getItem("accessToken")
      ),
    },
  });
  const previousUnreadMapRef = useRef(new Map());
  const hasHydratedUnreadRef = useRef(false);

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

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      {/* Header/Menu */}
      <header className="sticky top-0 z-30 bg-gray-700 text-white px-3 py-3 shadow-md sm:px-4">
        <nav className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          {/* Clickable Logo on the top left */}
          <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-4">
            <Link
              to="/profile"
              className="mr-2 truncate text-base font-bold tracking-wide sm:mr-4 sm:text-xl"
            >
              LangVoyage
            </Link>

            {/* Navigation Links */}
            <div className="flex flex-wrap gap-2">
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
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/settings"
              title="Settings"
              aria-label="Settings"
              className={`flex h-9 w-9 items-center justify-center rounded-lg text-base transition sm:h-10 sm:w-10 sm:text-lg ${
                location.pathname === "/settings"
                  ? "bg-white text-blue-600 shadow"
                  : "hover:bg-blue-700 hover:text-white"
              }`}
            >
              ⚙
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-lg bg-red-500 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-red-600 sm:px-3 sm:py-2 sm:text-sm"
            >
              Logout
            </button>
          </div>
        </nav>
      </header>

      {/* Main Content */}
      <main className="min-h-0 flex-1">
        <div className="mx-auto w-full max-w-7xl overflow-x-hidden px-0 sm:px-2 md:px-4">
          <div className="min-h-full overflow-x-hidden bg-white shadow-sm sm:rounded-lg sm:shadow-md">
          <Outlet />
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="hidden bg-gray-800 py-3 text-center text-xs text-gray-400 sm:block sm:text-sm">
        © {new Date().getFullYear()} LangVoyage. All rights reserved.
      </footer>
    </div>
  );
};

export default Layout;
