import { clearClientSessionData, hasSessionHint, shouldCheckSession } from "./auth";

const setHint = () => {
  document.cookie = "lv_signed_in=1; path=/";
};

describe("session hint", () => {
  afterEach(() => {
    document.cookie = "lv_signed_in=; Max-Age=0; path=/";
  });

  test("logout-style cleanup removes the hint", () => {
    setHint();
    clearClientSessionData();
    expect(hasSessionHint()).toBe(false);
    expect(shouldCheckSession("/login")).toBe(false);
  });

  test("post-login cleanup keeps the hint the login response just set", () => {
    setHint();
    clearClientSessionData({ keepSessionHint: true });
    expect(hasSessionHint()).toBe(true);
    expect(shouldCheckSession("/login")).toBe(true);
  });

  test("app pages are always checked", () => {
    expect(shouldCheckSession("/profile")).toBe(true);
  });
});
