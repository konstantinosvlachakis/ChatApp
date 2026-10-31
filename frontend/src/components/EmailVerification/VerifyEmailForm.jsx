import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import api, { getErrorMessage } from "../../lib/api";
import { useUser } from "../../context/UserContext";
import { resendRemaining, sanitizeCode, startResendCooldown } from "../../features/emailVerification";
import "./verification.css";

export default function VerifyEmailForm({ onVerified, onLater }) {
  const { user, setUser, refreshUserProfile } = useUser();
  const email = user?.email || "";
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(() => resendRemaining(email));
  const inFlight = useRef(false);
  useEffect(() => {
    const timer = setInterval(() => setCooldown(resendRemaining(email)), 1000);
    return () => clearInterval(timer);
  }, [email]);

  const finish = () => {
    setUser((current) => current ? { ...current, email_verified: true } : current);
    refreshUserProfile();
    onVerified?.();
  };
  const submit = async (event) => {
    event.preventDefault();
    if (inFlight.current) return;
    if (!/^\d{6}$/.test(code)) { setError("Enter the 6-digit code from the email."); return; }
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      await api.post("/api/auth/verify-email/confirm/", { code });
      finish();
    } catch (failure) {
      setError(getErrorMessage(failure));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  const resend = async () => {
    if (inFlight.current || resendRemaining(email) > 0) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await api.post("/api/auth/verify-email/send/");
      if (response.email_verified) { finish(); return; }
      startResendCooldown(email);
      setCooldown(resendRemaining(email));
      setCode("");
      setNotice("New code sent. Check your inbox and spam folder.");
    } catch (failure) {
      if (failure.code === "throttled") {
        startResendCooldown(email, Math.max(60, Math.ceil((failure.retryAfterMs || 0) / 1000)));
        setCooldown(resendRemaining(email));
      }
      setError(getErrorMessage(failure));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  return <div className="ev-form">
    <h1 id="verify-email-title">Check your email</h1>
    <p>Enter the 6-digit code sent to <strong>{email}</strong>. It expires in 15 minutes.</p>
    <form onSubmit={submit}>
      <label htmlFor="verification-code">Verification code</label>
      <input id="verification-code" className="ev-code" value={code}
        onChange={(event) => { setCode(sanitizeCode(event.target.value)); setError(""); }}
        inputMode="numeric" autoComplete="one-time-code" autoFocus
        maxLength={32} disabled={busy} aria-invalid={Boolean(error)} aria-describedby={error ? "verification-error" : undefined} />
      {error && <p id="verification-error" role="alert" className="ev-error">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <button className="ev-primary" disabled={busy} type="submit">{busy ? "Please wait…" : "Verify email"}</button>
    </form>
    <button className="ev-link" type="button" onClick={resend} disabled={busy || cooldown > 0}>
      {cooldown > 0 ? `Resend code in ${Math.floor(cooldown / 60)}:${String(cooldown % 60).padStart(2, "0")}` : "Resend code"}
    </button>
    <p>Wrong address? <Link to="/profile/edit" onClick={onLater}>Change it in your profile</Link>.</p>
    <button className="ev-link" type="button" onClick={onLater}>Do this later</button>
  </div>;
}
