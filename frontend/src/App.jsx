import React, { useEffect, Suspense } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { UserProvider } from "./context/UserContext"; // ✅ Ensure it's correctly imported
import Layout from "./layout/Layout";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import { storage } from "./utils/storage"; // Helper for storing tokens securely
import axios from "./utils/axios"; // Make sure axios is configured with base URL and credentials

// ✅ Lazy-load heavy pages for performance
const ProfilePage = React.lazy(() => import("./pages/Profile/page"));
const CommunityPage = React.lazy(() => import("./pages/Community/page"));

const queryClient = new QueryClient();

function App() {
  useEffect(() => {
    // Fetch and store the CSRF token
    const fetchCSRFToken = async () => {
      try {
        const response = await axios.get("/api/csrf/", {
          withCredentials: true,
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
        });
        if (response.status === 200) {
          storage.setCSRFToken(response.data.csrfToken); // Store token securely
          console.log("CSRF token fetched and stored");
        }
      } catch (error) {
        console.error("Failed to fetch CSRF token:", error);
      }
    };

    fetchCSRFToken();
  }, []); // Runs once on mount

  return (
    <QueryClientProvider client={queryClient}>
      <UserProvider>
        {" "}
        {/* ✅ Ensure UserProvider wraps everything */}
        <Router>
          <div className="App">
            <Routes>
              {/* Public Routes */}
              <Route path="/" element={<LoginPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />

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
                  path="/community"
                  element={
                    <Suspense fallback={<div>Loading Community...</div>}>
                      <CommunityPage />
                    </Suspense>
                  }
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
