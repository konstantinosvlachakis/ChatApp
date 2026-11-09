import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AppHeader from "./AppHeader";
import BottomTabBar from "./BottomTabBar";
import { HEADER_NAV_ITEMS, TAB_NAV_ITEMS, isNavItemActive, isOpenChatPath } from "./navItems";

const renderAt = (path, ui) => render(<MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>);
const item = (items, key) => items.find((entry) => entry.key === key);

describe("Premium while the app is free", () => {
  test("is not in the header or the tab bar", () => {
    expect(item(HEADER_NAV_ITEMS, "premium")).toBeUndefined();
    expect(item(TAB_NAV_ITEMS, "premium")).toBeUndefined();
  });
});

describe("nav helpers", () => {
  test("matches nested routes to their section", () => {
    expect(isNavItemActive("/people/maria", item(HEADER_NAV_ITEMS, "people"))).toBe(true);
    expect(isNavItemActive("/conversations/12", item(HEADER_NAV_ITEMS, "chats"))).toBe(true);
    expect(isNavItemActive("/practice/daily", item(HEADER_NAV_ITEMS, "practice"))).toBe(true);
    expect(isNavItemActive("/profile/edit", item(TAB_NAV_ITEMS, "profile"))).toBe(true);
    expect(isNavItemActive("/practiced", item(HEADER_NAV_ITEMS, "practice"))).toBe(false);
  });

  test("detects an open chat only for /conversations/:id", () => {
    expect(isOpenChatPath("/conversations/42")).toBe(true);
    expect(isOpenChatPath("/conversations/coach")).toBe(true);
    expect(isOpenChatPath("/conversations")).toBe(false);
    expect(isOpenChatPath("/community")).toBe(false);
  });
});

describe("AppHeader", () => {
  const props = { user: { username: "kostas" }, avatarUrl: "/a.png", unreadCount: 3, onLogout: jest.fn() };

  test("marks the current route active and shows the unread count", () => {
    renderAt("/conversations/5", <AppHeader {...props} />);
    const nav = screen.getByRole("navigation", { name: "Main navigation" });
    const chats = within(nav).getByRole("link", { name: /Conversations/ });
    expect(chats).toHaveAttribute("aria-current", "page");
    expect(chats).toHaveTextContent("3");
    expect(within(nav).getByRole("link", { name: "People" })).not.toHaveAttribute("aria-current");
    // Profile/Settings live in the account menu, not the top nav.
    expect(within(nav).queryByRole("link", { name: /profile/i })).toBeNull();
  });

  test("account menu closes on Escape and returns focus to the toggle", () => {
    renderAt("/community", <AppHeader {...props} />);
    const toggle = screen.getByRole("button", { name: /account menu/i });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "My profile" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Log out" }));
    expect(props.onLogout).toHaveBeenCalled();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link", { name: "My profile" })).toBeNull();
    expect(toggle).toHaveFocus();
  });
});

describe("BottomTabBar", () => {
  test("renders the four tabs with the active one marked (no Premium while the app is free)", () => {
    renderAt("/community", <BottomTabBar unreadCount={2} />);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(4);
    ["People", "Practice", /^Chats.*2 unread conversations$/, "Profile"].forEach((name) =>
      expect(screen.getByRole("link", { name })).toBeInTheDocument()
    );
    expect(screen.getByRole("link", { name: "People" })).toHaveAttribute("aria-current", "page");
  });

  test("is hidden inside an open chat", () => {
    const { container } = renderAt("/conversations/9", <BottomTabBar unreadCount={0} />);
    expect(container).toBeEmptyDOMElement();
  });
});
