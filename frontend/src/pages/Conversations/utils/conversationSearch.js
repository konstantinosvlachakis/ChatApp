// Client-side filtering and labels for the conversation list.

const normalize = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

export const isGroupConversation = (conversation) => conversation?.kind === "group";

/** Active group members (in join order), as user profiles. */
export const groupMembers = (conversation) =>
  (conversation?.participants || [])
    .filter((participant) => participant.status === "active")
    .map((participant) => participant.user);

/** Pending invitees of a group, as user profiles. */
export const groupInvitees = (conversation) =>
  (conversation?.participants || [])
    .filter((participant) => participant.status === "pending")
    .map((participant) => participant.user);

/** The participant who isn't the viewer in a direct chat; null for groups (a group's
 * `sender` is its creator, not "the other person"). */
export const getOtherParticipant = (conversation, viewerUsername) => {
  if (isGroupConversation(conversation)) return null;
  return conversation?.sender?.username === viewerUsername ? conversation?.receiver : conversation?.sender;
};

/** What to call a chat: the group's (display) name or the other person's username. */
export const conversationTitle = (conversation, viewerUsername) => {
  if (isGroupConversation(conversation)) {
    return conversation.display_name || conversation.name || "Group chat";
  }
  return getOtherParticipant(conversation, viewerUsername)?.username || "Unknown participant";
};

/** Matches the other participant (or a group's name/members), native language or the last
 * message text. Accent-insensitive. */
export const conversationMatchesQuery = (conversation, query, viewerUsername) => {
  const needle = normalize(query);
  if (!needle) return true;
  const haystack = isGroupConversation(conversation)
    ? [conversationTitle(conversation), ...groupMembers(conversation).map((member) => member?.username)]
    : (() => {
        const other = getOtherParticipant(conversation, viewerUsername);
        return [other?.username, other?.native_language];
      })();
  return [...haystack, conversation?.last_message?.text].some((value) => normalize(value).includes(needle));
};

export const filterConversations = (conversations, query, viewerUsername) =>
  normalize(query)
    ? conversations.filter((conversation) => conversationMatchesQuery(conversation, query, viewerUsername))
    : conversations;

/** The pinned Lumi row stays visible unless the query clearly doesn't match it. */
export const coachMatchesQuery = (coachConversation, query) => {
  const needle = normalize(query);
  if (!needle) return true;
  return ["lumi", "ai", "coach", coachConversation?.last_message?.text].some((value) =>
    normalize(value).includes(needle)
  );
};

const TIME_FORMATTER = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const WEEKDAY_FORMATTER = new Intl.DateTimeFormat(undefined, { weekday: "short" });
const DATE_FORMATTER = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
const DATE_WITH_YEAR_FORMATTER = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" });

const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

/** "10:22 AM" today, "Yesterday", a weekday within the last week, otherwise "Mar 3" (or with year). */
export const formatListTime = (timestamp, now = new Date()) => {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86400000);
  if (days <= 0) return TIME_FORMATTER.format(date);
  if (days === 1) return "Yesterday";
  if (days < 7) return WEEKDAY_FORMATTER.format(date);
  return (date.getFullYear() === now.getFullYear() ? DATE_FORMATTER : DATE_WITH_YEAR_FORMATTER).format(date);
};

/** Two-letter initials for avatar fallbacks. */
export const getInitials = (name) => {
  const parts = String(name || "").trim().split(/[\s._-]+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
};
