import React from "react";
import { isAnalyticsEnabled, openCookieChoices } from "../lib/analytics";

/**
 * "Cookie choices" link-style button that reopens the consent banner. Renders nothing
 * when analytics is off. No CSS import: it is part of prerendered public pages.
 */
const CookieChoicesButton = ({ className = "" }) => {
  if (!isAnalyticsEnabled()) return null;
  return (
    <button type="button" className={className} onClick={openCookieChoices}>
      Cookie choices
    </button>
  );
};

export default CookieChoicesButton;
