import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { fetchUserProfile } from "../pages/Conversations/api/fetchUserProfile";
import { User } from "../pages/Profile/types";

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
  token: string;
};

const getAccessToken = () =>
  sessionStorage.getItem("accessToken") || localStorage.getItem("accessToken") || "";

const readCachedUser = (): User | null => {
  const token = getAccessToken();
  if (!token) return null;

  const rawCache = localStorage.getItem(USER_PROFILE_CACHE_KEY);
  if (!rawCache) return null;

  try {
    const parsed = JSON.parse(rawCache) as CachedUserPayload;
    if (!parsed?.user || !parsed?.cachedAt || !parsed?.token) {
      localStorage.removeItem(USER_PROFILE_CACHE_KEY);
      return null;
    }

    const isExpired = Date.now() - parsed.cachedAt > USER_PROFILE_CACHE_TTL_MS;
    const isTokenMismatch = parsed.token !== token;
    if (isExpired || isTokenMismatch) {
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
  const [loading, setLoading] = useState(() => Boolean(getAccessToken()));
  const [error, setError] = useState<string | null>(null);

  const setUser: React.Dispatch<React.SetStateAction<User | null>> = useCallback((nextUser) => {
    setUserState((prevUser) =>
      typeof nextUser === "function" ? (nextUser as (prev: User | null) => User | null)(prevUser) : nextUser
    );
  }, []);

  const refreshUserProfile = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      setUser(null);
      setError("No access token found");
      setLoading(false);
      localStorage.removeItem(USER_PROFILE_CACHE_KEY);
      return;
    }

    setLoading(true);
    try {
      const userData = await fetchUserProfile();
      setUser(userData);
      setError(null);
    } catch (err) {
      setUser(null);
      setError((err as Error).message);
      if ((err as Error).message === "Unauthorized") {
        sessionStorage.removeItem("accessToken");
        sessionStorage.removeItem("refreshToken");
        localStorage.removeItem("accessToken");
        localStorage.removeItem("refreshToken");
        localStorage.removeItem(USER_PROFILE_CACHE_KEY);
        window.location.href = "/login";
      }
    } finally {
      setLoading(false);
    }
  }, [setUser]);

  useEffect(() => {
    const token = getAccessToken();
    if (!token || !user) {
      localStorage.removeItem(USER_PROFILE_CACHE_KEY);
      return;
    }

    const payload: CachedUserPayload = {
      user,
      cachedAt: Date.now(),
      token,
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
