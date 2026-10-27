import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import CoachAvatar from "../components/CoachAvatar";
import { handleAvatarError } from "../constants/avatar";

export default function DiscoveryHeader({ user, avatarUrl, unreadCount, onLogout }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef(null);

  useEffect(() => {
    const closeOutside = (event) => {
      if (!accountRef.current?.contains(event.target)) setAccountOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") {
        setAccountOpen(false);
        setMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  return (
    <header className="discovery-header">
      <div className="discovery-header-inner">
        <Link to="/profile" className="discovery-brand" aria-label="LangVoyage — go to profile">
          <CoachAvatar size={36} hideBadge />
          <span>LangVoyage</span>
        </Link>
        <button
          type="button"
          className="discovery-menu-toggle"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-expanded={menuOpen}
          aria-controls="discovery-nav"
          aria-label={menuOpen ? "Close navigation" : "Open navigation"}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            {menuOpen ? <path d="m6 6 12 12M6 18 18 6" /> : <path d="M4 6h16M4 12h16M4 18h16" />}
          </svg>
        </button>
        <nav id="discovery-nav" className={`discovery-nav ${menuOpen ? "is-open" : ""}`} aria-label="Main navigation">
          <Link to="/community" className="is-active" aria-current="page">People</Link>
          <Link to="/conversations">Conversations {unreadCount > 0 && <span className="discovery-unread" aria-label={`${unreadCount} unread conversations`}>{unreadCount}</span>}</Link>
          <Link to="/practice">Practice</Link>
          <Link to="/premium">Premium</Link>
          <Link to="/profile" className="discovery-mobile-account">My profile</Link>
          <Link to="/settings" className="discovery-mobile-account">Settings</Link>
          <button type="button" className="discovery-mobile-account" onClick={onLogout}>Log out</button>
        </nav>
        <div className="discovery-account" ref={accountRef}>
          <button type="button" className="discovery-account-button" aria-expanded={accountOpen} aria-controls="discovery-account-links" onClick={() => setAccountOpen(!accountOpen)} aria-label="Account options">
            <img src={avatarUrl} alt="" onError={handleAvatarError} />
            <span>{user?.username || "Account"}</span>
            <span aria-hidden="true">⌄</span>
          </button>
          {accountOpen && (
            <div id="discovery-account-links" className="discovery-account-links">
              <Link to="/profile">My profile</Link>
              <Link to="/settings">Settings</Link>
              <button type="button" onClick={onLogout}>Log out</button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
