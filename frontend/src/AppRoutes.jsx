import React from "react";
import { Route, Routes } from "react-router-dom";
import Layout from "./layout/Layout";
import { LazyRoute } from "./components/ErrorBoundary";
import AuthLandingPage from "./pages/AuthLandingPage";
import AuthLayout from "./components/Auth/AuthLayout";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";

// Public legal pages are prerendered (scripts/prerender.js renders PublicAppRoutes, which
// imports them eagerly), so lazy-loading them here only affects the client bundle.
const loadPrivacyPolicyPage = () => import("./pages/PrivacyPolicyPage");
const loadTermsAndConditionsPage = () => import("./pages/TermsAndConditionsPage");
const loadConversationsPage = () => import("./pages/Conversations/page");

// Start fetching the current route's chunk while the app is still booting (CSRF init runs
// before the first render), so a direct visit doesn't wait on it after first paint.
if (typeof window !== "undefined") {
  const { pathname } = window.location;
  if (pathname === "/privacy-policy") loadPrivacyPolicyPage();
  else if (pathname === "/terms-and-conditions") loadTermsAndConditionsPage();
  else if (pathname.startsWith("/conversations")) loadConversationsPage();
}

const PrivacyPolicyPage = React.lazy(loadPrivacyPolicyPage);
const TermsAndConditionsPage = React.lazy(loadTermsAndConditionsPage);
const ConversationsPage = React.lazy(loadConversationsPage);
const ProfilePage = React.lazy(() => import("./pages/Profile/page"));
const EditProfilePage = React.lazy(() => import("./pages/Profile/EditProfilePage"));
const CommunityPage = React.lazy(() => import("./pages/Community/page"));
const SettingsPage = React.lazy(() => import("./pages/Settings/page"));
const PublicProfilePage = React.lazy(() => import("./pages/PublicProfile/page"));
const PracticePage = React.lazy(() => import("./pages/PracticePage"));
const PremiumPage = React.lazy(() => import("./pages/PremiumPage"));
const ComparePlansPage = React.lazy(() => import("./pages/ComparePlansPage"));
const ForgotPasswordPage = React.lazy(() => import("./pages/ForgotPasswordPage"));
const ResetPasswordPage = React.lazy(() => import("./pages/ResetPasswordPage"));

const AppRoutes = () => (
  <Routes>
    <Route path="/" element={<AuthLandingPage />} />
    <Route
      path="/privacy-policy"
      element={
        <LazyRoute fallback={null}>
          <PrivacyPolicyPage />
        </LazyRoute>
      }
    />
    <Route
      path="/terms-and-conditions"
      element={
        <LazyRoute fallback={null}>
          <TermsAndConditionsPage />
        </LazyRoute>
      }
    />

    <Route element={<AuthLayout />}>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route
        path="/forgot-password"
        element={
          <LazyRoute fallback={null}>
            <ForgotPasswordPage />
          </LazyRoute>
        }
      />
      <Route
        path="/reset-password/:uid/:token"
        element={
          <LazyRoute fallback={null}>
            <ResetPasswordPage />
          </LazyRoute>
        }
      />
    </Route>

    <Route element={<Layout />}>
      <Route
        path="/profile"
        element={
          <LazyRoute fallback={<div>Loading Profile...</div>}>
            <ProfilePage />
          </LazyRoute>
        }
      />
      <Route
        path="/profile/edit"
        element={
          <LazyRoute fallback={<div>Loading Profile Editor...</div>}>
            <EditProfilePage />
          </LazyRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <LazyRoute fallback={<div>Loading Settings...</div>}>
            <SettingsPage />
          </LazyRoute>
        }
      />
      <Route
        path="/community"
        element={
          <LazyRoute fallback={<div>Loading Community...</div>}>
            <CommunityPage />
          </LazyRoute>
        }
      />
      <Route
        path="/people/:username"
        element={
          <LazyRoute fallback={<div>Loading Profile...</div>}>
            <PublicProfilePage />
          </LazyRoute>
        }
      />
      <Route
        path="/conversations"
        element={
          <LazyRoute fallback={<div>Loading Conversations...</div>}>
            <ConversationsPage />
          </LazyRoute>
        }
      />
      <Route
        path="/conversations/:id"
        element={
          <LazyRoute fallback={<div>Loading Conversations...</div>}>
            <ConversationsPage />
          </LazyRoute>
        }
      />
      <Route
        path="/practice"
        element={
          <LazyRoute fallback={<div>Loading Practice...</div>}>
            <PracticePage />
          </LazyRoute>
        }
      />
      <Route
        path="/premium"
        element={
          <LazyRoute fallback={<div>Loading Premium...</div>}>
            <PremiumPage />
          </LazyRoute>
        }
      />
      <Route
        path="/premium/compare"
        element={
          <LazyRoute fallback={<div>Loading Compare Plans...</div>}>
            <ComparePlansPage />
          </LazyRoute>
        }
      />
    </Route>
  </Routes>
);

export default AppRoutes;
