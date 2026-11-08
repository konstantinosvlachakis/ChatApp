import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import RequireCompleteProfile from "./RequireCompleteProfile";

let mockUser;
jest.mock("../../context/UserContext", () => ({
  useUser: () => ({ user: mockUser }),
}));

const renderAt = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<RequireCompleteProfile />}>
          <Route path="/conversations" element={<p>Conversations</p>} />
          <Route path="/settings" element={<p>Settings</p>} />
        </Route>
        <Route path="/finish-profile" element={<p>Finish profile page</p>} />
        <Route path="/privacy-policy" element={<p>Privacy</p>} />
      </Routes>
    </MemoryRouter>
  );

describe("RequireCompleteProfile", () => {
  test.each(["/conversations", "/settings"])("an incomplete profile is redirected from %s", (path) => {
    mockUser = { username: "user_8f2a", profile_complete: false };
    renderAt(path);
    expect(screen.getByText("Finish profile page")).toBeInTheDocument();
  });

  test("public pages outside the app stay reachable", () => {
    mockUser = { username: "user_8f2a", profile_complete: false };
    renderAt("/privacy-policy");
    expect(screen.getByText("Privacy")).toBeInTheDocument();
  });

  test.each([
    ["complete", { username: "a", profile_complete: true }],
    ["missing flag (older backend)", { username: "a" }],
    ["no user yet", null],
  ])("renders the app for a %s profile", (_label, user) => {
    mockUser = user;
    renderAt("/conversations");
    expect(screen.getByText("Conversations")).toBeInTheDocument();
  });
});
