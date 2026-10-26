import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import SettingsPage from "./page";
import api from "../../lib/api";

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

// Settings talks to the backend through the shared API client (lib/api).
jest.mock("../../lib/api", () => {
  const actual = jest.requireActual("../../lib/apiError");
  const client = { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() };
  return {
    __esModule: true,
    default: client,
    api: client,
    getErrorMessage: actual.getErrorMessage,
  };
});

describe("SettingsPage safety history", () => {
  beforeEach(() => {
    mockRefreshUserProfile.mockClear();
    api.get.mockImplementation((path) => {
      if (String(path).includes("/api/profile/moderation/")) {
        return Promise.resolve({
          blocked_profiles: [
            {
              username: "blocked-user",
              profile_image_url: "/media/profile_images/blocked.jpg",
              created_at: "2026-03-10T12:00:00Z",
            },
          ],
          reported_profiles: [],
        });
      }
      return Promise.resolve({});
    });
    api.delete.mockResolvedValue({ message: "Unblocked" });
    api.patch.mockResolvedValue({});
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
      expect(api.delete).toHaveBeenCalledWith(
        expect.stringContaining("/api/profile/public/blocked-user/block/")
      )
    );

    await waitFor(() => expect(mockRefreshUserProfile).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.queryByText("blocked-user")).not.toBeInTheDocument()
    );
  });
});
