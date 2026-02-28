export type ThemeMode = "light" | "dark";

export type ThemeColors = {
  background: string;
  surface: string;
  surfaceMuted: string;
  text: string;
  mutedText: string;
  primary: string;
  danger: string;
  border: string;
  navy: string;
  inputBackground: string;
  chipBackground: string;
  chipText: string;
  activeChipBackground: string;
  activeChipText: string;
  tabBarBackground: string;
  cardShadow: string;
  overlayTint: string;
  success: string;
  link: string;
};

export const lightColors: ThemeColors = {
  background: "#f7f6f4",
  surface: "#ffffff",
  surfaceMuted: "#eef2f7",
  text: "#1f2937",
  mutedText: "#6b7280",
  primary: "#3b82f6",
  danger: "#ef4444",
  border: "#e5e7eb",
  navy: "#334155",
  inputBackground: "#ffffff",
  chipBackground: "#f1f5f9",
  chipText: "#1f2937",
  activeChipBackground: "#334155",
  activeChipText: "#ffffff",
  tabBarBackground: "#ffffff",
  cardShadow: "#0f172a",
  overlayTint: "rgba(56,189,248,0.14)",
  success: "#22c55e",
  link: "#0e7490",
};

export const darkColors: ThemeColors = {
  background: "#0b1220",
  surface: "#111b2e",
  surfaceMuted: "#1a2740",
  text: "#e5edf8",
  mutedText: "#94a3b8",
  primary: "#60a5fa",
  danger: "#f87171",
  border: "#25324d",
  navy: "#1e293b",
  inputBackground: "#16233a",
  chipBackground: "#1c2c48",
  chipText: "#d5e3f7",
  activeChipBackground: "#60a5fa",
  activeChipText: "#0b1220",
  tabBarBackground: "#0f172a",
  cardShadow: "#020617",
  overlayTint: "rgba(56,189,248,0.08)",
  success: "#4ade80",
  link: "#67e8f9",
};

export const themeColorsByMode: Record<ThemeMode, ThemeColors> = {
  light: lightColors,
  dark: darkColors,
};
