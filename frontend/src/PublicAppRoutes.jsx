import React from "react";
import { Route, Routes } from "react-router-dom";
import AuthLandingPage from "./pages/AuthLandingPage";
import AuthLayout from "./components/Auth/AuthLayout";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import PrivacyPolicyPage from "./pages/PrivacyPolicyPage";
import TermsAndConditionsPage from "./pages/TermsAndConditionsPage";

// Rendered at build time by scripts/prerender.js for routes/prerenderedRoutes.js.
const PublicAppRoutes = () => (
  <Routes>
    <Route path="/" element={<AuthLandingPage />} />
    <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
    <Route path="/terms-and-conditions" element={<TermsAndConditionsPage />} />
    <Route element={<AuthLayout />}>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
    </Route>
  </Routes>
);

export default PublicAppRoutes;
