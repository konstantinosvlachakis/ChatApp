import React, { Suspense } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { UserProvider } from "./context/UserContext"; 
import Layout from "./layout/Layout";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import ConversationsPage from "./pages/Conversations/page";
import ChatRoomWrapper from "./pages/Conversations/features/ChatRoomWrapper";
import { queryClient } from '../src/libs/react-query'
import { QueryClientProvider } from 'react-query';



const ProfilePage = React.lazy(() => import("./pages/Profile/page"));
const CommunityPage = React.lazy(() => import("./pages/Community/page"));


function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <UserProvider>
        {" "}
        {/* Ensure UserProvider wraps everything */}
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
                  element={<ChatRoomWrapper />}
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
