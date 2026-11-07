import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import RegisterPage from "./RegisterPage";
import api from "../lib/api";

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

jest.mock("../context/UserContext", () => ({
  useUser: () => ({ refreshUserProfile: jest.fn().mockResolvedValue(null) }),
}));

const renderPage = () =>
  render(
    <MemoryRouter>
      <RegisterPage />
    </MemoryRouter>
  );

const fillBasics = () => {
  fireEvent.change(screen.getByLabelText("Username"), { target: { value: "alex_ross" } });
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "Alex@Example.com" } });
  fireEvent.click(screen.getByLabelText("Date of birth"));
  fireEvent.click(screen.getByRole("button", { name: "Use latest allowed" }));
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "Str0ng!pass" } });
  fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "Str0ng!pass" } });
};

const pickLanguage = (field, option) => {
  fireEvent.click(screen.getByRole("button", { name: new RegExp(field) }));
  fireEvent.click(screen.getByRole("option", { name: option }));
  const done = screen.queryByRole("button", { name: "Done", exact: true });
  if (done) fireEvent.click(done);
};

describe("RegisterPage", () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  test("sends the language to learn and the level", async () => {
    api.post.mockResolvedValue({});
    renderPage();
    fillBasics();

    pickLanguage("I want to learn", /Spanish/);
    fireEvent.click(screen.getByRole("button", { name: /My level/ }));
    fireEvent.click(screen.getByRole("option", { name: /Intermediate/ }));
    expect(screen.getByText("Your first voyage")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    expect(api.post.mock.calls[0][0]).toBe("/api/register/");
    expect(api.post.mock.calls[0][1]).toMatchObject({
      email: "alex@example.com",
      nativeLanguage: "english",
      practiceLanguages: ["spanish"],
      practiceLanguageLevels: { spanish: "intermediate" },
    });
    await waitFor(() => expect(screen.getByRole("button", { name: "Create account" })).toBeEnabled());
  });

  test("asks for a language to learn before submitting", () => {
    renderPage();
    fillBasics();

    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(screen.getByText("Choose at least one language you want to learn.")).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  test("the native language isn't offered to learn and resets a clashing choice", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /I want to learn/ }));
    expect(screen.queryByRole("option", { name: /English/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: /Greek/ }));
    expect(screen.getByText("Your first voyage")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Done", exact: true }));

    pickLanguage("I speak", /Greek/);

    expect(screen.queryByText("Your first voyage")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /I want to learn/ }));
    expect(screen.queryByRole("option", { name: /Greek/ })).not.toBeInTheDocument();
  });

  test("the dropdown works from the keyboard", () => {
    renderPage();
    fireEvent.keyDown(screen.getByRole("button", { name: /I want to learn/ }), { key: "ArrowDown" });
    const list = screen.getByRole("listbox");
    fireEvent.keyDown(list, { key: "g" }); // jump to German
    fireEvent.keyDown(list, { key: "Enter" });
    expect(screen.getByRole("option", { name: /German/ })).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(list, { key: "Escape" });

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /I want to learn German/ })).toBeInTheDocument();
  });

  test("saves multiple languages with independent levels", async () => {
    api.post.mockResolvedValue({});
    renderPage();
    fillBasics();

    fireEvent.click(screen.getByRole("button", { name: /I want to learn Choose at least one/ }));
    const list = screen.getByRole("listbox", { name: "I want to learn" });
    expect(list).toHaveAttribute("aria-multiselectable", "true");
    fireEvent.click(screen.getByRole("option", { name: /Spanish/ }));
    fireEvent.click(screen.getByRole("option", { name: /French/ }));
    expect(screen.getByRole("option", { name: /Spanish/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("option", { name: /French/ })).toHaveAttribute("aria-selected", "true");
    fireEvent.click(screen.getByRole("button", { name: "Done", exact: true }));

    fireEvent.click(screen.getByRole("button", { name: /My level · Spanish/ }));
    fireEvent.click(screen.getByRole("option", { name: /Intermediate/ }));
    fireEvent.click(screen.getByRole("button", { name: /My level · French/ }));
    fireEvent.click(screen.getByRole("option", { name: /Advanced/ }));
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/api/register/", expect.objectContaining({
      practiceLanguages: ["spanish", "french"],
      practiceLanguageLevels: { spanish: "intermediate", french: "advanced" },
    })));
    await waitFor(() => expect(screen.getByRole("button", { name: "Create account" })).toBeEnabled());
  });

  test("changing native language removes only the conflicting learning language", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /I want to learn/ }));
    fireEvent.click(screen.getByRole("option", { name: /Spanish/ }));
    fireEvent.click(screen.getByRole("option", { name: /Greek/ }));
    fireEvent.click(screen.getByRole("button", { name: "Done", exact: true }));
    pickLanguage("I speak", /Greek/);

    expect(screen.getByRole("button", { name: /I want to learn Spanish/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /My level · Greek/ })).not.toBeInTheDocument();
    expect(screen.getByText("Your first voyage")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /I want to learn/ }));
    fireEvent.click(screen.getByRole("option", { name: /Spanish/ }));
    fireEvent.click(screen.getByRole("button", { name: "Done", exact: true }));
    expect(screen.getByRole("button", { name: /I want to learn Choose at least one/ })).toBeInTheDocument();
    expect(screen.queryByText("Your first voyage")).not.toBeInTheDocument();
  });

  test("the level picker selects with the keyboard and restores focus", () => {
    renderPage();
    const trigger = screen.getByRole("button", { name: /My level Beginner/ });
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    const list = screen.getByRole("listbox", { name: "My level" });
    expect(list).toHaveFocus();
    fireEvent.keyDown(list, { key: "End" });
    fireEvent.keyDown(list, { key: "Enter" });

    expect(trigger).toHaveTextContent("Fluent");
    expect(trigger).toHaveFocus();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    fireEvent.click(trigger);
    expect(screen.getByRole("option", { name: /Fluent/ })).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "Escape" });
    expect(trigger).toHaveFocus();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});
