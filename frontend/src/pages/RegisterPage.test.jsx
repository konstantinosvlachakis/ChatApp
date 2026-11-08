import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import RegisterPage from "./RegisterPage";
import { trackEvent } from "../lib/analytics";
import api from "../lib/api";
import { ApiError } from "../lib/apiError";

jest.mock("../lib/analytics", () => ({ trackEvent: jest.fn() }));

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

const renderPage = (state, search = "") =>
  render(
    <MemoryRouter initialEntries={[{ pathname: "/register", search, state }]}>
      <Routes>
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/profile" element={<p>App home</p>} />
        <Route path="/finish-profile" element={<p>Finish profile page</p>} />
        <Route path="/verify-email" element={<p>Verify email page</p>} />
      </Routes>
    </MemoryRouter>
  );

const continueButton = () => screen.getByRole("button", { name: "Continue" });

const pickLanguage = (field, option) => {
  fireEvent.click(screen.getByRole("button", { name: new RegExp(field) }));
  fireEvent.click(screen.getByRole("option", { name: option }));
  const done = screen.queryByRole("button", { name: "Done", exact: true });
  if (done) fireEvent.click(done);
};

/** Step 1 (English, from the browser) → step 2 with `languages` → step 3. */
const goToAccountStep = (languages = [/Spanish/]) => {
  fireEvent.click(continueButton());
  languages.forEach((language) => pickLanguage("^Language", language));
  fireEvent.click(continueButton());
  expect(screen.getByRole("heading", { name: "Create your account" })).toBeInTheDocument();
};

const fillAccount = () => {
  fireEvent.change(screen.getByLabelText("Username"), { target: { value: "alex_ross" } });
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "Alex@Example.com" } });
  fireEvent.click(screen.getByLabelText("Date of birth"));
  fireEvent.click(screen.getByRole("button", { name: "Use latest allowed" }));
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "Str0ng!pass" } });
  fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "Str0ng!pass" } });
};

const setBrowserLanguages = (languages) =>
  jest.spyOn(window.navigator, "languages", "get").mockReturnValue(languages);

describe("RegisterPage onboarding", () => {
  const originalClientId = process.env.REACT_APP_GOOGLE_CLIENT_ID;

  beforeEach(() => {
    mockRefreshUserProfile.mockResolvedValue(null);
    setBrowserLanguages(["en-US", "en"]);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.resetAllMocks();
    delete window.google;
    if (originalClientId === undefined) delete process.env.REACT_APP_GOOGLE_CLIENT_ID;
    else process.env.REACT_APP_GOOGLE_CLIENT_ID = originalClientId;
  });

  test("pre-selects the native language from the browser and shows progress", () => {
    setBrowserLanguages(["el-GR", "en"]);
    renderPage();
    expect(screen.getByRole("heading", { name: "I speak…" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /I speak… Greek/ })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Sign-up progress" }).querySelector('[aria-current="step"]')).toHaveTextContent(
      "Your language"
    );
    expect(trackEvent).toHaveBeenCalledWith("onboarding_step", { step: "native" });
  });

  test("leaves the native language empty when the browser language isn't offered", () => {
    setBrowserLanguages(["nl-NL"]);
    renderPage();
    expect(screen.getByRole("button", { name: /I speak… Choose a language/ })).toBeInTheDocument();
    fireEvent.click(continueButton());
    expect(screen.getByText("Choose the language you speak.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "I speak…" })).toBeInTheDocument();
  });

  describe("prefill from a language-pair page", () => {
    test("?speak=&learn= preselect steps 1 and 2, and both stay editable", () => {
      renderPage(undefined, "?speak=spanish&learn=english");
      expect(screen.getByRole("button", { name: /I speak… Spanish/ })).toBeInTheDocument();
      fireEvent.click(continueButton());
      expect(screen.getByRole("heading", { name: "I want to practise…" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^Language English/ })).toBeInTheDocument();
      pickLanguage("^Language", /Italian/);
      expect(screen.getByRole("button", { name: /^Language Italian/ })).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /Back/ }));
      pickLanguage("I speak", /Greek/);
      expect(screen.getByRole("button", { name: /I speak… Greek/ })).toBeInTheDocument();
    });

    test("the prefilled languages go to the server unchanged", async () => {
      api.post.mockResolvedValue({});
      renderPage(undefined, "?speak=greek&learn=spanish");
      fireEvent.click(continueButton());
      fireEvent.click(continueButton());
      expect(screen.getByRole("heading", { name: "Create your account" })).toBeInTheDocument();
      fillAccount();
      fireEvent.click(screen.getByRole("button", { name: "Create account" }));
      await waitFor(() =>
        expect(api.post).toHaveBeenCalledWith(
          "/api/register/",
          expect.objectContaining({
            nativeLanguage: "greek",
            practiceLanguages: ["spanish"],
            practiceLanguageLevels: { spanish: "beginner" },
          })
        )
      );
      expect(await screen.findByText("Verify email page")).toBeInTheDocument();
    });

    test("invalid values are ignored (browser language is the fallback)", () => {
      renderPage(undefined, "?speak=klingon&learn=%3Cscript%3E");
      expect(screen.getByRole("button", { name: /I speak… English/ })).toBeInTheDocument();
      fireEvent.click(continueButton());
      expect(screen.getByRole("button", { name: /^Language Choose a language/ })).toBeInTheDocument();
    });

    test("learn equal to speak is dropped", () => {
      renderPage(undefined, "?speak=italian&learn=italian");
      expect(screen.getByRole("button", { name: /I speak… Italian/ })).toBeInTheDocument();
      fireEvent.click(continueButton());
      expect(screen.getByRole("button", { name: /^Language Choose a language/ })).toBeInTheDocument();
    });

    test("only learn given: keeps the browser native language and preselects learn", () => {
      renderPage(undefined, "?learn=SPANISH");
      expect(screen.getByRole("button", { name: /I speak… English/ })).toBeInTheDocument();
      fireEvent.click(continueButton());
      expect(screen.getByRole("button", { name: /^Language Spanish/ })).toBeInTheDocument();
    });
  });

  test("step 2 needs a language other than the native one", () => {
    renderPage();
    fireEvent.click(continueButton());
    expect(screen.getByRole("heading", { name: "I want to practise…" })).toHaveFocus();

    fireEvent.click(continueButton());
    expect(screen.getByText("Choose the language you want to practise.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^Language/ }));
    expect(screen.queryByRole("option", { name: /English/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: /German/ }));
    expect(screen.queryByText("Choose the language you want to practise.")).not.toBeInTheDocument();
    expect(screen.getByText("Your first voyage")).toBeInTheDocument();
  });

  test("going back keeps every choice", () => {
    renderPage();
    pickLanguage("I speak", /Greek/);
    fireEvent.click(continueButton());
    pickLanguage("^Language", /Spanish/);
    fireEvent.click(screen.getByRole("button", { name: /My level/ }));
    fireEvent.click(screen.getByRole("option", { name: /Advanced/ }));
    fireEvent.click(continueButton());
    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "alex_ross" } });

    fireEvent.click(screen.getByRole("button", { name: /Back/ }));
    expect(screen.getByRole("button", { name: /^Language Spanish/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /My level Advanced/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Back/ }));
    expect(screen.getByRole("button", { name: /I speak… Greek/ })).toBeInTheDocument();

    fireEvent.click(continueButton());
    fireEvent.click(continueButton());
    expect(screen.getByLabelText("Username")).toHaveValue("alex_ross");
  });

  test("changing the native language to the practice language clears it", () => {
    renderPage();
    fireEvent.click(continueButton());
    pickLanguage("^Language", /Greek/);
    fireEvent.click(screen.getByRole("button", { name: /Back/ }));
    pickLanguage("I speak", /Greek/);
    fireEvent.click(continueButton());

    expect(screen.queryByRole("button", { name: /^Language Greek/ })).not.toBeInTheDocument();
    fireEvent.click(continueButton());
    expect(screen.getByText("Choose the language you want to practise.")).toBeInTheDocument();
  });

  test("step 2 offers a single practice language", () => {
    renderPage();
    fireEvent.click(continueButton());
    pickLanguage("^Language", /Spanish/);
    pickLanguage("^Language", /French/);
    expect(screen.getByRole("button", { name: /^Language French/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Spanish/ })).not.toBeInTheDocument();
  });

  test("email sign-up sends the languages from steps 1–2 and opens email verification", async () => {
    api.post.mockResolvedValue({});
    renderPage();
    fireEvent.click(continueButton());
    pickLanguage("^Language", /Spanish/);
    fireEvent.click(screen.getByRole("button", { name: /My level/ }));
    fireEvent.click(screen.getByRole("option", { name: /Intermediate/ }));
    fireEvent.click(continueButton());
    fillAccount();
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/api/register/", {
        username: "alex_ross",
        email: "alex@example.com",
        dateOfBirth: expect.any(String),
        password: "Str0ng!pass",
        nativeLanguage: "english",
        practiceLanguages: ["spanish"],
        practiceLanguageLevels: { spanish: "intermediate" },
      })
    );
    expect(await screen.findByText("Verify email page")).toBeInTheDocument();
    expect(trackEvent).toHaveBeenCalledWith("onboarding_step", { step: "practice" });
    expect(trackEvent).toHaveBeenCalledWith("onboarding_step", { step: "account" });
    expect(trackEvent).toHaveBeenCalledWith("sign_up", { method: "email" });
  });

  test("account step validates its fields before submitting", () => {
    renderPage();
    goToAccountStep();
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(screen.getByText("Username is required.")).toBeInTheDocument();
    expect(screen.getByText("Date of birth is required.")).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  test("a taken username from the server shows under the username field", async () => {
    api.post.mockRejectedValue(new ApiError({ status: 400, code: "username_taken", message: "That username is taken." }));
    renderPage();
    goToAccountStep();
    fillAccount();
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByText("That username is taken.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Create your account" })).toBeInTheDocument();
  });

  test("the level picker selects with the keyboard and restores focus", () => {
    renderPage();
    fireEvent.click(continueButton());
    const trigger = screen.getByRole("button", { name: /My level Beginner/ });
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    const list = screen.getByRole("listbox", { name: "My level" });
    expect(list).toHaveFocus();
    fireEvent.keyDown(list, { key: "End" });
    fireEvent.keyDown(list, { key: "Enter" });

    expect(trigger).toHaveTextContent("Fluent");
    expect(trigger).toHaveFocus();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  describe("Continue with Google", () => {
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

    test("is absent without REACT_APP_GOOGLE_CLIENT_ID", () => {
      delete process.env.REACT_APP_GOOGLE_CLIENT_ID;
      renderPage();
      goToAccountStep();
      expect(screen.queryByTestId("google-signin-button")).not.toBeInTheDocument();
      expect(screen.queryByText("or")).not.toBeInTheDocument();
    });

    test("sends the onboarding languages as the new account's profile", async () => {
      installGoogle();
      api.post.mockResolvedValue({ access: "a", refresh: "r", created: true, profile_complete: true, username: "alex" });
      renderPage();
      goToAccountStep();
      await waitFor(() => expect(window.google.accounts.id.renderButton).toHaveBeenCalled());
      expect(window.google.accounts.id.initialize).toHaveBeenCalledWith(
        expect.objectContaining({ client_id: "test-client.apps.googleusercontent.com", ux_mode: "popup", auto_select: false })
      );
      expect(window.google.accounts.id.renderButton.mock.calls[0][1]).toMatchObject({ text: "continue_with", shape: "pill" });

      await act(async () => {
        googleCallback({ credential: "google-id-token" });
      });

      expect(api.post).toHaveBeenCalledWith("/api/auth/google/", {
        credential: "google-id-token",
        remember_me: true,
        profile: {
          nativeLanguage: "english",
          practiceLanguages: ["spanish"],
          practiceLanguageLevels: { spanish: "beginner" },
        },
      });
      expect(await screen.findByText("App home")).toBeInTheDocument();
      expect(mockRefreshUserProfile).toHaveBeenCalled();
      expect(trackEvent).toHaveBeenCalledWith("sign_up", { method: "google" });
    });

    test("a Google sign-in carried over from log in offers \"Continue as\" without a second Google click", async () => {
      installGoogle();
      api.post.mockResolvedValue({ created: true, profile_complete: true, username: "neo" });
      renderPage({ pendingGoogle: { credential: "carried-token", email: "neo@example.com", receivedAt: Date.now() } });
      expect(screen.getByRole("status")).toHaveTextContent("Signing up with neo@example.com");
      goToAccountStep();

      fireEvent.click(screen.getByRole("button", { name: "Continue as neo@example.com" }));
      await waitFor(() =>
        expect(api.post).toHaveBeenCalledWith("/api/auth/google/", {
          credential: "carried-token",
          remember_me: true,
          profile: {
            nativeLanguage: "english",
            practiceLanguages: ["spanish"],
            practiceLanguageLevels: { spanish: "beginner" },
          },
        })
      );
      expect(await screen.findByText("App home")).toBeInTheDocument();
    });

    test("an expired carried-over Google sign-in falls back to the Google button", async () => {
      installGoogle();
      const old = Date.now() - 2 * 60 * 60 * 1000;
      renderPage({ pendingGoogle: { credential: "old-token", email: "neo@example.com", receivedAt: old } });
      goToAccountStep();
      expect(screen.queryByRole("button", { name: /Continue as/ })).not.toBeInTheDocument();
      await waitFor(() => expect(window.google.accounts.id.renderButton).toHaveBeenCalled());
    });

    test("a rejected carried-over token switches to the Google button", async () => {
      installGoogle();
      api.post.mockRejectedValue(new ApiError({ status: 401, code: "google_token_invalid", message: "x" }));
      renderPage({ pendingGoogle: { credential: "bad-token", email: "neo@example.com", receivedAt: Date.now() } });
      goToAccountStep();
      fireEvent.click(screen.getByRole("button", { name: "Continue as neo@example.com" }));
      await waitFor(() => expect(window.google.accounts.id.renderButton).toHaveBeenCalled());
      expect(screen.queryByRole("button", { name: /Continue as/ })).not.toBeInTheDocument();
    });

    test("an existing Google account (created: false) just logs in", async () => {
      installGoogle();
      api.post.mockResolvedValue({ created: false, profile_complete: true, username: "old" });
      renderPage();
      goToAccountStep();
      await waitFor(() => expect(window.google.accounts.id.renderButton).toHaveBeenCalled());
      await act(async () => googleCallback({ credential: "tok" }));
      expect(await screen.findByText("App home")).toBeInTheDocument();
      expect(trackEvent).toHaveBeenCalledWith("login", { method: "google" });
    });

    test("a practice-language error sends the user back to step 2 with the message", async () => {
      installGoogle();
      api.post.mockRejectedValue(
        new ApiError({ status: 400, code: "invalid_practice_level", message: "Pick a valid level." })
      );
      renderPage();
      goToAccountStep();
      await waitFor(() => expect(window.google.accounts.id.renderButton).toHaveBeenCalled());
      await act(async () => googleCallback({ credential: "tok" }));
      expect(await screen.findByText("Pick a valid level.")).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "I want to practise…" })).toBeInTheDocument();
    });

    test("other Google errors show on the account step", async () => {
      installGoogle();
      api.post.mockRejectedValue(new ApiError({ status: 401, code: "google_email_unverified", message: "x" }));
      renderPage();
      goToAccountStep();
      await waitFor(() => expect(window.google.accounts.id.renderButton).toHaveBeenCalled());
      await act(async () => googleCallback({ credential: "tok" }));
      expect(await screen.findByRole("alert")).toHaveTextContent(/Google account's email isn't verified/);
    });
  });
});
