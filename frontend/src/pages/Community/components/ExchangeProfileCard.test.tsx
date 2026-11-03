import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ExchangeProfileCard, { ExchangeProfile } from "./ExchangeProfileCard";

const profile: ExchangeProfile = {
  username: "lucia",
  nativeLanguage: "spanish",
  languagesPracticing: ["english"],
  practiceLanguageLevels: { english: "advanced" },
  learningGoal: "",
  match: { teachesMe: true, learnsMine: true, reciprocal: true },
};

const renderCard = (featured: boolean, onSayHello = jest.fn()) => {
  render(
    <MemoryRouter>
      <ExchangeProfileCard profile={profile} featured={featured} viewerLanguage="english" busy={false} starting={false} onSayHello={onSayHello} />
    </MemoryRouter>
  );
  return onSayHello;
};

test("buttons keep their text names with decorative icons", () => {
  renderCard(false);
  expect(screen.getAllByRole("link", { name: "View lucia's profile" })).toHaveLength(2);
  expect(screen.getByRole("button", { name: "Say hello to lucia" })).toBeInTheDocument();
  expect(screen.queryByText("Try opening with")).toBeNull();
});

test("featured card offers conversation starters that open the chat with the line as a draft", () => {
  const onSayHello = renderCard(true);
  expect(screen.getByText("Why you'll click")).toBeInTheDocument();
  expect(screen.getByText("Their English")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "What's a Spanish phrase you use every day?" }));
  expect(onSayHello).toHaveBeenCalledWith("lucia", "What's a Spanish phrase you use every day?");
});

test("a one-way learner's card says which of your languages they're learning", () => {
  render(
    <MemoryRouter>
      <ExchangeProfileCard
        profile={{ ...profile, nativeLanguage: "japanese", languagesPracticing: ["french"], practiceLanguageLevels: {}, match: { teachesMe: false, learnsMine: true, reciprocal: false, theyLearn: "french", youSpeak: "fluent" } }}
        viewerLanguage="greek"
        busy={false}
        starting={false}
        onSayHello={jest.fn()}
      />
    </MemoryRouter>
  );
  expect(screen.getByText("Learning French · you speak it fluently")).toBeInTheDocument();
  expect(screen.getByText("Learning a language you speak")).toBeInTheDocument();
});
