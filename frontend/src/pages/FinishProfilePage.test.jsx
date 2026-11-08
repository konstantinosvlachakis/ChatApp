import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import FinishProfilePage from "./FinishProfilePage";
import api from "../lib/api";
import { ApiError } from "../lib/apiError";

jest.mock("../lib/api", () => {
  const actual = jest.requireActual("../lib/apiError");
  const client = { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() };
  return {
    __esModule: true,
    default: client,
    api: client,
    getErrorMessage: actual.getErrorMessage,
    isApiError: actual.isApiError,
  };
});

let mockUser;
const mockRefreshUserProfile = jest.fn();
const mockSetUser = jest.fn();
jest.mock("../context/UserContext", () => ({
  useUser: () => ({ user: mockUser, loading: false, refreshUserProfile: mockRefreshUserProfile, setUser: mockSetUser }),
}));

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={["/finish-profile"]}>
        <Routes>
          <Route path="/finish-profile" element={<FinishProfilePage />} />
          <Route path="/profile" element={<p>App home</p>} />
          <Route path="/login" element={<p>Login page</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );

const pickLanguage = (field, option) => {
  fireEvent.click(screen.getByRole("button", { name: new RegExp(field) }));
  fireEvent.click(screen.getByRole("option", { name: option }));
  const done = screen.queryByRole("button", { name: "Done", exact: true });
  if (done) fireEvent.click(done);
};

describe("FinishProfilePage", () => {
  beforeEach(() => {
    mockUser = { username: "user_8f2a", email: "me@gmail.com", profile_complete: false, has_password: false };
    mockRefreshUserProfile.mockImplementation(async () => {
      mockUser = { ...mockUser, profile_complete: true };
    });
    jest.spyOn(window.navigator, "languages", "get").mockReturnValue(["fr-FR"]);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.resetAllMocks();
  });

  test("saves the languages and a changed username, then opens the app", async () => {
    api.post.mockResolvedValue({ username: "marie", profile_complete: true });
    renderPage();
    expect(screen.getByRole("button", { name: /I speak… French/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    pickLanguage("^Language", /Greek/);
    const username = screen.getByLabelText(/Username/);
    expect(username).toHaveValue("user_8f2a");
    fireEvent.change(username, { target: { value: "marie" } });
    fireEvent.click(screen.getByRole("button", { name: "Start exchanging" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/api/auth/complete-profile/", {
        nativeLanguage: "french",
        practiceLanguages: ["greek"],
        practiceLanguageLevels: { greek: "beginner" },
        username: "marie",
      })
    );
    expect(await screen.findByText("App home")).toBeInTheDocument();
    expect(mockRefreshUserProfile).toHaveBeenCalled();
  });

  test("keeps the generated username out of the request and requires a practice language", async () => {
    api.post.mockResolvedValue({ username: "user_8f2a", profile_complete: true });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Start exchanging" }));
    expect(screen.getByText("Choose the language you want to practise.")).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();

    pickLanguage("^Language", /Spanish/);
    fireEvent.click(screen.getByRole("button", { name: "Start exchanging" }));
    await waitFor(() => expect(api.post).toHaveBeenCalled());
    expect(api.post.mock.calls[0][1]).not.toHaveProperty("username");
  });

  test("shows a taken username under the field", async () => {
    api.post.mockRejectedValue(new ApiError({ status: 400, code: "username_taken", message: "That username is taken." }));
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    pickLanguage("^Language", /Spanish/);
    fireEvent.change(screen.getByLabelText(/Username/), { target: { value: "taken" } });
    fireEvent.click(screen.getByRole("button", { name: "Start exchanging" }));
    expect(await screen.findByText("That username is taken.")).toBeInTheDocument();
    expect(screen.queryByText("App home")).not.toBeInTheDocument();
  });

  test("a complete profile (or an older backend without the flag) goes to the app", () => {
    mockUser = { username: "done" };
    renderPage();
    expect(screen.getByText("App home")).toBeInTheDocument();
  });

  test("without a session it goes to log in", () => {
    mockUser = null;
    renderPage();
    expect(screen.getByText("Login page")).toBeInTheDocument();
  });
});
