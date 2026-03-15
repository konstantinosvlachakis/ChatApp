import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import CircularProgress from "@mui/material/CircularProgress";
import axios from "axios";
import { BASE_URL } from "../constants/constants";
import { useUser } from "../context/UserContext";
import { clearLegacyTokens, setLegacyTokens, shouldUseLegacyAuthFallback } from "../utils/auth";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const LoginPage = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const navigate = useNavigate();
  const { refreshUserProfile } = useUser();

  const validate = () => {
    const nextErrors = {};
    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedEmail) {
      nextErrors.email = "Email is required.";
    } else if (!EMAIL_REGEX.test(trimmedEmail)) {
      nextErrors.email = "Enter a valid email address.";
    }

    if (!password) {
      nextErrors.password = "Password is required.";
    } else if (password.length < 8) {
      nextErrors.password = "Password must be at least 8 characters.";
    }

    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };
  
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setFieldErrors({});

    if (!validate()) {
      setLoading(false);
      return;
    }

    try {
      const response = await axios.post(
        BASE_URL + "/api/token/",
        {
          email: email.trim().toLowerCase(),
          password,
          remember_me: rememberMe,
        },
        {
          withCredentials: true,
        }
      );

      clearLegacyTokens();
      if (shouldUseLegacyAuthFallback()) {
        setLegacyTokens({
          access: response.data?.access,
          refresh: response.data?.refresh,
          rememberMe,
        });
      }

      await refreshUserProfile();

      navigate("/profile");
    } catch (error) {
      setError(error.response?.data?.detail || "Invalid credentials.");
    } finally {
      setLoading(false);
    }
  };

  const inputClassName =
    "w-full rounded-2xl border border-[#d6e0e8] bg-white px-4 py-3.5 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-[#1b7f79] focus:ring-4 focus:ring-[rgba(27,127,121,0.12)]";

  return (
      <form onSubmit={handleLogin} className="space-y-3.5 lg:space-y-3">
        <div>
          <label htmlFor="email" className="mb-1.5 block text-sm font-semibold text-[#14314a]">
            Email
          </label>
          <input
            id="email"
            type="email"
            className={inputClassName}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
          />
          {fieldErrors.email && (
            <p className="mt-1 text-xs text-rose-600">{fieldErrors.email}</p>
          )}
        </div>

        <div>
          <label htmlFor="password" className="mb-1.5 block text-sm font-semibold text-[#14314a]">
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              className={inputClassName}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500"
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
          {fieldErrors.password && (
            <p className="mt-1 text-xs text-rose-600">{fieldErrors.password}</p>
          )}
        </div>

        {error && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        <div className="flex items-center justify-between rounded-2xl bg-[#eef4f8] px-4 py-2.5 text-sm text-slate-600">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              className="accent-[#1b7f79]"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
            />
            Remember me
          </label>
          <span className="text-xs uppercase tracking-[0.2em] text-slate-400">Secure sign in</span>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-full bg-[#14314a] py-3.5 text-sm font-semibold text-white shadow-[0_16px_34px_rgba(20,49,74,0.22)] transition hover:bg-[#10263a] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? <CircularProgress size={20} color="inherit" /> : "Log in"}
        </button>

        <div className="grid gap-3 rounded-[1.6rem] border border-[#d6e0e8] bg-[#f7fafc] px-4 py-3.5 sm:grid-cols-3">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-[#1b7f79]">Coach</p>
            <p className="mt-1 text-sm text-slate-600">Resume guided speaking practice instantly.</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-[#1b7f79]">Chats</p>
            <p className="mt-1 text-sm text-slate-600">Jump back into active conversations without friction.</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-[#1b7f79]">Practice</p>
            <p className="mt-1 text-sm text-slate-600">Keep streaks, progress, and focus in one place.</p>
          </div>
        </div>
      </form>
  );
};

export default LoginPage;
