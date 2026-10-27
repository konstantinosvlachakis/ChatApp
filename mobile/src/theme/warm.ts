// Warm exchange palette (mirrors web `frontend/src/styles/tokens.css`), used by the People and
// Chats screens.
// Light text pairs are the web's AA-checked ones (ink on cream/paper/peach >= 11:1, mutedInk on
// cream 5.6:1 / peach 5.1:1 / bubbleOut 4.95:1, teal on paper 6.0:1, peachInk on paper 5.5:1,
// white on teal 6.1:1 / navy 13.4:1 / badge 5.1:1, danger on paper 5.0:1).
// Dark values keep the same roles with >= 4.5:1 for every text/surface pair they are used on.

export type WarmColors = {
  cream: string; // screen background
  creamDeep: string; // day separator pills, pressed rows
  paper: string; // cards, inputs, chat background
  peachSoft: string; // featured card, pinned bar
  peach: string; // "Speaks" pill
  peachStrong: string; // portrait placeholder
  sage: string; // "Practicing" pill, active segment, match badge, Lumi row
  line: string;
  lineWarm: string;
  ink: string;
  inkSoft: string; // secondary text on cream/paper/bubbles
  mutedInk: string;
  teal: string; // match labels / active segment text / "Online now" / read ticks
  peachInk: string; // native badge text, unread divider
  peachDeep: string; // initials on peachStrong
  action: string; // primary button background (teal)
  onAction: string;
  secondary: string; // secondary button background
  skeleton: string;
  scrim: string;
  // Chat
  bubbleIn: string; // received bubble
  bubbleOut: string; // sent bubble
  quote: string; // reply quote inside a bubble
  navy: string; // send button, primary pills
  onNavy: string;
  online: string; // presence dot (non-text)
  badge: string; // unread count pill
  onBadge: string;
  danger: string; // destructive text/icons
  dangerSoft: string; // destructive row background
  mark: string; // search match highlight
  markActive: string; // current search match
  imageScrim: string; // overlay on a photo while it uploads
  onImageScrim: string;
  shadow: string;
};

export const warmLight: WarmColors = {
  cream: "#f7f6f2",
  creamDeep: "#eeede7",
  paper: "#fffdfa",
  peachSoft: "#fff4e8",
  peach: "#fbe9da",
  peachStrong: "#f5cfb1",
  sage: "#e4eee2",
  line: "#e8e7e0",
  lineWarm: "#ecdfd0",
  ink: "#152f3d",
  inkSoft: "#3d5260",
  mutedInk: "#56656c",
  teal: "#176e65",
  peachInk: "#a94c26",
  peachDeep: "#8a3d1d",
  action: "#176e65",
  onAction: "#ffffff",
  secondary: "#fffaf4",
  skeleton: "#eeede7",
  scrim: "rgba(21, 47, 61, 0.42)",
  bubbleIn: "#e8eee9",
  bubbleOut: "#fde4d0",
  quote: "rgba(255, 255, 255, 0.6)",
  navy: "#152f3d",
  onNavy: "#ffffff",
  online: "#1f9d6b",
  badge: "#c2412f",
  onBadge: "#ffffff",
  danger: "#c2412f",
  dangerSoft: "#fbe8e4",
  mark: "#fde68a",
  markActive: "#fbbf24",
  imageScrim: "rgba(0, 0, 0, 0.28)",
  onImageScrim: "#ffffff",
  shadow: "#152f3d",
};

export const warmDark: WarmColors = {
  cream: "#0f1a20",
  creamDeep: "#1a2930",
  paper: "#16242c",
  peachSoft: "#22201d",
  peach: "#33261d",
  peachStrong: "#4a3324",
  sage: "#1b2f2a",
  line: "#2a3a42",
  lineWarm: "#3b3128",
  ink: "#f4efe8",
  inkSoft: "#d6cfc6",
  mutedInk: "#b9b2a8",
  teal: "#7fd3c6",
  peachInk: "#f2b48f",
  peachDeep: "#f5cfb1",
  action: "#6cc7b9",
  onAction: "#0b1a20",
  secondary: "#1d2c34",
  skeleton: "#22313a",
  scrim: "rgba(0, 0, 0, 0.55)",
  bubbleIn: "#1f332e",
  bubbleOut: "#3a2a1f",
  quote: "rgba(0, 0, 0, 0.22)",
  navy: "#f4efe8",
  onNavy: "#0f1a20",
  online: "#4cc38a",
  badge: "#c2412f",
  onBadge: "#ffffff",
  danger: "#ff9e8a",
  dangerSoft: "#3a2422",
  mark: "#6b5a1a",
  markActive: "#75590c",
  imageScrim: "rgba(0, 0, 0, 0.36)",
  onImageScrim: "#ffffff",
  shadow: "#000000",
};

export const warmColors = (isDark: boolean) => (isDark ? warmDark : warmLight);
