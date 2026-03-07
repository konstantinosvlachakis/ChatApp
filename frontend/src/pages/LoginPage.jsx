import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import CircularProgress from "@mui/material/CircularProgress";
import axios from "axios";
import { BASE_URL } from "../constants/constants";
import { motion } from "framer-motion";
import { useUser } from "../context/UserContext";

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
      const response = await axios.post(BASE_URL + "/api/token/", {
        email: email.trim().toLowerCase(),
        password,
      });

      const { access, refresh } = response.data;
      if (rememberMe) {
        localStorage.setItem("accessToken", access);
        localStorage.setItem("refreshToken", refresh);
        sessionStorage.setItem("accessToken", access);
        sessionStorage.setItem("refreshToken", refresh);
      } else {
        localStorage.removeItem("accessToken");
        localStorage.removeItem("refreshToken");
        sessionStorage.setItem("accessToken", access);
        sessionStorage.setItem("refreshToken", refresh);
      }

      await refreshUserProfile();

      navigate("/profile");
    } catch (error) {
      setError(error.response?.data?.detail || "Invalid credentials.");
    } finally {
      setLoading(false);
    }
  };

  const handleSignUpClick = () => {
    navigate("/register");
  };

  const inputClassName =
    "w-full rounded-xl border bg-white/90 px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-200";

  return (
    <div className="relative min-h-[100dvh] overflow-x-hidden bg-slate-100">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(6,182,212,0.18),transparent_38%),radial-gradient(circle_at_80%_15%,rgba(245,158,11,0.22),transparent_32%),radial-gradient(circle_at_70%_85%,rgba(14,165,233,0.2),transparent_35%)]" />
      <div className="relative z-10 flex min-h-[100dvh] items-center justify-center px-3 py-8 sm:px-4 sm:py-12">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="w-full max-w-lg rounded-3xl border border-white/60 bg-white/75 p-5 shadow-2xl backdrop-blur-md sm:p-8"
        >
          <div className="mb-6 flex flex-col items-start">
            <motion.img
              src="/logo192.png"
              alt="LangVoyage Logo"
              className="mb-3 h-12 w-12"
              initial={{ rotate: 0 }}
              animate={{ rotate: [0, 4, -4, 0] }}
              transition={{ repeat: Infinity, repeatDelay: 6, duration: 1.8 }}
            />
            <p className="text-xs uppercase tracking-[0.2em] text-cyan-700">LangVoyage</p>
            <h1 className="mt-2 text-2xl font-bold text-slate-900 sm:text-3xl">Welcome back</h1>
            <p className="mt-1 text-sm text-slate-600">
              Log in to continue your conversations and language practice.
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-700">
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
              <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700">
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
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-500"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
              {fieldErrors.password && (
                <p className="mt-1 text-xs text-rose-600">{fieldErrors.password}</p>
              )}
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
              >
                {error}
              </motion.div>
            )}

            <div className="flex items-center justify-between text-sm text-slate-600">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="accent-cyan-600"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                Remember me
              </label>
            </div>

            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-slate-900 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? <CircularProgress size={20} color="inherit" /> : "Log in"}
            </motion.button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-600">
            Don&apos;t have an account?{" "}
            <button
              type="button"
              className="font-semibold text-cyan-700 hover:text-cyan-800"
              onClick={handleSignUpClick}
            >
              Sign up
            </button>
          </p>
          <p className="mt-3 text-center text-xs text-slate-500">
            By continuing, you agree to our{" "}
            <Link to="/terms-and-conditions" className="font-medium text-cyan-700 hover:text-cyan-800">
              Terms and Conditions
            </Link>{" "}
            and{" "}
            <Link to="/privacy-policy" className="font-medium text-cyan-700 hover:text-cyan-800">
              Privacy Policy
            </Link>
            .
          </p>
        </motion.div>
      </div>
    </div>
  );
};

export default LoginPage;
