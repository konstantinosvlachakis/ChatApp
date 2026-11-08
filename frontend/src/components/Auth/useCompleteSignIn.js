import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useUser } from "../../context/UserContext";
import { clearClientSessionData, setLegacyTokens, shouldUseLegacyAuthFallback } from "../../utils/auth";

export const FINISH_PROFILE_PATH = "/finish-profile";

/**
 * The shared post-login path (password log in, Google sign-in/up): drop the previous
 * session's client state, keep the localhost-only legacy tokens, reload the current
 * user, then open `next` — or /finish-profile when the account still needs its languages.
 */
export function useCompleteSignIn() {
  const { refreshUserProfile } = useUser();
  const navigate = useNavigate();

  return useCallback(
    async (tokens, { rememberMe = true, next = "/profile" } = {}) => {
      // Keep the hint the login response just set (the new session's).
      clearClientSessionData({ keepSessionHint: true });
      if (shouldUseLegacyAuthFallback()) {
        setLegacyTokens({ access: tokens?.access, refresh: tokens?.refresh, rememberMe });
      }
      await refreshUserProfile();
      navigate(tokens?.profile_complete === false ? FINISH_PROFILE_PATH : next);
    },
    [navigate, refreshUserProfile]
  );
}
