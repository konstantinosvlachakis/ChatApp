import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { fetchUserProfile } from "../pages/Conversations/api/fetchUserProfile";
import { User } from "../pages/Profile/types";
import { clearLegacyTokens, isPublicPath } from "../utils/auth";

interface UserContextType {
  user: User | null;
  setUser: React.Dispatch<React.SetStateAction<User | null>>;
  loading: boolean;
  error: string | null;
  refreshUserProfile: () => Promise<void>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

const USER_PROFILE_CACHE_KEY = "user_profile_cache:v1";
const USER_PROFILE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

type CachedUserPayload = {
  user: User;
  cachedAt: number;
};

const readCachedUser = (): User | null => {
  if (typeof window === "undefined") return null;
  const rawCache = localStorage.getItem(USER_PROFILE_CACHE_KEY);
  if (!rawCache) return null;

  try {
    const parsed = JSON.parse(rawCache) as CachedUserPayload;
    if (!parsed?.user || !parsed?.cachedAt) {
      localStorage.removeItem(USER_PROFILE_CACHE_KEY);
      return null;
    }

    const isExpired = Date.now() - parsed.cachedAt > USER_PROFILE_CACHE_TTL_MS;
    if (isExpired) {
      localStorage.removeItem(USER_PROFILE_CACHE_KEY);
      return null;
    }

    return parsed.user;
  } catch {
    localStorage.removeItem(USER_PROFILE_CACHE_KEY);
    return null;
  }
};

export const UserProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUserState] = useState<User | null>(() => readCachedUser());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const setUser: React.Dispatch<React.SetStateAction<User | null>> = useCallback((nextUser) => {
    setUserState((prevUser) =>
      typeof nextUser === "function" ? (nextUser as (prev: User | null) => User | null)(prevUser) : nextUser
    );
  }, []);

  const refreshUserProfile = useCallback(async () => {
    setLoading(true);
    try {
      const userData = await fetchUserProfile();
      setUser(userData);
      setError(null);
    } catch (err) {
      setUser(null);
      setError((err as Error).message);
      if ((err as Error).message === "Unauthorized") {
        clearLegacyTokens();
        if (typeof window !== "undefined") {
          localStorage.removeItem(USER_PROFILE_CACHE_KEY);
        }
        if (typeof window !== "undefined" && !isPublicPath(window.location.pathname)) {
          window.location.href = "/login";
        }
      }
    } finally {
      setLoading(false);
    }
  }, [setUser]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!user) {
      localStorage.removeItem(USER_PROFILE_CACHE_KEY);
      return;
    }

    const payload: CachedUserPayload = {
      user,
      cachedAt: Date.now(),
    };
    localStorage.setItem(USER_PROFILE_CACHE_KEY, JSON.stringify(payload));
  }, [user]);

  useEffect(() => {
    refreshUserProfile();
  }, [refreshUserProfile]);

  return (
    <UserContext.Provider
      value={{ user, setUser, loading, error, refreshUserProfile }}
    >
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
};
