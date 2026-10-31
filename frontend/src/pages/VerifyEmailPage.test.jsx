import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import VerifyEmailPage from "./VerifyEmailPage";
import VerifyEmailForm from "../components/EmailVerification/VerifyEmailForm";
import EmailVerificationGate from "../components/EmailVerification/EmailVerificationGate";
import { requestEmailVerification } from "../features/emailVerification";
import api from "../lib/api";
import { ApiError } from "../lib/apiError";

jest.mock("../lib/api", () => ({
  __esModule: true,
  default: { post: jest.fn() },
  getErrorMessage: (error) => error.message,
}));
jest.mock("../components/Auth/AuthShell", () => ({ children }) => <div>{children}</div>);
const mockRefresh = jest.fn(() => Promise.resolve());
const mockSetUser = jest.fn();
let mockUser;
jest.mock("../context/UserContext", () => ({ useUser: () => ({
  user: mockUser, setUser: mockSetUser, refreshUserProfile: mockRefresh, loading: false,
}) }));

beforeEach(() => {
  jest.clearAllMocks();
  sessionStorage.clear();
  mockUser = { email: "you@example.com", email_verified: false };
});
const show = (component, url = "/verify-email") => render(<MemoryRouter initialEntries={[url]}>{component}</MemoryRouter>);

test("pasted codes are normalized and success updates this user's profile", async () => {
  api.post.mockResolvedValue({ email_verified: true });
  const finish = jest.fn();
  show(<VerifyEmailForm onVerified={finish} />);
  fireEvent.change(screen.getByLabelText("Verification code"), { target: { value: "123 456" } });
  fireEvent.click(screen.getByRole("button", { name: "Verify email" }));
  await waitFor(() => expect(finish).toHaveBeenCalled());
  expect(api.post).toHaveBeenCalledWith("/api/auth/verify-email/confirm/", { code: "123456" });
  expect(mockSetUser.mock.calls[0][0](mockUser).email_verified).toBe(true);
});

test("wrong and expired codes show the API message without unlocking the account", async () => {
  api.post.mockRejectedValue(new ApiError({ status: 400, code: "code_expired", message: "That code has expired. Send a new code." }));
  show(<VerifyEmailForm />);
  fireEvent.change(screen.getByLabelText("Verification code"), { target: { value: "123456" } });
  fireEvent.click(screen.getByRole("button", { name: "Verify email" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("That code has expired");
  expect(mockSetUser).not.toHaveBeenCalled();
});

test("resends have a countdown that survives reopening the form", async () => {
  api.post.mockResolvedValue({ email_verified: false });
  const first = show(<VerifyEmailForm />);
  fireEvent.click(screen.getByRole("button", { name: "Resend code" }));
  expect(await screen.findByRole("button", { name: /Resend code in/ })).toBeDisabled();
  first.unmount();
  show(<VerifyEmailForm />);
  expect(screen.getByRole("button", { name: /Resend code in/ })).toBeDisabled();
  expect(api.post).toHaveBeenCalledTimes(1);
});

test("the server's resend Retry-After is respected", async () => {
  api.post.mockRejectedValue(new ApiError({ status: 429, code: "throttled", message: "Wait before resending", retryAfterMs: 600000 }));
  show(<VerifyEmailForm />);
  fireEvent.click(screen.getByRole("button", { name: "Resend code" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Wait before resending");
  expect(screen.getByRole("button", { name: /Resend code in (10:00|9:59)/ })).toBeDisabled();
});

test("a signed link works while logged out", async () => {
  mockUser = null;
  api.post.mockResolvedValue({ email_verified: true });
  show(<VerifyEmailPage />, "/verify-email?token=signed-token");
  expect(await screen.findByRole("heading", { name: "Email verified" })).toBeInTheDocument();
  expect(api.post).toHaveBeenCalledWith("/api/auth/verify-email/confirm-link/", { token: "signed-token" });
  expect(mockSetUser).not.toHaveBeenCalled();
});

test("a link never marks a different signed-in account verified", async () => {
  api.post.mockResolvedValue({ email_verified: true });
  show(<VerifyEmailPage />, "/verify-email?token=another-user-token");
  await screen.findByRole("heading", { name: "Email verified" });
  expect(mockRefresh).toHaveBeenCalled();
  expect(mockSetUser).not.toHaveBeenCalled();
});

test("an invalid link offers the code flow", async () => {
  api.post.mockRejectedValue(new Error("This link has expired"));
  show(<VerifyEmailPage />, "/verify-email?token=expired");
  expect(await screen.findByRole("alert")).toHaveTextContent("This link has expired");
  expect(screen.getByRole("link", { name: "Use a code instead" })).toHaveAttribute("href", "/verify-email");
});

test("gated actions open one accessible verification dialog", async () => {
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
  show(<EmailVerificationGate />);
  expect(screen.getByRole("status")).toHaveTextContent("Verify your email");
  act(() => { requestEmailVerification(); requestEmailVerification(); });
  expect(screen.getAllByRole("dialog")).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Do this later" }));
  expect(screen.queryByRole("dialog")).toBeNull();
});
