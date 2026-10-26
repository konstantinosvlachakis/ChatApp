import React, { Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import Layout from "./layout/Layout";
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

const AppRoutes = () => (
  <Routes>
    <Route path="/" element={<AuthLandingPage />} />
    <Route
      path="/privacy-policy"
      element={
        <Suspense fallback={null}>
          <PrivacyPolicyPage />
        </Suspense>
      }
    />
    <Route
      path="/terms-and-conditions"
      element={
        <Suspense fallback={null}>
          <TermsAndConditionsPage />
        </Suspense>
      }
    />

    <Route element={<AuthLayout />}>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
    </Route>

    <Route element={<Layout />}>
      <Route
        path="/profile"
        element={
          <Suspense fallback={<div>Loading Profile...</div>}>
            <ProfilePage />
          </Suspense>
        }
      />
      <Route
        path="/profile/edit"
        element={
          <Suspense fallback={<div>Loading Profile Editor...</div>}>
            <EditProfilePage />
          </Suspense>
        }
      />
      <Route
        path="/settings"
        element={
          <Suspense fallback={<div>Loading Settings...</div>}>
            <SettingsPage />
          </Suspense>
        }
      />
      <Route
        path="/community"
        element={
          <Suspense fallback={<div>Loading Community...</div>}>
            <CommunityPage />
          </Suspense>
        }
      />
      <Route
        path="/people/:username"
        element={
          <Suspense fallback={<div>Loading Profile...</div>}>
            <PublicProfilePage />
          </Suspense>
        }
      />
      <Route
        path="/conversations"
        element={
          <Suspense fallback={<div>Loading Conversations...</div>}>
            <ConversationsPage />
          </Suspense>
        }
      />
      <Route
        path="/conversations/:id"
        element={
          <Suspense fallback={<div>Loading Conversations...</div>}>
            <ConversationsPage />
          </Suspense>
        }
      />
      <Route
        path="/practice"
        element={
          <Suspense fallback={<div>Loading Practice...</div>}>
            <PracticePage />
          </Suspense>
        }
      />
      <Route
        path="/premium"
        element={
          <Suspense fallback={<div>Loading Premium...</div>}>
            <PremiumPage />
          </Suspense>
        }
      />
      <Route
        path="/premium/compare"
        element={
          <Suspense fallback={<div>Loading Compare Plans...</div>}>
            <ComparePlansPage />
          </Suspense>
        }
      />
    </Route>
  </Routes>
);

export default AppRoutes;
