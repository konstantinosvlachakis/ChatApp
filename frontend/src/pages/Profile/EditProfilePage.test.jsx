import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import EditProfilePage from "./EditProfilePage";
import api from "../../lib/api";

jest.mock("../../lib/api", () => {
  const actual = jest.requireActual("../../lib/apiError");
  const client = { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() };
  return { __esModule: true, default: client, api: client, getErrorMessage: actual.getErrorMessage, isApiError: actual.isApiError };
});

const mockRefresh = jest.fn(() => Promise.resolve());
const mockUser = {
  user_id: 1,
  username: "kostas",
  email: "you@example.com",
  date_of_birth: "1996-06-30",
  native_language: "Greek",
  base_translate_language: "english",
  location: "Athens, Greece",
  languages_practicing: ["Spanish"],
  practice_language_levels: { Spanish: "intermediate" },
  bio: "",
  learning_goal: "",
  avatar_ring_color: "#1b7f79",
  profile_image_url: null,
};
jest.mock("../../context/UserContext", () => ({
  useUser: () => ({ user: mockUser, refreshUserProfile: mockRefresh }),
}));

const renderPage = () =>
  render(
    <MemoryRouter>
      <EditProfilePage />
    </MemoryRouter>
  );

beforeEach(() => jest.clearAllMocks());

describe("EditProfilePage", () => {
  test("starts clean with the saved level selected", () => {
    renderPage();
    expect(screen.getAllByText("No unsaved changes")).toHaveLength(2);
    expect(screen.getByRole("radio", { name: "Intermediate" })).toBeChecked();
    screen.getAllByRole("button", { name: "Save changes" }).forEach((button) => expect(button).toBeDisabled());
    // Native language isn't offered as something to learn.
    expect(screen.queryByRole("button", { name: "+ Greek" })).toBeNull();
  });

  test("saves bio, goal, languages and title-cased levels", async () => {
    api.patch.mockResolvedValue({ message: "ok" });
    renderPage();
    fireEvent.change(screen.getByLabelText("Bio"), { target: { value: "Coffee and hiking." } });
    fireEvent.click(screen.getByRole("button", { name: "+ Travel" }));
    fireEvent.click(screen.getByRole("button", { name: "+ French" }));
    const frenchLevels = screen.getByRole("group", { name: "French level" });
    fireEvent.click(frenchLevels.querySelector('input[value="beginner"]'));
    expect(screen.getAllByText("4 unsaved changes")).toHaveLength(2);

    fireEvent.click(screen.getAllByRole("button", { name: "Save changes" })[0]);
    await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
    expect(api.patch).toHaveBeenCalledWith(
      "/api/profile/edit/",
      expect.objectContaining({
        bio: "Coffee and hiking.",
        learning_goal: "Get by confidently when I travel.",
        languages_practicing: ["Spanish", "French"],
        practice_language_levels: { Spanish: "intermediate", French: "beginner" },
        native_language: "greek",
      })
    );
  });

  test("removing a language drops its level and Discard restores everything", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Remove Spanish" }));
    expect(screen.queryByRole("group", { name: "Spanish level" })).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: "Discard" })[1]);
    expect(screen.getByRole("group", { name: "Spanish level" })).toBeInTheDocument();
    expect(screen.getAllByText("No unsaved changes")).toHaveLength(2);
  });

  test("blocks saving an invalid ring colour", () => {
    renderPage();
    fireEvent.change(screen.getByLabelText("Hex value"), { target: { value: "#12" } });
    expect(screen.getByText("Enter a 6-digit hex colour like #1b7f79.")).toBeInTheDocument();
    screen.getAllByRole("button", { name: "Save changes" }).forEach((button) => expect(button).toBeDisabled());
  });
});
