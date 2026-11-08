import React from "react";
import { BrowserRouter as Router } from "react-router-dom";
import AppProviders from "./AppProviders";
import AppRoutes from "./AppRoutes";
import Seo from "./components/Seo";
import PullToRefresh from "./components/PullToRefresh";
import ConnectivityBanner from "./components/ConnectivityBanner";
import { ToastViewport } from "./components/Toast";
import AnalyticsRouteTracker from "./components/AnalyticsRouteTracker";
import CookieConsent from "./components/CookieConsent";


function App() {
  return (
    <AppProviders>
      <Router>
        <Seo />
        <AnalyticsRouteTracker />
        <PullToRefresh />
        <ConnectivityBanner />
        <div className="App">
          <AppRoutes />
        </div>
        <CookieConsent />
        <ToastViewport />
      </Router>
    </AppProviders>
  );
}

export default App;
