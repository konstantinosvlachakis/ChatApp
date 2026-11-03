import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ExchangeProfileCard, { ExchangeProfile, profileChips, relationshipTag } from "./ExchangeProfileCard";

const profile: ExchangeProfile = {
  username: "lucia",
  nativeLanguage: "spanish",
  languagesPracticing: ["english"],
  practiceLanguageLevels: { english: "advanced" },
  learningGoal: "Travel chats",
  match: { teachesMe: false, learnsMine: true, reciprocal: false, theyLearn: "english", youSpeak: "native" },
  city: "Madrid",
  activeLabel: "Active today",
};

test("card: tag, name, native language and city, chips, goal and both actions", () => {
  const onSayHello = jest.fn();
  render(
    <MemoryRouter>
      <ExchangeProfileCard profile={profile} viewerLanguage="english" busy={false} starting={false} onSayHello={onSayHello} />
    </MemoryRouter>
  );
  expect(screen.getByText("Learning English")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "lucia" })).toBeInTheDocument();
  expect(screen.getByText("Spanish native")).toBeInTheDocument();
  expect(screen.getByText("Madrid")).toBeInTheDocument();
  expect(screen.getByText("English · Advanced")).toBeInTheDocument();
  expect(screen.getByText("Travel chats")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "View lucia's profile" })).toHaveAttribute("href", "/people/lucia");
  fireEvent.click(screen.getByRole("button", { name: "Say hello to lucia" }));
  expect(onSayHello).toHaveBeenCalledWith("lucia");
});

test("tags and chips follow the match and profile fields", () => {
  expect(relationshipTag({ ...profile, match: { teachesMe: true, learnsMine: false, reciprocal: false, theyTeach: "russian" } })).toBe("Native Russian speaker");
  expect(relationshipTag({ ...profile, match: { teachesMe: false, learnsMine: false, reciprocal: false } })).toBe("Open to exchange");
  expect(profileChips({ ...profile, isNew: true })).toEqual(["English · Advanced", "Active today", "New member"]);
  expect(profileChips({ ...profile, languagesPracticing: ["a", "b", "c", "d"], activeLabel: "Active this week" })).toEqual(["A", "B", "C"]);
});
