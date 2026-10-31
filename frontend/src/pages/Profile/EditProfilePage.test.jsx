import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import EditProfilePage from "./EditProfilePage";
import api from "../../lib/api";
import { ApiError } from "../../lib/apiError";

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

  test("other fields save without a password prompt", async () => {
    api.patch.mockResolvedValue({ message: "ok" });
    renderPage();
    fireEvent.change(screen.getByLabelText("Bio"), { target: { value: "Hi" } });
    expect(screen.queryByLabelText("Current password")).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: "Save changes" })[0]);
    await waitFor(() => expect(api.patch).toHaveBeenCalled());
    expect(api.patch.mock.calls[0][1]).not.toHaveProperty("current_password");
  });

  test("changing the email asks for the current password and sends it", async () => {
    api.patch.mockResolvedValue({ message: "ok" });
    renderPage();
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "New@Example.com" } });
    const password = screen.getByLabelText("Current password");
    expect(password).toHaveAttribute("type", "password");
    screen.getAllByRole("button", { name: "Save changes" }).forEach((button) => expect(button).toBeDisabled());

    fireEvent.change(password, { target: { value: "my-secret" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Save changes" })[0]);
    await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
    expect(api.patch).toHaveBeenCalledWith(
      "/api/profile/edit/",
      expect.objectContaining({ email: "new@example.com", current_password: "my-secret" })
    );
  });

  test("a wrong current password is shown next to the field", async () => {
    api.patch.mockRejectedValue(
      new ApiError({ status: 403, code: "invalid_password", message: "Your current password is incorrect." })
    );
    renderPage();
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "new@example.com" } });
    fireEvent.change(screen.getByLabelText("Current password"), { target: { value: "wrong" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Save changes" })[0]);
    expect(await screen.findByRole("alert")).toHaveTextContent("Your current password is incorrect.");
    expect(mockRefresh).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Current password")).toHaveAttribute("aria-invalid", "true");
  });

  test("changing the email back to the saved one hides the password field", () => {
    renderPage();
    const email = screen.getByLabelText("Email");
    fireEvent.change(email, { target: { value: "other@example.com" } });
    expect(screen.getByLabelText("Current password")).toBeInTheDocument();
    fireEvent.change(email, { target: { value: "YOU@example.com " } });
    expect(screen.queryByLabelText("Current password")).toBeNull();
  });
});
