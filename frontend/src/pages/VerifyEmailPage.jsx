import React, { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import AuthShell from "../components/Auth/AuthShell";
import VerifyEmailForm from "../components/EmailVerification/VerifyEmailForm";
import { useUser } from "../context/UserContext";
import api, { getErrorMessage } from "../lib/api";

export default function VerifyEmailPage() {
  const { user, loading, refreshUserProfile } = useUser();
  const location = useLocation();
  const navigate = useNavigate();
  const token = new URLSearchParams(location.search).get("token");
  const [result, setResult] = useState(null);
  const submitted = useRef(null);
  useEffect(() => {
    if (!token || submitted.current === token) return;
    submitted.current = token;
    api.post("/api/auth/verify-email/confirm-link/", { token }).then(() => {
      setResult({ ok: true });
      // The link may belong to a different account; re-read this session's profile.
      refreshUserProfile();
    }).catch((error) => setResult({ error: getErrorMessage(error) }));
  }, [token, refreshUserProfile]);
  return <AuthShell eyebrow="Email verification" title="Make your next connection."
    description="Confirm your email to start chatting. You can keep exploring and practising while you wait.">
    {token ? <div className="ev-form">
      <h1>{result?.ok ? "Email verified" : result?.error ? "This link didn't work" : "Verifying your email…"}</h1>
      {result?.error && <p role="alert">{result.error}</p>}
      {result?.ok && <p>You can return to the app and start chatting.</p>}
      {result && <Link to={user ? "/community" : "/login"}>Continue to LangVoyage</Link>}
      {result?.error && <p><Link to="/verify-email">Use a code instead</Link></p>}
    </div> : loading ? <p>Loading…</p> : !user ? <div className="ev-form">
      <h1>Check your email</h1><p>Log in to enter your verification code.</p>
      <Link to="/login" state={{ verifyEmail: true }}>Log in</Link>
    </div> : user.email_verified === true ? <div className="ev-form"><h1>Email verified</h1>
      <Link to="/community">Continue to LangVoyage</Link></div> :
      <VerifyEmailForm onVerified={() => navigate("/community", { replace: true })} onLater={() => navigate("/community")} />}
  </AuthShell>;
}
