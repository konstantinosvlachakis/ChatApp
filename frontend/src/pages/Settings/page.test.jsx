import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import SettingsPage from "./page";
import api from "../../lib/api";
import { ApiError } from "../../lib/apiError";
import { clearToasts, getToasts } from "../../components/Toast/toastStore";

const mockSetUser = jest.fn();
const mockRefreshUserProfile = jest.fn(() => Promise.resolve());
let mockUser;

jest.mock("../../context/UserContext", () => ({
  useUser: () => ({
    user: mockUser,
    setUser: mockSetUser,
    refreshUserProfile: mockRefreshUserProfile,
  }),
}));

// Settings talks to the backend through the shared API client (lib/api).
jest.mock("../../lib/api", () => {
  const actual = jest.requireActual("../../lib/apiError");
  const client = { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() };
  return {
    __esModule: true,
    default: client,
    api: client,
    getErrorMessage: actual.getErrorMessage,
    isAbortError: actual.isAbortError,
  };
});

const moderationPayload = {
  blocked_profiles: [
    {
      username: "blocked-user",
      profile_image_url: "/media/profile_images/blocked.jpg",
      created_at: "2026-03-10T12:00:00Z",
    },
  ],
  reported_profiles: [
    {
      username: "reported-user",
      profile_image_url: "",
      reason: "spam",
      details: "Sent links",
      created_at: "2026-03-11T12:00:00Z",
    },
  ],
};

const renderPage = async (onLogout = jest.fn(() => Promise.resolve())) => {
  render(
    <MemoryRouter initialEntries={["/settings"]}>
      <Routes>
        <Route element={<Outlet context={{ onLogout }} />}>
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
  // Let the moderation fetch settle so its state updates happen inside the test.
  await waitFor(() => expect(screen.queryByText(/loading blocked profiles/i)).not.toBeInTheDocument());
  return { onLogout };
};

describe("SettingsPage", () => {
  beforeEach(() => {
    mockUser = {
      username: "kostas",
      email: "kostas@example.com",
      base_translate_language: "english",
      native_language: "english",
      languages_practicing: ["Greek"],
      practice_language_levels: { Greek: "intermediate" },
      support_email: "help@example.com",
    };
    api.get.mockImplementation((path) =>
      Promise.resolve(String(path).includes("/api/profile/moderation/") ? moderationPayload : {})
    );
    api.delete.mockResolvedValue({ message: "ok" });
    api.patch.mockResolvedValue({ updated_profile: { base_translate_language: "spanish" } });
    api.post.mockResolvedValue({ message: "ok" });
  });

  afterEach(() => {
    jest.resetAllMocks();
    act(() => clearToasts());
  });

  test("renders every section, account details, learning chips and footer links", async () => {
    await renderPage();

    for (const name of ["Account", "Language & translation", "Notifications", "Privacy & safety", "Danger zone"]) {
      expect(screen.getByRole("heading", { level: 2, name })).toBeInTheDocument();
    }
    expect(screen.getByText("kostas@example.com")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /edit profile/i })).toHaveAttribute("href", "/profile/edit");
    expect(screen.getByRole("link", { name: /view my profile/i })).toHaveAttribute("href", "/profile");

    const learning = screen.getByRole("list", { name: /languages you're learning/i });
    expect(within(learning).getByText(/Greek/)).toBeInTheDocument();
    expect(within(learning).getByText(/Intermediate/)).toBeInTheDocument();
    // Languages are read-only here (Edit profile owns them).
    expect(screen.queryByText(/select practicing languages/i)).not.toBeInTheDocument();

    expect(screen.getByRole("link", { name: "Contact support" })).toHaveAttribute("href", "mailto:help@example.com");
    expect(screen.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/privacy-policy");

    expect(await screen.findByText("Spam")).toBeInTheDocument();
    expect(screen.getByText("Sent links")).toBeInTheDocument();
  });

  test("saves only the translate language and merges it into the shared user", async () => {
    await renderPage();
    const save = screen.getByRole("button", { name: "Save changes" });
    expect(save).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Translate messages into"), { target: { value: "spanish" } });
    expect(screen.getByTestId("translate-example")).toHaveTextContent("¿Quieres practicar mañana?");
    expect(save).toBeEnabled();

    fireEvent.click(save);
    fireEvent.click(save); // in-flight guard

    await waitFor(() => expect(api.patch).toHaveBeenCalledTimes(1));
    expect(api.patch).toHaveBeenCalledWith("/api/profile/edit/", { base_translate_language: "spanish" });
    await waitFor(() => expect(mockSetUser).toHaveBeenCalled());
    const merge = mockSetUser.mock.calls[0][0];
    expect(merge(mockUser)).toEqual({ ...mockUser, base_translate_language: "spanish" });
    expect(await screen.findByText("Saved")).toBeInTheDocument();
  });

  test("unblocks a profile once and removes it from the list", async () => {
    await renderPage();

    const avatarRow = (await screen.findByRole("link", { name: "blocked-user" })).closest("li");
    expect(screen.getByRole("link", { name: "blocked-user" })).toHaveAttribute("href", "/people/blocked-user");
    expect(avatarRow.querySelector("img")).toHaveAttribute(
      "src",
      expect.stringContaining("/media/profile_images/blocked.jpg")
    );

    const unblock = screen.getByRole("button", { name: "Unblock blocked-user" });
    fireEvent.click(unblock);
    fireEvent.click(unblock);

    await waitFor(() =>
      expect(screen.queryByRole("link", { name: "blocked-user" })).not.toBeInTheDocument()
    );
    expect(api.delete).toHaveBeenCalledTimes(1);
    expect(api.delete).toHaveBeenCalledWith("/api/profile/public/blocked-user/block/");
    expect(getToasts().some((t) => t.message.startsWith("Unblocked blocked-user"))).toBe(true);
    expect(screen.getByText(/haven't blocked anyone/i)).toBeInTheDocument();
  });

  test("change password asks first, then sends the reset link to the account email", async () => {
    await renderPage();

    fireEvent.click(screen.getByRole("button", { name: /change password/i }));
    const dialog = screen.getByRole("dialog", { name: "Change password?" });
    expect(api.post).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Send link" }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/api/auth/password-reset/", { email: "kostas@example.com" })
    );
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("We sent a link to kostas@example.com")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("password dialog closes on Escape without sending", async () => {
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: /change password/i }));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  test("delete account requires typing the username, then deletes and logs out", async () => {
    const { onLogout } = await renderPage();

    fireEvent.click(screen.getByRole("button", { name: /delete account/i }));
    const dialog = screen.getByRole("dialog", { name: "Delete your account?" });
    const confirm = within(dialog).getByRole("button", { name: "Delete account" });
    const input = within(dialog).getByLabelText(/to confirm/i);
    expect(confirm).toBeDisabled();

    fireEvent.change(input, { target: { value: "kost" } });
    expect(confirm).toBeDisabled();
    fireEvent.submit(confirm.closest("form"));
    expect(api.delete).not.toHaveBeenCalledWith("/api/profile/delete/");

    fireEvent.change(input, { target: { value: "kostas" } });
    // The current password is required too.
    expect(confirm).toBeDisabled();
    const password = within(dialog).getByLabelText("Your current password");
    expect(password).toHaveAttribute("type", "password");
    fireEvent.change(password, { target: { value: "my-secret" } });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);

    await waitFor(() =>
      expect(api.delete).toHaveBeenCalledWith("/api/profile/delete/", { body: { current_password: "my-secret" } })
    );
    await waitFor(() => expect(onLogout).toHaveBeenCalledWith({ accountDeleted: true }));
  });

  test("delete account shows a wrong password inside the dialog and stays signed in", async () => {
    api.delete.mockRejectedValue(
      new ApiError({ status: 403, code: "invalid_password", message: "Your current password is incorrect." })
    );
    const { onLogout } = await renderPage();

    fireEvent.click(screen.getByRole("button", { name: /delete account/i }));
    const dialog = screen.getByRole("dialog", { name: "Delete your account?" });
    fireEvent.change(within(dialog).getByLabelText(/to confirm/i), { target: { value: "kostas" } });
    fireEvent.change(within(dialog).getByLabelText("Your current password"), { target: { value: "wrong" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete account" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Your current password is incorrect.");
    expect(onLogout).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Delete your account?" })).toBeInTheDocument();
  });

  test("log out of all devices confirms, revokes every session, then logs out", async () => {
    const { onLogout } = await renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Log out of all devices" }));
    const dialog = screen.getByRole("dialog", { name: "Log out of all devices?" });
    expect(api.post).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Log out everywhere" }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/api/auth/logout-all/"));
    await waitFor(() => expect(onLogout).toHaveBeenCalledWith({ sessionRevoked: true }));
  });

  test("log out of all devices keeps the session when the request fails", async () => {
    api.post.mockRejectedValue(new ApiError({ status: 429, code: "throttled", message: "Slow down." }));
    const { onLogout } = await renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Log out of all devices" }));
    fireEvent.click(screen.getByRole("button", { name: "Log out everywhere" }));
    await waitFor(() => expect(getToasts().length).toBeGreaterThan(0));
    expect(onLogout).not.toHaveBeenCalled();
  });

  test("log out uses the layout's logout", async () => {
    const { onLogout } = await renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Log out" }));
    await waitFor(() => expect(onLogout).toHaveBeenCalledTimes(1));
  });
});
