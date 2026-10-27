import React, { useRef, useState } from "react";
import { Link } from "react-router-dom";
import api, { getErrorMessage } from "../lib/api";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const inputClassName =
  "w-full rounded-2xl border border-[#d6e0e8] bg-white px-4 py-3.5 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-[#1b7f79] focus:ring-4 focus:ring-[rgba(27,127,121,0.12)]";
const primaryButtonClassName =
  "w-full rounded-full bg-[#14314a] py-3.5 text-sm font-semibold text-white shadow-[0_16px_34px_rgba(20,49,74,0.22)] transition hover:bg-[#10263a] disabled:cursor-not-allowed disabled:opacity-60";

/**
 * Asks the backend to email a reset link. The backend answers the same way whether
 * or not the address has an account, so the page always shows "check your inbox"
 * once the request went through.
 */
const ForgotPasswordPage = () => {
  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sentTo, setSentTo] = useState("");
  const inFlightRef = useRef(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (inFlightRef.current) return;
    setError("");

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      setFieldError("Email is required.");
      return;
    }
    if (!EMAIL_REGEX.test(trimmedEmail)) {
      setFieldError("Enter a valid email address.");
      return;
    }
    setFieldError("");

    inFlightRef.current = true;
    setLoading(true);
    try {
      await api.post("/api/auth/password-reset/", { email: trimmedEmail });
      setSentTo(trimmedEmail);
    } catch (err) {
      setError(getErrorMessage(err, "We couldn't send the reset email. Please try again."));
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  };

  if (sentTo) {
    return (
      <div className="space-y-4" role="status" aria-live="polite">
        <div className="rounded-2xl border border-[#cfe6e2] bg-[#eef7f5] px-4 py-4 text-sm leading-6 text-[#14314a]">
          <h2 className="text-base font-semibold">Check your inbox</h2>
          <p className="mt-1">
            If an account exists for <strong className="break-all">{sentTo}</strong>, we&apos;ve sent a
            link to reset your password. It expires in 1 hour.
          </p>
          <p className="mt-2 text-slate-600">
            Didn&apos;t get it? Check your spam folder, or try again in a few minutes.
          </p>
        </div>
        <button
          type="button"
          className="w-full rounded-full border border-[#d6e0e8] bg-white py-3 text-sm font-semibold text-[#14314a] transition hover:bg-[#f7fafc]"
          onClick={() => setSentTo("")}
        >
          Use a different email
        </button>
        <Link
          to="/login"
          className="block text-center text-sm font-semibold text-[#1b7f79] hover:text-[#14314a]"
        >
          Back to log in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3.5" noValidate>
      <p className="text-sm leading-6 text-slate-600">
        Enter the email you signed up with and we&apos;ll send you a link to choose a new password.
      </p>
      <div>
        <label htmlFor="forgot-email" className="mb-1.5 block text-sm font-semibold text-[#14314a]">
          Email
        </label>
        <input
          id="forgot-email"
          type="email"
          className={inputClassName}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          aria-invalid={fieldError ? "true" : undefined}
          aria-describedby={fieldError ? "forgot-email-error" : undefined}
        />
        {fieldError && (
          <p id="forgot-email-error" className="mt-1 text-xs text-rose-600">
            {fieldError}
          </p>
        )}
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
        >
          {error}
        </div>
      )}

      <button type="submit" disabled={loading} className={primaryButtonClassName}>
        {loading ? "Sending…" : "Send reset link"}
      </button>
    </form>
  );
};

export default ForgotPasswordPage;
