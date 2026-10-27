// Warm exchange palette (mirrors web `frontend/src/styles/tokens.css`), used by the People screen.
// Light text pairs are the web's AA-checked ones (ink on cream/paper/peach >= 11:1, mutedInk on
// cream 5.6:1 / peach 5.1:1, teal on paper 6.0:1, peachInk on paper 5.5:1, white on teal 6.1:1).
// Dark values keep the same roles with >= 4.5:1 for every text/surface pair they are used on.

export type WarmColors = {
  cream: string; // screen background
  paper: string; // cards, inputs
  peachSoft: string; // featured card
  peach: string; // "Speaks" pill
  peachStrong: string; // portrait placeholder
  sage: string; // "Practicing" pill, active segment, match badge
  line: string;
  lineWarm: string;
  ink: string;
  mutedInk: string;
  teal: string; // match labels / active segment text
  peachInk: string; // native badge text
  peachDeep: string; // initials on peachStrong
  action: string; // primary button background (teal)
  onAction: string;
  secondary: string; // secondary button background
  skeleton: string;
  scrim: string;
};

export const warmLight: WarmColors = {
  cream: "#f7f6f2",
  paper: "#fffdfa",
  peachSoft: "#fff4e8",
  peach: "#fbe9da",
  peachStrong: "#f5cfb1",
  sage: "#e4eee2",
  line: "#e8e7e0",
  lineWarm: "#ecdfd0",
  ink: "#152f3d",
  mutedInk: "#56656c",
  teal: "#176e65",
  peachInk: "#a94c26",
  peachDeep: "#8a3d1d",
  action: "#176e65",
  onAction: "#ffffff",
  secondary: "#fffaf4",
  skeleton: "#eeede7",
  scrim: "rgba(21, 47, 61, 0.42)",
};

export const warmDark: WarmColors = {
  cream: "#0f1a20",
  paper: "#16242c",
  peachSoft: "#22201d",
  peach: "#33261d",
  peachStrong: "#4a3324",
  sage: "#1b2f2a",
  line: "#2a3a42",
  lineWarm: "#3b3128",
  ink: "#f4efe8",
  mutedInk: "#b9b2a8",
  teal: "#7fd3c6",
  peachInk: "#f2b48f",
  peachDeep: "#f5cfb1",
  action: "#6cc7b9",
  onAction: "#0b1a20",
  secondary: "#1d2c34",
  skeleton: "#22313a",
  scrim: "rgba(0, 0, 0, 0.55)",
};

export const warmColors = (isDark: boolean) => (isDark ? warmDark : warmLight);
