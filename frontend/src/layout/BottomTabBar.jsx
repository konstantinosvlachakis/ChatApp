import React from "react";
import { Link, useLocation } from "react-router-dom";
import { TAB_NAV_ITEMS, isNavItemActive, isOpenChatPath, unreadLabel } from "./navItems";
import NavIcon from "./NavIcon";

/** Phone-only (<768px, via CSS) bottom navigation. Hidden inside an open chat. */
export default function BottomTabBar({ unreadCount = 0 }) {
  const { pathname } = useLocation();
  if (isOpenChatPath(pathname)) return null;

  return (
    <nav className="lv-tabbar" aria-label="Main navigation">
      {TAB_NAV_ITEMS.map((item) => {
        const active = isNavItemActive(pathname, item);
        return (
          <Link
            key={item.key}
            to={item.to}
            className={`lv-tab${active ? " is-active" : ""}`}
            aria-current={active ? "page" : undefined}
          >
            <span className="lv-tab-icon">
              <NavIcon name={item.key} />
              {item.showsUnread && unreadCount > 0 && (
                <span className="lv-count-badge lv-tab-badge" aria-hidden="true">
                  {unreadLabel(unreadCount)}
                </span>
              )}
            </span>
            <span className="lv-tab-label">{item.label}</span>
            {item.showsUnread && unreadCount > 0 && (
              <span className="lv-visually-hidden">, {unreadCount} unread conversations</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
