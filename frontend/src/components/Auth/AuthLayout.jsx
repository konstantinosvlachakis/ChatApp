import React from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import AuthShell from "./AuthShell";

const contentByPath = {
  "/login": {
    eyebrow: "Welcome Back",
    title: "Log in and pick up exactly where you left off.",
    description:
      "Your conversations, coach sessions, and daily practice are all waiting. This sign-in flow now mirrors the mobile brand instead of feeling like a generic form.",
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
    title: "Join LangVoyage in a page that feels calm and clear.",
    description:
      "Create your profile, choose your native language, and get into the app without the form taking over the whole screen.",
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
};

const AuthLayout = () => {
  const location = useLocation();
  const content = contentByPath[location.pathname] || contentByPath["/login"];

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
