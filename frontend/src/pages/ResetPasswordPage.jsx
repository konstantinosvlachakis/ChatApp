import React, { useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import api, { getErrorMessage, isApiError } from "../lib/api";

const passwordFieldClassName =
  "flex items-center gap-2 rounded-2xl border border-[#d6e0e8] bg-white px-3 shadow-sm transition focus-within:border-[#1b7f79] focus-within:ring-4 focus-within:ring-[rgba(27,127,121,0.12)]";
const passwordInputClassName =
  "min-w-0 flex-1 border-0 bg-transparent py-3.5 pl-1 pr-0 text-sm text-slate-900 outline-none placeholder:text-slate-400";
const primaryButtonClassName =
  "w-full rounded-full bg-[#14314a] py-3.5 text-sm font-semibold text-white shadow-[0_16px_34px_rgba(20,49,74,0.22)] transition hover:bg-[#10263a] disabled:cursor-not-allowed disabled:opacity-60";

/** Validator messages from the backend (`details` list), else the envelope text. */
const passwordErrorsFrom = (err) => {
  if (isApiError(err) && Array.isArray(err.details)) {
    const messages = err.details.filter((item) => typeof item === "string" && item.trim());
    if (messages.length) return messages;
  }
  return [getErrorMessage(err, "Choose a different password.")];
};

const ResetPasswordPage = () => {
  const { uid = "", token = "" } = useParams();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [passwordErrors, setPasswordErrors] = useState([]);
  const [error, setError] = useState("");
  const [linkInvalid, setLinkInvalid] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const inFlightRef = useRef(false);

  const validate = () => {
    const nextErrors = {};
    if (!password) {
      nextErrors.password = "Enter a new password.";
    } else if (password.length < 8) {
      nextErrors.password = "Password must be at least 8 characters.";
    }
    if (!confirmPassword) {
      nextErrors.confirmPassword = "Confirm your new password.";
    } else if (password && confirmPassword !== password) {
      nextErrors.confirmPassword = "Passwords don't match.";
    }
    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (inFlightRef.current) return;
    setError("");
    setPasswordErrors([]);
    if (!validate()) return;

    inFlightRef.current = true;
    setLoading(true);
    try {
      await api.post("/api/auth/password-reset/confirm/", {
        uid,
        token,
        new_password: password,
      });
      setDone(true);
    } catch (err) {
      const code = isApiError(err) ? err.code : "";
      if (code === "invalid_reset_link") {
        setLinkInvalid(true);
        setError(getErrorMessage(err, "This reset link is invalid or has expired."));
      } else if (code === "invalid_password") {
        setPasswordErrors(passwordErrorsFrom(err));
      } else {
        setError(getErrorMessage(err, "We couldn't reset your password. Please try again."));
      }
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="space-y-4" role="status" aria-live="polite">
        <div className="rounded-2xl border border-[#cfe6e2] bg-[#eef7f5] px-4 py-4 text-sm leading-6 text-[#14314a]">
          <h2 className="text-base font-semibold">Password updated</h2>
          <p className="mt-1">Your password has been reset. Log in with your new password.</p>
        </div>
        <Link to="/login" className={`${primaryButtonClassName} block text-center`}>
          Go to log in
        </Link>
      </div>
    );
  }

  if (linkInvalid) {
    return (
      <div className="space-y-4" role="alert">
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm leading-6 text-rose-700">
          <h2 className="text-base font-semibold">Link expired</h2>
          <p className="mt-1">{error}</p>
        </div>
        <Link to="/forgot-password" className={`${primaryButtonClassName} block text-center`}>
          Request a new link
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3.5" noValidate>
      <div>
        <label htmlFor="new-password" className="mb-1.5 block text-sm font-semibold text-[#14314a]">
          New password
        </label>
        <div className={passwordFieldClassName}>
          <input
            id="new-password"
            type={showPassword ? "text" : "password"}
            className={passwordInputClassName}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="At least 8 characters"
            autoComplete="new-password"
            aria-invalid={fieldErrors.password || passwordErrors.length ? "true" : undefined}
            aria-describedby={
              fieldErrors.password
                ? "new-password-error"
                : passwordErrors.length
                  ? "new-password-rules"
                  : undefined
            }
          />
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            className="shrink-0 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-500 transition hover:bg-slate-200"
            aria-label={showPassword ? "Hide passwords" : "Show passwords"}
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        </div>
        {fieldErrors.password && (
          <p id="new-password-error" className="mt-1 text-xs text-rose-600">
            {fieldErrors.password}
          </p>
        )}
      </div>

      <div>
        <label
          htmlFor="confirm-password"
          className="mb-1.5 block text-sm font-semibold text-[#14314a]"
        >
          Confirm new password
        </label>
        <div className={passwordFieldClassName}>
          <input
            id="confirm-password"
            type={showPassword ? "text" : "password"}
            className={passwordInputClassName}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder="Type it again"
            autoComplete="new-password"
            aria-invalid={fieldErrors.confirmPassword ? "true" : undefined}
            aria-describedby={fieldErrors.confirmPassword ? "confirm-password-error" : undefined}
          />
        </div>
        {fieldErrors.confirmPassword && (
          <p id="confirm-password-error" className="mt-1 text-xs text-rose-600">
            {fieldErrors.confirmPassword}
          </p>
        )}
      </div>

      {passwordErrors.length > 0 && (
        <div
          id="new-password-rules"
          role="alert"
          className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
        >
          <ul className="list-disc space-y-1 pl-4">
            {passwordErrors.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
        >
          {error}
        </div>
      )}

      <button type="submit" disabled={loading} className={primaryButtonClassName}>
        {loading ? "Saving…" : "Set new password"}
      </button>
    </form>
  );
};

export default ResetPasswordPage;
