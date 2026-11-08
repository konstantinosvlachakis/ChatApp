import React from "react";
import { Link } from "react-router-dom";
import { trackEvent } from "../../lib/analytics";

/**
 * Sign-up / call-to-action link on the public landing pages. Fires the allowlisted
 * `landing_cta_clicked` event ({page, pair?}; a no-op without analytics consent).
 */
const CtaLink = ({ page, pair, onClick, ...linkProps }) => (
  <Link
    {...linkProps}
    onClick={(event) => {
      trackEvent("landing_cta_clicked", pair ? { page, pair } : { page });
      if (onClick) onClick(event);
    }}
  />
);

export default CtaLink;
