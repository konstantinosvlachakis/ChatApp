import React, { Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import Layout from "./layout/Layout";
import AuthLandingPage from "./pages/AuthLandingPage";
import AuthLayout from "./components/Auth/AuthLayout";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import PrivacyPolicyPage from "./pages/PrivacyPolicyPage";
import TermsAndConditionsPage from "./pages/TermsAndConditionsPage";
import ConversationsPage from "./pages/Conversations/page";

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
    <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
    <Route path="/terms-and-conditions" element={<TermsAndConditionsPage />} />

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
