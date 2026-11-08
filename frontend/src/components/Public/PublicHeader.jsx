import React from "react";
import { Link, useLocation } from "react-router-dom";
import CoachAvatar from "../CoachAvatar";
import CtaLink from "./CtaLink";

/** Navy brand header for /how-it-works and the /exchange/<pair> pages. */
const PublicHeader = ({ page, pair }) => {
  const { pathname } = useLocation();
  const onHowItWorks = pathname.replace(/\/+$/, "") === "/how-it-works";

  return (
    <header className="lp-header lp-on-navy">
      <div className="lp-container lp-header-inner">
        <Link to="/" className="lp-brand">
          <CoachAvatar size={36} hideBadge />
          <span>LangVoyage</span>
        </Link>
        <nav aria-label="Main" className="lp-header-nav">
          <Link
            to="/how-it-works"
            className="lp-header-link lp-hide-xs"
            aria-current={onHowItWorks ? "page" : undefined}
          >
            How it works
          </Link>
          <Link to="/login" className="lp-header-link">
            Log in
          </Link>
          <CtaLink to="/register" page={page} pair={pair} className="lp-btn lp-btn-light lp-btn-sm">
            Sign up
          </CtaLink>
        </nav>
      </div>
    </header>
  );
};

export default PublicHeader;
