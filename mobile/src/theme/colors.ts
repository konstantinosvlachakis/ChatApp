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
  background: "#f5f7fb",
  surface: "#ffffff",
  surfaceMuted: "#edf3f7",
  text: "#14314a",
  mutedText: "#6b7a90",
  primary: "#1b7f79",
  danger: "#d95b70",
  border: "#d7e2ea",
  navy: "#14314a",
  inputBackground: "#ffffff",
  chipBackground: "#edf3f7",
  chipText: "#14314a",
  activeChipBackground: "#14314a",
  activeChipText: "#ffffff",
  tabBarBackground: "#fbfcfe",
  cardShadow: "#081320",
  overlayTint: "rgba(91,192,235,0.14)",
  success: "#228b67",
  link: "#177f8d",
};

export const darkColors: ThemeColors = {
  background: "#081320",
  surface: "#102235",
  surfaceMuted: "#163047",
  text: "#f5f7fb",
  mutedText: "#9db0c1",
  primary: "#1b7f79",
  danger: "#f38a99",
  border: "#24455f",
  navy: "#14314a",
  inputBackground: "#0e2235",
  chipBackground: "#17324a",
  chipText: "#dce7ef",
  activeChipBackground: "#1b7f79",
  activeChipText: "#f5f7fb",
  tabBarBackground: "#091725",
  cardShadow: "#01070d",
  overlayTint: "rgba(91,192,235,0.12)",
  success: "#57c2a2",
  link: "#5bc0eb",
};

export const themeColorsByMode: Record<ThemeMode, ThemeColors> = {
  light: lightColors,
  dark: darkColors,
};
