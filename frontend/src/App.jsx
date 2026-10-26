import React, { useEffect, useRef, useState } from "react";
import { BrowserRouter as Router } from "react-router-dom";
import AppProviders from "./AppProviders";
import AppRoutes from "./AppRoutes";
import Seo from "./components/Seo";


function App() {
  const [pullDistance, setPullDistance] = useState(0);
  const pullDistanceRef = useRef(0);
  const touchStartYRef = useRef(0);
  const trackingRef = useRef(false);
  const refreshingRef = useRef(false);
  const PULL_THRESHOLD = 90;

  useEffect(() => {
    const isAtTop = () =>
      window.scrollY <= 0 && document.documentElement.scrollTop <= 0;

    const handleTouchStart = (event) => {
      if (!isAtTop() || refreshingRef.current) return;
      const touch = event.touches?.[0];
      if (!touch) return;
      touchStartYRef.current = touch.clientY;
      trackingRef.current = true;
    };

    const handleTouchMove = (event) => {
      if (!trackingRef.current || refreshingRef.current) return;
      const touch = event.touches?.[0];
      if (!touch) return;
      const delta = touch.clientY - touchStartYRef.current;
      if (delta <= 0) {
        pullDistanceRef.current = 0;
        setPullDistance(0);
        return;
      }
      const nextDistance = Math.min(delta, 130);
      pullDistanceRef.current = nextDistance;
      setPullDistance(nextDistance);
    };

    const handleTouchEnd = () => {
      if (!trackingRef.current || refreshingRef.current) return;
      trackingRef.current = false;

      if (pullDistanceRef.current >= PULL_THRESHOLD) {
        refreshingRef.current = true;
        setPullDistance(PULL_THRESHOLD);
        window.location.reload();
        return;
      }

      pullDistanceRef.current = 0;
      setPullDistance(0);
    };

    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: true });
    window.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, []);

  return (
    <AppProviders>
      <Router>
        <Seo />
        <div className="App">
          {pullDistance > 0 && (
            <div
              className="fixed left-1/2 top-2 z-[9999] -translate-x-1/2 rounded-full bg-gray-800/85 px-3 py-1 text-xs text-white"
              style={{ opacity: Math.min(1, pullDistance / PULL_THRESHOLD) }}
            >
              {pullDistance >= PULL_THRESHOLD
                ? "Release to refresh"
                : "Pull to refresh"}
            </div>
          )}
          <AppRoutes />
        </div>
      </Router>
    </AppProviders>
  );
}

export default App;
