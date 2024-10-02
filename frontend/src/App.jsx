import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import MessageContainer from "./components/MessageContainer";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
// import SendMessage from "./features/SendMessage";
import ProfilePage from "./pages/Profile";

function App() {
  return (
    <Router>
      <div className="App">
        <Routes>
          <Route path="/" element={<LoginPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          {/* <Route path="/messages" element={<SendMessage />} /> */}
          <Route path="/connected-users" element={<MessageContainer />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
