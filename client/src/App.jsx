import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import MessageContainer from "./components/MessageContainer";
import LoginPage from "./pages/LoginPage";
import UserListPage from "./pages/UserListPage";

function App() {
  return (
    <Router>
      <div className="App">
        <Routes>
          <Route path="/" element={<LoginPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/messages" element={<MessageContainer />} />
          <Route path="/connected-users" element={<UserListPage />} />
          <Route path="/messages" element={<MessageContainer />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
