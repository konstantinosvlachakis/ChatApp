import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import LoginPage from "./LoginPage";
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

const mockRefreshUserProfile = jest.fn();
jest.mock("../context/UserContext", () => ({
  useUser: () => ({ refreshUserProfile: mockRefreshUserProfile }),
}));

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={["/login"]}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/profile" element={<p>App home</p>} />
        <Route path="/finish-profile" element={<p>Finish profile page</p>} />
      </Routes>
    </MemoryRouter>
  );

describe("LoginPage", () => {
  const originalClientId = process.env.REACT_APP_GOOGLE_CLIENT_ID;
  let googleCallback;

  const installGoogle = () => {
    process.env.REACT_APP_GOOGLE_CLIENT_ID = "test-client.apps.googleusercontent.com";
    window.google = {
      accounts: {
        id: {
          initialize: jest.fn((config) => {
            googleCallback = config.callback;
          }),
          renderButton: jest.fn(),
        },
      },
    };
  };

  beforeEach(() => {
    mockRefreshUserProfile.mockResolvedValue(null);
  });

  afterEach(() => {
    jest.resetAllMocks();
    delete window.google;
    if (originalClientId === undefined) delete process.env.REACT_APP_GOOGLE_CLIENT_ID;
    else process.env.REACT_APP_GOOGLE_CLIENT_ID = originalClientId;
  });

  test("password log in still works and opens the app", async () => {
    api.post.mockResolvedValue({ access: "a", refresh: "r" });
    renderPage();
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "Me@Example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "longenough" } });
    fireEvent.click(screen.getByRole("button", { name: "Log in" }));

    expect(await screen.findByText("App home")).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledWith("/api/token/", {
      email: "me@example.com",
      password: "longenough",
      remember_me: true,
    });
    expect(mockRefreshUserProfile).toHaveBeenCalled();
  });

  test("has no Google button without REACT_APP_GOOGLE_CLIENT_ID", () => {
    delete process.env.REACT_APP_GOOGLE_CLIENT_ID;
    renderPage();
    expect(screen.queryByTestId("google-signin-button")).not.toBeInTheDocument();
    expect(screen.queryByText("or")).not.toBeInTheDocument();
  });

  test("Google sign-in without a profile opens the app", async () => {
    installGoogle();
    api.post.mockResolvedValue({ access: "a", refresh: "r", created: false, profile_complete: true, username: "me" });
    renderPage();
    await waitFor(() => expect(window.google.accounts.id.renderButton).toHaveBeenCalled());
    expect(window.google.accounts.id.renderButton.mock.calls[0][1]).toMatchObject({ text: "signin_with" });
    // Email form first, then "or", then Google.
    const divider = screen.getByText("or");
    expect(
      screen.getByRole("button", { name: "Log in" }).compareDocumentPosition(divider) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();

    await act(async () => googleCallback({ credential: "google-id-token" }));

    expect(api.post).toHaveBeenCalledWith("/api/auth/google/", { credential: "google-id-token", remember_me: true });
    expect(await screen.findByText("App home")).toBeInTheDocument();
  });

  test("a new Google account without languages goes to finish-profile", async () => {
    installGoogle();
    api.post.mockResolvedValue({ created: true, profile_complete: false, username: "user_8f2a" });
    renderPage();
    await waitFor(() => expect(window.google.accounts.id.renderButton).toHaveBeenCalled());
    await act(async () => googleCallback({ credential: "tok" }));
    expect(await screen.findByText("Finish profile page")).toBeInTheDocument();
  });

  test("shows a disabled account error from Google sign-in", async () => {
    installGoogle();
    api.post.mockRejectedValue(new ApiError({ status: 403, code: "account_disabled", message: "x" }));
    renderPage();
    await waitFor(() => expect(window.google.accounts.id.renderButton).toHaveBeenCalled());
    await act(async () => googleCallback({ credential: "tok" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This account has been disabled.");
    expect(screen.queryByText("App home")).not.toBeInTheDocument();
  });
});
