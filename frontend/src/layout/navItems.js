// Shared navigation config for the app header (desktop) and the phone tab bar.
// `match` lists route prefixes that make an item active (e.g. /people/:username is "People").

export const HEADER_NAV_ITEMS = [
  { key: "people", to: "/community", label: "People", match: ["/community", "/people"] },
  { key: "chats", to: "/conversations", label: "Conversations", match: ["/conversations"], showsUnread: true },
  { key: "practice", to: "/practice", label: "Practice", match: ["/practice"] },
  { key: "premium", to: "/premium", label: "Premium", match: ["/premium"], premium: true },
];

export const TAB_NAV_ITEMS = [
  { key: "people", to: "/community", label: "People", match: ["/community", "/people"] },
  { key: "practice", to: "/practice", label: "Practice", match: ["/practice"] },
  { key: "chats", to: "/conversations", label: "Chats", match: ["/conversations"], showsUnread: true },
  { key: "profile", to: "/profile", label: "Profile", match: ["/profile", "/settings"] },
  { key: "premium", to: "/premium", label: "Premium", match: ["/premium"] },
];

/** True when `pathname` is one of the item's prefixes or nested below one. */
export const isNavItemActive = (pathname, item) =>
  item.match.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

/** An open chat (/conversations/:id) — on phones the tab bar is hidden so the composer stays clear. */
export const isOpenChatPath = (pathname) => /^\/conversations\/[^/]+\/?$/.test(pathname);

export const unreadLabel = (count) => (count > 99 ? "99+" : String(count));
