import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import SettingsPage from "./page";

const mockRefreshUserProfile = jest.fn(() => Promise.resolve());
const mockUser = {
  base_translate_language: "english",
  native_language: "english",
  languages_practicing: ["greek"],
};

jest.mock("../../context/UserContext", () => ({
  useUser: () => ({
    user: mockUser,
    refreshUserProfile: mockRefreshUserProfile,
  }),
}));

describe("SettingsPage safety history", () => {
  beforeEach(() => {
    mockRefreshUserProfile.mockClear();
    global.fetch = jest.fn((url, options = {}) => {
      if (String(url).includes("/api/profile/moderation/")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            blocked_profiles: [
              {
                username: "blocked-user",
                profile_image_url: "/media/profile_images/blocked.jpg",
                created_at: "2026-03-10T12:00:00Z",
              },
            ],
            reported_profiles: [],
          }),
        });
      }

      if (
        String(url).includes("/api/profile/public/blocked-user/block/") &&
        options.method === "DELETE"
      ) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ message: "Unblocked" }),
        });
      }

      return Promise.resolve({
        ok: true,
        json: async () => ({}),
      });
    });
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  test("renders blocked profile avatar and can unblock from safety history", async () => {
    render(<SettingsPage />);

    const avatar = await screen.findByAltText("blocked-user");
    expect(avatar).toBeInTheDocument();
    expect(avatar).toHaveAttribute("src", expect.stringContaining("/media/profile_images/blocked.jpg"));

    const unblockButton = await screen.findByRole("button", { name: /unblock/i });
    fireEvent.click(unblockButton);

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/profile/public/blocked-user/block/"),
        expect.objectContaining({
          method: "DELETE",
          credentials: "include",
        })
      )
    );

    await waitFor(() => expect(mockRefreshUserProfile).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.queryByText("blocked-user")).not.toBeInTheDocument()
    );
  });
});
