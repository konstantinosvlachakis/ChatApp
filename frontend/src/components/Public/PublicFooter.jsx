import React from "react";
import { Link } from "react-router-dom";
import CoachAvatar from "../CoachAvatar";
import CookieChoicesButton from "../CookieChoicesButton";
import { EXCHANGE_PAIRS } from "../../pages/Exchange/pairs";

/** Footer for the public pages: exchanges (internal links for the pair pages), account, legal. */
const PublicFooter = () => (
  <footer className="lp-footer lp-on-navy">
    <div className="lp-container">
      <div className="lp-footer-grid">
        <div className="lp-footer-about">
          <Link to="/" className="lp-brand">
            <CoachAvatar size={32} hideBadge />
            <span>LangVoyage</span>
          </Link>
          <p>Language exchange with people who speak the language you're learning and want to learn yours.</p>
        </div>
        <nav className="lp-footer-col" aria-labelledby="lp-footer-exchanges">
          <h2 id="lp-footer-exchanges">Exchanges</h2>
          <Link to="/how-it-works">How it works</Link>
          {EXCHANGE_PAIRS.map((pair) => (
            <Link key={pair.slug} to={pair.path}>
              {pair.label} exchange
            </Link>
          ))}
        </nav>
        <nav className="lp-footer-col" aria-labelledby="lp-footer-account">
          <h2 id="lp-footer-account">Account</h2>
          <Link to="/register">Sign up</Link>
          <Link to="/login">Log in</Link>
        </nav>
        <nav className="lp-footer-col" aria-labelledby="lp-footer-legal">
          <h2 id="lp-footer-legal">Legal</h2>
          <Link to="/terms-and-conditions">Terms and conditions</Link>
          <Link to="/privacy-policy">Privacy policy</Link>
          <CookieChoicesButton className="lp-footer-linkbtn" />
        </nav>
      </div>
      <p className="lp-footer-copy">© {new Date().getFullYear()} LangVoyage</p>
    </div>
  </footer>
);

export default PublicFooter;
