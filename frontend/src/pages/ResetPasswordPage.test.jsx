import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ResetPasswordPage from "./ResetPasswordPage";
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

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={["/reset-password/MQ/abc-123"]}>
      <Routes>
        <Route path="/reset-password/:uid/:token" element={<ResetPasswordPage />} />
      </Routes>
    </MemoryRouter>
  );

const fillAndSubmit = (password, confirm = password) => {
  fireEvent.change(screen.getByLabelText("New password"), { target: { value: password } });
  fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: confirm } });
  fireEvent.click(screen.getByRole("button", { name: "Set new password" }));
};

describe("ResetPasswordPage", () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  test("sends uid, token and the new password, then links to login", async () => {
    api.post.mockResolvedValue({ message: "Your password has been reset." });
    renderPage();

    fillAndSubmit("a-Fresh-passphrase-91");

    expect(await screen.findByText("Password updated")).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledWith("/api/auth/password-reset/confirm/", {
      uid: "MQ",
      token: "abc-123",
      new_password: "a-Fresh-passphrase-91",
    });
    expect(screen.getByRole("link", { name: "Go to log in" })).toHaveAttribute("href", "/login");
  });

  test("checks that both passwords match before calling the API", () => {
    renderPage();

    fillAndSubmit("a-Fresh-passphrase-91", "something-else-91");

    expect(screen.getByText("Passwords don't match.")).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  test("lists the backend password validator messages", async () => {
    api.post.mockRejectedValue(
      new ApiError({
        status: 400,
        code: "invalid_password",
        message: "This password is too common. This password is entirely numeric.",
        details: ["This password is too common.", "This password is entirely numeric."],
      })
    );
    renderPage();

    fillAndSubmit("12345678");

    expect(await screen.findByText("This password is too common.")).toBeInTheDocument();
    expect(screen.getByText("This password is entirely numeric.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Set new password" })).toBeInTheDocument();
  });

  test("an invalid or expired link offers a new one", async () => {
    api.post.mockRejectedValue(
      new ApiError({
        status: 400,
        code: "invalid_reset_link",
        message: "This password reset link is invalid or has expired. Please request a new one.",
      })
    );
    renderPage();

    fillAndSubmit("a-Fresh-passphrase-91");

    expect(await screen.findByText("Link expired")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Request a new link" })).toHaveAttribute(
      "href",
      "/forgot-password"
    );
  });
});
