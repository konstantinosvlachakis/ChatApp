import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { themeStorage } from "../services/storage";
import { themeColorsByMode, ThemeColors, ThemeMode } from "../theme/colors";

type ThemeContextValue = {
  mode: ThemeMode;
  colors: ThemeColors;
  isDark: boolean;
  setMode: (mode: ThemeMode) => Promise<void>;
  toggleMode: () => Promise<void>;
  hydrated: boolean;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("light");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let mounted = true;
    const hydrate = async () => {
      try {
        const storedMode = await themeStorage.getThemeMode();
        if (mounted && (storedMode === "light" || storedMode === "dark")) {
          setModeState(storedMode);
        }
      } finally {
        if (mounted) {
          setHydrated(true);
        }
      }
    };

    hydrate();
    return () => {
      mounted = false;
    };
  }, []);

  const setMode = useCallback(async (nextMode: ThemeMode) => {
    setModeState(nextMode);
    await themeStorage.setThemeMode(nextMode);
  }, []);

  const toggleMode = useCallback(async () => {
    const nextMode: ThemeMode = mode === "dark" ? "light" : "dark";
    setModeState(nextMode);
    await themeStorage.setThemeMode(nextMode);
  }, [mode]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      colors: themeColorsByMode[mode],
      isDark: mode === "dark",
      setMode,
      toggleMode,
      hydrated,
    }),
    [hydrated, mode, setMode, toggleMode]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
