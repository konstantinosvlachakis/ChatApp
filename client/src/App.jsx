import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import MessageContainer from "./components/MessageContainer";
import LoginPage from "./pages/LoginPage"; // Adjust path as per your actual file location

function App() {
  return (
    <Router>
      <div className="App">
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/messages" element={<MessageContainer />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
