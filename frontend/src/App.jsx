import React from "react";
import { BrowserRouter as Router } from "react-router-dom";
import AppProviders from "./AppProviders";
import AppRoutes from "./AppRoutes";
import Seo from "./components/Seo";
import PullToRefresh from "./components/PullToRefresh";


function App() {
  return (
    <AppProviders>
      <Router>
        <Seo />
        <PullToRefresh />
        <div className="App">
          <AppRoutes />
        </div>
      </Router>
    </AppProviders>
  );
}

export default App;
