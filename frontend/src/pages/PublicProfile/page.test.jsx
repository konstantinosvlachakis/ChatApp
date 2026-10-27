import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import PublicProfilePage from "./page";
import ProfilePage from "../Profile/page";
import api from "../../lib/api";

jest.mock("../../lib/api", () => {
  const actual = jest.requireActual("../../lib/apiError");
  const client = { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn(), upload: jest.fn() };
  return {
    __esModule: true,
    default: client,
    api: client,
    getErrorMessage: actual.getErrorMessage,
    isApiError: actual.isApiError,
    isAbortError: () => false,
  };
});

const mockMe = {
  user_id: 1,
  username: "kostas",
  age: 30,
  location: "Athens, Greece",
  native_language: "Greek",
  languages_practicing: ["Spanish", "English"],
  practice_language_levels: { Spanish: "intermediate" },
  bio: "",
  learning_goal: "Order coffee in Madrid",
  profile_image_url: null,
  recent_profile_viewers: [
    { user_id: 2, username: "maria", native_language: "Spanish", profile_image_url: null, viewed_at: new Date().toISOString() },
  ],
};

jest.mock("../../context/UserContext", () => ({ useUser: () => ({ user: mockMe, setUser: () => {} }) }));
jest.mock("../../context/PresenceContext", () => ({ usePresence: () => ({ onlineUserIds: new Set([2]) }) }));

const renderAt = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/people/:username" element={<PublicProfilePage />} />
      </Routes>
    </MemoryRouter>
  );

beforeEach(() => jest.clearAllMocks());

describe("public profile", () => {
  test("shows a perfect match, online status and a Message action", async () => {
    api.get.mockResolvedValue({
      user_id: 2,
      username: "maria",
      age: 27,
      native_language: "Spanish",
      languages_practicing: ["Greek"],
      practice_language_levels: { Greek: "beginner" },
      bio: "Hola!",
      learning_goal: "",
    });
    renderAt("/people/maria");
    expect(await screen.findByRole("heading", { name: "maria, 27" })).toBeInTheDocument();
    expect(screen.getByText("Perfect match")).toBeInTheDocument();
    expect(screen.getByText("Active now")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Message/ })).toBeInTheDocument();
    expect(screen.getByText("Your exchange")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Level 1 of 4" })).toBeInTheDocument();
  });

  test("viewing your own public profile offers Edit instead of Message", async () => {
    api.get.mockResolvedValue({ ...mockMe, recent_profile_viewers: undefined });
    renderAt("/people/kostas");
    expect(await screen.findByText("This is how other people see your profile.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Message/ })).toBeNull();
    expect(screen.getByRole("link", { name: /Edit profile/ })).toBeInTheDocument();
  });
});

describe("own profile", () => {
  test("renders languages, visitors, practice and the strength checklist", async () => {
    api.get.mockImplementation((url) =>
      Promise.resolve(
        url === "/api/practice/state/"
          ? { language: "spanish", stats: { level: 4, xp: 340, accuracy: 82, correct_answers: 128 }, current_rank: 7 }
          : mockMe
      )
    );
    renderAt("/profile");
    expect(await screen.findByRole("heading", { name: "kostas, 30" })).toBeInTheDocument();
    expect(screen.getByText("Athens, Greece")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Level 2 of 4" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /maria/ })).toHaveAttribute("href", "/people/maria");
    expect(screen.getByText("Can teach you")).toBeInTheDocument();
    expect(await screen.findByText("Spanish rank")).toBeInTheDocument();
    expect(screen.getByText("60 to level 5")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add a profile photo/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /View as others see it/ })).toHaveAttribute("href", "/people/kostas");
  });
});
