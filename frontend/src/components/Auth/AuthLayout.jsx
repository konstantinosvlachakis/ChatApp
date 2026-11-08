import React from "react";
import { Link, Navigate, Outlet, useLocation } from "react-router-dom";
import AuthShell from "./AuthShell";
import { useUser } from "../../context/UserContext";

const backToLoginFooter = (
  <p className="text-center text-sm text-slate-600">
    Remembered your password?{" "}
    <Link to="/login" className="font-semibold text-[#1b7f79] hover:text-[#14314a]">
      Log in
    </Link>
  </p>
);

const contentByPath = {
  "/login": {
    eyebrow: "Welcome Back",
    title: "Pick up where you left off.",
    description: "Your conversations, practice with Lumi and language partners are waiting.",
    footer: (
      <>
        <p className="text-center text-sm text-slate-600">
          Don&apos;t have an account?{" "}
          <Link to="/register" className="font-semibold text-[#1b7f79] hover:text-[#14314a]">
            Sign up
          </Link>
        </p>
        <p className="mt-3 text-center text-xs leading-6 text-slate-500">
          By continuing, you agree to our{" "}
          <Link to="/terms-and-conditions" className="font-medium text-[#1b7f79] hover:text-[#14314a]">
            Terms and Conditions
          </Link>{" "}
          and{" "}
          <Link to="/privacy-policy" className="font-medium text-[#1b7f79] hover:text-[#14314a]">
            Privacy Policy
          </Link>
          .
        </p>
      </>
    ),
  },
  "/register": {
    eyebrow: "Create Account",
    title: "Start your language exchange.",
    description:
      "Tell us what you speak and the language you want to learn. We'll introduce you to people who fit.",
    footer: (
      <>
        <p className="text-center text-sm text-slate-600">
          Already have an account?{" "}
          <Link to="/login" className="font-semibold text-[#1b7f79] hover:text-[#14314a]">
            Log in
          </Link>
        </p>
        <p className="mt-3 text-center text-xs leading-6 text-slate-500">
          By creating an account, you agree to our{" "}
          <Link to="/terms-and-conditions" className="font-medium text-[#1b7f79] hover:text-[#14314a]">
            Terms and Conditions
          </Link>{" "}
          and{" "}
          <Link to="/privacy-policy" className="font-medium text-[#1b7f79] hover:text-[#14314a]">
            Privacy Policy
          </Link>
          .
        </p>
      </>
    ),
  },
  "/forgot-password": {
    eyebrow: "Forgot Password",
    title: "Let's get you back into your conversations.",
    description: "We'll email you a secure link to choose a new password.",
    footer: backToLoginFooter,
  },
};

const resetPasswordContent = {
  eyebrow: "New Password",
  title: "Choose a new password.",
  description: "Pick a password you don't use anywhere else, then log in with it.",
  footer: backToLoginFooter,
};

const RESET_PASSWORD_PREFIX = "/reset-password/";

const AuthLayout = () => {
  const location = useLocation();
  const { user } = useUser();
  const isResetLink = location.pathname.startsWith(RESET_PASSWORD_PREFIX);
  // "/register/" (prerendered page, trailing slash) must not fall back to the login copy.
  const path = location.pathname.replace(/\/+$/, "") || "/";
  const content = isResetLink ? resetPasswordContent : contentByPath[path] || contentByPath["/login"];

  // Signed-in users have no reason to see login/register; send them into the app.
  // A remembered user (UserContext's cached profile) goes straight away instead of
  // seeing the form while the session check runs; if that check fails, UserContext
  // clears the cache and returns to /login once. An emailed reset link still works
  // while signed in (e.g. a shared computer).
  if (user && !isResetLink) {
    return <Navigate to="/profile" replace />;
  }

  return (
    <AuthShell
      eyebrow={content.eyebrow}
      title={content.title}
      description={content.description}
      footer={content.footer}
    >
      <Outlet />
    </AuthShell>
  );
};

export default AuthLayout;
