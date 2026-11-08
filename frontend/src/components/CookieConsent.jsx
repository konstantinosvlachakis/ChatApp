import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  CONSENT_CHANGE_EVENT,
  COOKIE_CHOICES_EVENT,
  denyAnalyticsConsent,
  getAnalyticsConsent,
  grantAnalyticsConsent,
  isAnalyticsEnabled,
} from "../lib/analytics";
import "./cookieConsent.css";

/**
 * Analytics cookie banner: a non-modal card at the bottom, shown (client-side only) when
 * REACT_APP_GA_MEASUREMENT_ID is set and no choice is stored, or when "Cookie choices"
 * reopens it (`openCookieChoices()`). Accept and Decline look the same on purpose.
 */
const CookieConsent = () => {
  const [open, setOpen] = useState(false);
  const [reopened, setReopened] = useState(false);
  const headingRef = useRef(null);
  const returnFocusRef = useRef(null);

  useEffect(() => {
    if (!isAnalyticsEnabled()) return undefined;
    if (getAnalyticsConsent() === null) setOpen(true);
    const onOpen = () => {
      returnFocusRef.current = document.activeElement;
      setReopened(true);
      setOpen(true);
    };
    // A choice made elsewhere (Settings switch) answers the banner too.
    const onChoice = () => setOpen(false);
    window.addEventListener(COOKIE_CHOICES_EVENT, onOpen);
    window.addEventListener(CONSENT_CHANGE_EVENT, onChoice);
    return () => {
      window.removeEventListener(COOKIE_CHOICES_EVENT, onOpen);
      window.removeEventListener(CONSENT_CHANGE_EVENT, onChoice);
    };
  }, []);

  // Reopened from a link: move focus into the card so keyboard users land on it.
  useEffect(() => {
    if (open && reopened) headingRef.current?.focus();
  }, [open, reopened]);

  const close = useCallback(() => {
    setOpen(false);
    if (reopened) {
      const target = returnFocusRef.current;
      if (target && typeof target.focus === "function" && document.contains(target)) target.focus();
    }
    setReopened(false);
  }, [reopened]);

  useEffect(() => {
    if (!open || !reopened) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [close, open, reopened]);

  if (!open) return null;

  const accept = () => {
    grantAnalyticsConsent();
    close();
  };
  const decline = () => {
    denyAnalyticsConsent();
    close();
  };
  const current = getAnalyticsConsent();

  return (
    <div
      className="lv-cookie"
      role="dialog"
      aria-modal="false"
      aria-live="polite"
      aria-labelledby="lv-cookie-title"
      aria-describedby="lv-cookie-text"
    >
      <h2 id="lv-cookie-title" className="lv-cookie-title" ref={headingRef} tabIndex={-1}>
        Analytics cookies
      </h2>
      <p id="lv-cookie-text" className="lv-cookie-text">
        We use analytics cookies to understand how LangVoyage is used. No ads, no message content.{" "}
        <Link to="/privacy-policy">Privacy policy</Link>
      </p>
      {current && (
        <p className="lv-cookie-current">Current choice: {current === "granted" ? "accepted" : "declined"}.</p>
      )}
      <div className="lv-cookie-actions">
        <button type="button" className="lv-cookie-btn" onClick={decline}>
          Decline
        </button>
        <button type="button" className="lv-cookie-btn" onClick={accept}>
          Accept
        </button>
      </div>
    </div>
  );
};

export default CookieConsent;
