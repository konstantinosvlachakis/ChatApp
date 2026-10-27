import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { fetchUserProfile } from "../pages/Conversations/api/fetchUserProfile";
import { User } from "../pages/Profile/types";
import { clearClientSessionData, isPublicPath } from "../utils/auth";

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

  const userRef = useRef(user);
  userRef.current = user;
  // Only the newest refresh may apply its result, and a logout (user set to null)
  // starts a new session epoch so an older in-flight refresh can't restore the user.
  const latestRefreshRef = useRef(0);
  const sessionEpochRef = useRef(0);

  const setUser: React.Dispatch<React.SetStateAction<User | null>> = useCallback((nextUser) => {
    if (nextUser === null) sessionEpochRef.current += 1;
    setUserState((prevUser) =>
      typeof nextUser === "function" ? (nextUser as (prev: User | null) => User | null)(prevUser) : nextUser
    );
  }, []);

  const refreshUserProfile = useCallback(async () => {
    const refreshId = ++latestRefreshRef.current;
    const epoch = sessionEpochRef.current;
    const isCurrent = () => refreshId === latestRefreshRef.current && epoch === sessionEpochRef.current;
    // Background refreshes (after a save, on settings) keep showing the current user;
    // only a first load without one shows loading, so pages don't blank and remount.
    if (!userRef.current) setLoading(true);
    try {
      const userData = await fetchUserProfile();
      if (!isCurrent()) return;
      setUserState(userData);
      setError(null);
    } catch (err) {
      if (!isCurrent()) return;
      setError((err as Error).message);
      // Only a real 401 signs out; a network blip keeps the session we already have.
      if ((err as Error).message === "Unauthorized") {
        setUserState(null);
        clearClientSessionData();
        if (typeof window !== "undefined" && !isPublicPath(window.location.pathname)) {
          window.location.href = "/login";
        }
      }
    } finally {
      if (refreshId === latestRefreshRef.current) setLoading(false);
    }
  }, []);

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

  const contextValue = useMemo(
    () => ({ user, setUser, loading, error, refreshUserProfile }),
    [user, setUser, loading, error, refreshUserProfile]
  );

  return (
    <UserContext.Provider value={contextValue}>
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
