import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"; // Correct imports
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import ProfilePage from "./pages/Profile/page";
import { UserProvider } from "./context/UserContext";

function App() {
  const queryClient = new QueryClient(); // Create a QueryClient instance

  return (
    <QueryClientProvider client={queryClient}>
      {" "}
      {/* Wrap with QueryClientProvider */}
      <Router>
        <UserProvider>
          <div className="App">
            <Routes>
              <Route path="/" element={<LoginPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/profile" element={<ProfilePage />} />
            </Routes>
          </div>
        </UserProvider>
      </Router>
    </QueryClientProvider>
  );
}

export default App;
