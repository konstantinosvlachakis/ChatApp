import React from "react";
import { BrowserRouter as Router } from "react-router-dom";
import AppProviders from "./AppProviders";
import AppRoutes from "./AppRoutes";
import Seo from "./components/Seo";
import PullToRefresh from "./components/PullToRefresh";
import ConnectivityBanner from "./components/ConnectivityBanner";
import { ToastViewport } from "./components/Toast";


function App() {
  return (
    <AppProviders>
      <Router>
        <Seo />
        <PullToRefresh />
        <ConnectivityBanner />
        <div className="App">
          <AppRoutes />
        </div>
        <ToastViewport />
      </Router>
    </AppProviders>
  );
}

export default App;
