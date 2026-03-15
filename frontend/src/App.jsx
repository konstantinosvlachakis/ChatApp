import React, { Suspense, useEffect, useRef, useState } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { UserProvider } from "./context/UserContext"; 
import Layout from "./layout/Layout";
import AuthLandingPage from "./pages/AuthLandingPage";
import AuthLayout from "./components/Auth/AuthLayout";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import PrivacyPolicyPage from "./pages/PrivacyPolicyPage";
import TermsAndConditionsPage from "./pages/TermsAndConditionsPage";
import ConversationsPage from "./pages/Conversations/page";
import { queryClient } from '../src/libs/react-query'
import { QueryClientProvider } from 'react-query';



const ProfilePage = React.lazy(() => import("./pages/Profile/page"));
const EditProfilePage = React.lazy(() => import("./pages/Profile/EditProfilePage"));
const CommunityPage = React.lazy(() => import("./pages/Community/page"));
const SettingsPage = React.lazy(() => import("./pages/Settings/page"));
const PublicProfilePage = React.lazy(() => import("./pages/PublicProfile/page"));
const PracticePage = React.lazy(() => import("./pages/PracticePage"));
const PremiumPage = React.lazy(() => import("./pages/PremiumPage"));
const ComparePlansPage = React.lazy(() => import("./pages/ComparePlansPage"));


function App() {
  const [pullDistance, setPullDistance] = useState(0);
  const pullDistanceRef = useRef(0);
  const touchStartYRef = useRef(0);
  const trackingRef = useRef(false);
  const refreshingRef = useRef(false);
  const PULL_THRESHOLD = 90;

  useEffect(() => {
    const isAtTop = () =>
      window.scrollY <= 0 && document.documentElement.scrollTop <= 0;

    const handleTouchStart = (event) => {
      if (!isAtTop() || refreshingRef.current) return;
      const touch = event.touches?.[0];
      if (!touch) return;
      touchStartYRef.current = touch.clientY;
      trackingRef.current = true;
    };

    const handleTouchMove = (event) => {
      if (!trackingRef.current || refreshingRef.current) return;
      const touch = event.touches?.[0];
      if (!touch) return;
      const delta = touch.clientY - touchStartYRef.current;
      if (delta <= 0) {
        pullDistanceRef.current = 0;
        setPullDistance(0);
        return;
      }
      const nextDistance = Math.min(delta, 130);
      pullDistanceRef.current = nextDistance;
      setPullDistance(nextDistance);
    };

    const handleTouchEnd = () => {
      if (!trackingRef.current || refreshingRef.current) return;
      trackingRef.current = false;

      if (pullDistanceRef.current >= PULL_THRESHOLD) {
        refreshingRef.current = true;
        setPullDistance(PULL_THRESHOLD);
        window.location.reload();
        return;
      }

      pullDistanceRef.current = 0;
      setPullDistance(0);
    };

    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: true });
    window.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <UserProvider>
        {" "}
        {/* Ensure UserProvider wraps everything */}
        <Router>
          <div className="App">
            {pullDistance > 0 && (
              <div
                className="fixed left-1/2 top-2 z-[9999] -translate-x-1/2 rounded-full bg-gray-800/85 px-3 py-1 text-xs text-white"
                style={{ opacity: Math.min(1, pullDistance / PULL_THRESHOLD) }}
              >
                {pullDistance >= PULL_THRESHOLD
                  ? "Release to refresh"
                  : "Pull to refresh"}
              </div>
            )}
            <Routes>
              {/* Public Routes */}
              <Route path="/" element={<AuthLandingPage />} />
              <Route element={<AuthLayout />}>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />
              </Route>

              {/* Protected Routes Wrapped in Layout */}
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
                <Route
                  path="/privacy-policy"
                  element={<PrivacyPolicyPage />}
                />
                <Route
                  path="/terms-and-conditions"
                  element={<TermsAndConditionsPage />}
                />
                
              </Route>
            </Routes>
          </div>
        </Router>
      </UserProvider>
    </QueryClientProvider>
  );
}

export default App;
