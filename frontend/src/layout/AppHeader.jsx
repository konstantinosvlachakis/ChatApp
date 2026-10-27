import React, { useEffect, useId, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import CoachAvatar from "../components/CoachAvatar";
import { handleAvatarError, handleAvatarLoad } from "../constants/avatar";
import { avatarImage } from "../lib/media";
import { HEADER_NAV_ITEMS, isNavItemActive, unreadLabel } from "./navItems";
import NavIcon from "./NavIcon";

/**
 * App-wide navy header. Desktop: logo, main nav pills, account menu.
 * Phones (<768px): logo + avatar only; main navigation moves to the bottom tab bar.
 */
export default function AppHeader({ user, avatarUrl, unreadCount = 0, onLogout }) {
  const { pathname } = useLocation();
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef(null);
  const toggleRef = useRef(null);
  const menuId = useId();

  useEffect(() => {
    setAccountOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!accountOpen) return undefined;
    const closeOutside = (event) => {
      if (!accountRef.current?.contains(event.target)) setAccountOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key !== "Escape") return;
      setAccountOpen(false);
      toggleRef.current?.focus();
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [accountOpen]);

  const username = user?.username || "Account";

  return (
    <header className="lv-header">
      <div className="lv-header-inner">
        <Link to="/profile" className="lv-brand" aria-label="LangVoyage — go to your profile">
          <CoachAvatar size={36} hideBadge />
          <span>LangVoyage</span>
        </Link>
        <nav className="lv-header-nav" aria-label="Main navigation">
          {HEADER_NAV_ITEMS.map((item) => {
            const active = isNavItemActive(pathname, item);
            return (
              <Link
                key={item.key}
                to={item.to}
                className={`lv-header-link${active ? " is-active" : ""}${item.premium ? " is-premium" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                {item.premium && <NavIcon name="sparkle" className="lv-header-premium-icon" />}
                {item.label}
                {item.showsUnread && unreadCount > 0 && (
                  <>
                    <span className="lv-count-badge" aria-hidden="true">{unreadLabel(unreadCount)}</span>
                    <span className="lv-visually-hidden">, {unreadCount} unread conversations</span>
                  </>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="lv-account" ref={accountRef}>
          <button
            ref={toggleRef}
            type="button"
            className="lv-account-button"
            aria-expanded={accountOpen}
            aria-controls={menuId}
            aria-label={`Account menu for ${username}`}
            onClick={() => setAccountOpen((open) => !open)}
          >
            <img
              src={avatarImage(avatarUrl, 36)}
              alt=""
              onError={handleAvatarError}
              onLoad={handleAvatarLoad}
            />
            <span className="lv-account-name">{username}</span>
            <NavIcon name="chevron" className={`lv-account-chevron${accountOpen ? " is-open" : ""}`} />
          </button>
          {accountOpen && (
            <div id={menuId} className="lv-account-menu">
              <Link to="/profile">My profile</Link>
              <Link to="/settings">Settings</Link>
              <Link to="/privacy-policy">Privacy Policy</Link>
              <Link to="/terms-and-conditions">Terms and Conditions</Link>
              <button type="button" className="lv-account-logout" onClick={onLogout}>
                Log out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
