import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import MessageContainer from "./components/MessageContainer";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import ProfilePage from "./pages/Profile/page";
import MainLayout from "./components/Layout/MainLayout";
import { QueryClient, QueryClientProvider } from "react-query"; // Import QueryClient and QueryClientProvider

function App() {
  const queryClient = new QueryClient(); // Create a QueryClient instance

  return (
    <QueryClientProvider client={queryClient}>
      {" "}
      {/* Wrap with QueryClientProvider */}
      <Router>
        <div className="App">
          <Routes>
            <Route path="/" element={<LoginPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/messages" element={<MainLayout />} />{" "}
            {/* Main chat layout */}
            <Route path="/connected-users" element={<MessageContainer />} />
          </Routes>
        </div>
      </Router>
    </QueryClientProvider>
  );
}

export default App;
