import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { initAnalytics, trackPageView } from "../lib/analytics";

/**
 * Sends a sanitised page_view on every route change (inside the router). Identical
 * consecutive paths (query/hash-only changes, re-renders) are sent once. No-op unless
 * REACT_APP_GA_MEASUREMENT_ID is set and the visitor accepted analytics cookies.
 */
const AnalyticsRouteTracker = () => {
  const { pathname } = useLocation();
  const lastPathRef = useRef(null);

  useEffect(() => {
    initAnalytics();
  }, []);

  useEffect(() => {
    if (lastPathRef.current === pathname) return;
    lastPathRef.current = pathname;
    trackPageView(pathname);
  }, [pathname]);

  return null;
};

export default AnalyticsRouteTracker;
