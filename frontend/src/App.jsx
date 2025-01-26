import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"; // Correct imports
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import ProfilePage from "./pages/Profile/page"; // Fixed import for ProfilePage
import { UserProvider } from "./context/UserContext";
import Layout from "./layout/Layout"; // Import the Layout component

function App() {
  const queryClient = new QueryClient(); // Create a QueryClient instance

  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <UserProvider>
          <div className="App">
            <Routes>
              {/* Public Routes */}
              <Route path="/" element={<LoginPage />} /> {/* Default Login */}
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              {/* Protected Routes Wrapped in Layout */}
              <Route element={<Layout />}>
                <Route path="/profile" element={<ProfilePage />} />
                {/* Add more authenticated routes here */}
              </Route>
            </Routes>
          </div>
        </UserProvider>
      </Router>
    </QueryClientProvider>
  );
}

export default App;
