import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { tokenStorage } from "../services/storage";
import { fetchProfile, login as loginApi, logout as logoutApi } from "../services/api/auth";
import { resetEmailVerificationSession } from "../services/emailVerification";
import { unregisterPushDevice } from "../services/push";
import type { Profile } from "../types";

type AuthContextValue = {
  user: Profile | null;
  loading: boolean;
  /**
   * `verifyEmail`: right after sign-up; AppTabs then opens VerifyEmail once (if the profile
   * says the email is unverified).
   */
  login: (email: string, password: string, options?: { verifyEmail?: boolean }) => Promise<void>;
  /** `sessionRevoked`: the server already revoked every token (log out of all devices). */
  logout: (options?: { sessionRevoked?: boolean }) => Promise<void>;
  refreshProfile: () => Promise<void>;
  /** Merge a known `email_verified` (verify success, 403 email_unverified) into the user. */
  setEmailVerified: (verified: boolean) => void;
  /** Set by `login(..., {verifyEmail: true})`; AppTabs consumes it and opens VerifyEmail. */
  pendingEmailVerification: boolean;
  clearPendingEmailVerification: () => void;
  isAuthenticated: boolean;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingEmailVerification, setPendingEmailVerification] = useState(false);

  const withTimeout = async <T,>(promise: Promise<T>, ms = 8000): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          timer = setTimeout(() => reject(new Error("Auth bootstrap timeout")), ms);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  const refreshProfile = useCallback(async () => {
    const profile = await fetchProfile();
    setUser(profile);
  }, []);

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

  const login = async (email: string, password: string, options?: { verifyEmail?: boolean }) => {
    await loginApi(email, password);
    // Set before the user (same render), so AppTabs sees it when it mounts.
    if (options?.verifyEmail) setPendingEmailVerification(true);
    try {
      await refreshProfile();
    } catch (error) {
      setPendingEmailVerification(false);
      throw error;
    }
  };

  const setEmailVerified = useCallback((verified: boolean) => {
    setUser((current) =>
      current && current.email_verified !== verified ? { ...current, email_verified: verified } : current
    );
  }, []);

  const clearPendingEmailVerification = useCallback(() => setPendingEmailVerification(false), []);

  const logout = async (options?: { sessionRevoked?: boolean }) => {
    // Needs the session, so before the tokens are cleared (bounded, never throws).
    // After "log out of all devices" the session is gone and the server already
    // deactivated the account's push tokens.
    if (!options?.sessionRevoked) {
      await unregisterPushDevice();
    }
    // Revokes this device's refresh token (best effort), then clears local data.
    await logoutApi();
    resetEmailVerificationSession();
    setPendingEmailVerification(false);
    setUser(null);
  };

  const value = useMemo(
    () => ({
      user,
      loading,
      login,
      logout,
      refreshProfile,
      setEmailVerified,
      pendingEmailVerification,
      clearPendingEmailVerification,
      isAuthenticated: Boolean(user),
    }),
    [user, loading, pendingEmailVerification, setEmailVerified, clearPendingEmailVerification]
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
