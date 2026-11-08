import React from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useUser } from "../../context/UserContext";
import { FINISH_PROFILE_PATH } from "./useCompleteSignIn";

/**
 * Wraps the signed-in app (Layout routes): an account created without languages
 * (Google sign-in from the log in page) is sent to /finish-profile from every app route.
 * Only an explicit `profile_complete: false` counts — an older backend omits the field.
 * Logout, privacy, terms and /finish-profile are outside this wrapper, so they stay
 * reachable; Layout still handles "no session" (→ /login).
 */
export default function RequireCompleteProfile({ children }) {
  const { user } = useUser();
  if (user && user.profile_complete === false) {
    return <Navigate to={FINISH_PROFILE_PATH} replace />;
  }
  return children ?? <Outlet />;
}
