import React from "react";
import { Route, Routes } from "react-router-dom";
import Layout from "./layout/Layout";
import { LazyRoute } from "./components/ErrorBoundary";
import AuthLandingPage from "./pages/AuthLandingPage";
import AuthLayout from "./components/Auth/AuthLayout";
import RequireCompleteProfile from "./components/Auth/RequireCompleteProfile";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import {
  ComparePlansPage,
  CommunityPage,
  ConversationsPage,
  EditProfilePage,
  ExchangePairPage,
  FinishProfilePage,
  ForgotPasswordPage,
  HowItWorksPage,
  PhrasebookPage,
  PracticePage,
  PremiumPage,
  PrivacyPolicyPage,
  ProfilePage,
  PublicProfilePage,
  ResetPasswordPage,
  SettingsPage,
  TermsAndConditionsPage,
  VerifyEmailPage,
} from "./routes/routeModules";

// Lazy pages live in routes/routeModules.js: src/index.js preloads the current URL's
// chunk before the first render, so the first commit shows the page, not the fallback
// (public pages are prerendered by scripts/prerender.js with PublicAppRoutes).
const AppRoutes = () => (
  <Routes>
    <Route path="/" element={<AuthLandingPage />} />
    <Route
      path="/how-it-works"
      element={
        <LazyRoute fallback={null}>
          <HowItWorksPage />
        </LazyRoute>
      }
    />
    {/* Language-pair guides; an unknown pair renders a "not found" state (noindex). */}
    <Route
      path="/exchange/:pair"
      element={
        <LazyRoute fallback={null}>
          <ExchangePairPage />
        </LazyRoute>
      }
    />
    <Route path="/verify-email" element={<LazyRoute fallback={null}><VerifyEmailPage /></LazyRoute>} />
    {/* Signed-in accounts without languages (Google sign-in); outside Layout so its guard can't loop. */}
    <Route path="/finish-profile" element={<LazyRoute fallback={null}><FinishProfilePage /></LazyRoute>} />
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

    {/* Incomplete profiles (Google sign-in without languages) go to /finish-profile first. */}
    <Route element={<RequireCompleteProfile />}>
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
        path="/phrasebook"
        element={
          <LazyRoute fallback={<div>Loading Phrasebook...</div>}>
            <PhrasebookPage />
          </LazyRoute>
        }
      />
      <Route
        path="/phrasebook/review"
        element={
          <LazyRoute fallback={<div>Loading Phrasebook...</div>}>
            <PhrasebookPage />
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
    </Route>
  </Routes>
);

export default AppRoutes;
