import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ForgotPasswordPage from "./ForgotPasswordPage";
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
    <MemoryRouter>
      <ForgotPasswordPage />
    </MemoryRouter>
  );

const submitEmail = (value) => {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value } });
  fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));
};

describe("ForgotPasswordPage", () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  test("posts the normalised email and shows the check-your-inbox state", async () => {
    api.post.mockResolvedValue({ message: "If an account exists…" });
    renderPage();

    submitEmail("  Someone@Example.com ");

    expect(await screen.findByText("Check your inbox")).toBeInTheDocument();
    expect(screen.getByText("someone@example.com")).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledWith("/api/auth/password-reset/", {
      email: "someone@example.com",
    });
    expect(screen.getByRole("link", { name: "Back to log in" })).toHaveAttribute("href", "/login");
  });

  test("validates the email before calling the API", () => {
    renderPage();

    submitEmail("not-an-email");

    expect(screen.getByText("Enter a valid email address.")).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  test("shows the API error (e.g. throttled) and stays on the form", async () => {
    api.post.mockRejectedValue(
      new ApiError({ status: 429, code: "throttled", message: "Too many requests." })
    );
    renderPage();

    submitEmail("someone@example.com");

    expect(await screen.findByRole("alert")).toHaveTextContent("Too many requests.");
    expect(screen.queryByText("Check your inbox")).not.toBeInTheDocument();
  });

  test("can go back to the form to use another address", async () => {
    api.post.mockResolvedValue({});
    renderPage();
    submitEmail("someone@example.com");

    fireEvent.click(await screen.findByRole("button", { name: "Use a different email" }));

    expect(screen.getByRole("button", { name: "Send reset link" })).toBeInTheDocument();
  });
});
