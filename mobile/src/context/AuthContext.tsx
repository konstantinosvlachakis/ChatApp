import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { tokenStorage } from "../services/storage";
import { fetchProfile, login as loginApi, logout as logoutApi } from "../services/api/auth";
import type { Profile } from "../types";

type AuthContextValue = {
  user: Profile | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  isAuthenticated: boolean;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const withTimeout = async <T,>(promise: Promise<T>, ms = 8000): Promise<T> => {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error("Auth bootstrap timeout")), ms)
      ),
    ]);
  };

  const refreshProfile = async () => {
    const profile = await fetchProfile();
    setUser(profile);
  };

  const hydrate = async () => {
    try {
      const token = await withTimeout(tokenStorage.getAccessToken());
      if (!token) {
        setUser(null);
        return;
      }
      await withTimeout(refreshProfile());
    } catch {
      await tokenStorage.clear();
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    hydrate();
  }, []);

  const login = async (email: string, password: string) => {
    await loginApi(email, password);
    await refreshProfile();
  };

  const logout = async () => {
    await logoutApi();
    setUser(null);
  };

  const value = useMemo(
    () => ({
      user,
      loading,
      login,
      logout,
      refreshProfile,
      isAuthenticated: Boolean(user),
    }),
    [user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
};
