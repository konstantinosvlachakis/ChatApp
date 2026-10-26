import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

const PULL_THRESHOLD = 90;
const MAX_PULL = 130;

// Routes whose content lives in their own scroll containers (the window never scrolls),
// where a downward drag is almost always meant to scroll a list, not reload the page.
const isPullDisabledPath = (pathname) => pathname.startsWith("/conversations");

const isPageAtTop = () =>
  window.scrollY <= 0 && document.documentElement.scrollTop <= 0;

// True when the touch started inside an element that is scrolled away from its top,
// so a downward drag should scroll that element instead of triggering a refresh.
const hasScrolledAncestor = (target) => {
  let node = target instanceof Element ? target : target?.parentElement;
  while (node && node !== document.body && node !== document.documentElement) {
    if (node.scrollTop > 0) return true;
    node = node.parentElement;
  }
  return false;
};

/**
 * Pull-to-refresh gesture with a self-contained indicator. The indicator is updated
 * through a ref (no React state), so dragging never re-renders the app tree.
 */
const PullToRefresh = () => {
  const { pathname } = useLocation();
  const indicatorRef = useRef(null);
  const disabledRef = useRef(isPullDisabledPath(pathname));

  useEffect(() => {
    disabledRef.current = isPullDisabledPath(pathname);
  }, [pathname]);

  useEffect(() => {
    let pullDistance = 0;
    let touchStartY = 0;
    let tracking = false;
    let refreshing = false;
    let lastLabel = "";

    const renderIndicator = (distance) => {
      const indicator = indicatorRef.current;
      if (!indicator) return;
      if (distance <= 0) {
        indicator.style.display = "none";
        return;
      }
      indicator.style.display = "block";
      indicator.style.opacity = String(Math.min(1, distance / PULL_THRESHOLD));
      const label = distance >= PULL_THRESHOLD ? "Release to refresh" : "Pull to refresh";
      if (label !== lastLabel) {
        indicator.textContent = label;
        lastLabel = label;
      }
    };

    const reset = () => {
      tracking = false;
      if (pullDistance !== 0) {
        pullDistance = 0;
        renderIndicator(0);
      }
    };

    const handleTouchStart = (event) => {
      if (refreshing || disabledRef.current) return;
      if (event.touches?.length !== 1) {
        reset();
        return;
      }
      if (!isPageAtTop() || hasScrolledAncestor(event.target)) return;
      touchStartY = event.touches[0].clientY;
      tracking = true;
    };

    const handleTouchMove = (event) => {
      if (!tracking || refreshing) return;
      const touch = event.touches?.[0];
      if (!touch || event.touches.length !== 1) {
        reset();
        return;
      }
      const delta = touch.clientY - touchStartY;
      const nextDistance = delta <= 0 ? 0 : Math.min(delta, MAX_PULL);
      if (nextDistance === pullDistance) return;
      pullDistance = nextDistance;
      renderIndicator(nextDistance);
    };

    const handleTouchEnd = () => {
      if (!tracking || refreshing) return;
      tracking = false;

      if (pullDistance >= PULL_THRESHOLD) {
        refreshing = true;
        renderIndicator(PULL_THRESHOLD);
        window.location.reload();
        return;
      }

      reset();
    };

    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: true });
    window.addEventListener("touchend", handleTouchEnd, { passive: true });
    window.addEventListener("touchcancel", reset, { passive: true });

    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
      window.removeEventListener("touchcancel", reset);
    };
  }, []);

  return (
    <div
      ref={indicatorRef}
      aria-hidden="true"
      className="fixed left-1/2 top-2 z-[9999] -translate-x-1/2 rounded-full bg-gray-800/85 px-3 py-1 text-xs text-white"
      style={{ display: "none" }}
    />
  );
};

export default PullToRefresh;
