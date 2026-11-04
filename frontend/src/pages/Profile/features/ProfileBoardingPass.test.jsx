import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ProfileBoardingPass } from "./ProfileBoardingPass";
import { LANGUAGE_KEYS } from "./profileUtils";

const progress = (attempts) => ({
  bucket: 1,
  max_bucket: 3,
  bucket_label: "Basics",
  attempts_in_bucket: attempts,
  window_accuracy: 0.8,
  needed_for_promotion: { attempts_remaining: 15 - attempts, min_attempts: 15, accuracy_target: 0.8 },
});

const defaults = {
  profileKey: "traveller-1",
  passenger: "kostas",
  native: "english",
  languages: ["spanish", "french"],
  levels: { spanish: "intermediate", french: "advanced" },
  stats: { spanish: { progress: progress(9), partners: 128 }, french: { progress: progress(3), partners: 26 } },
  interactive: true,
};

const passTree = (props = {}) => (
  <MemoryRouter>
    <ProfileBoardingPass {...defaults} {...props} />
  </MemoryRouter>
);

beforeEach(() => window.localStorage.clear());
afterEach(() => jest.restoreAllMocks());

test("focusing a language changes the complete pass, progress and destination actions", () => {
  const view = render(passTree());
  const switcher = screen.getByRole("group", { name: "Boarding pass language" });
  const spanish = within(switcher).getByRole("button", { name: "Focus on Spanish" });
  const french = within(switcher).getByRole("button", { name: "Focus on French" });
  expect(spanish).toHaveAttribute("aria-pressed", "true");
  const initial = screen.getByRole("article", { name: "Boarding pass: English to Spanish" });
  const initialFlight = initial.querySelector(".bp-atlas > svg");
  expect(within(initial).getByLabelText("Level B1")).toBeInTheDocument();
  expect(within(initial).getByRole("progressbar", { name: "Practice progress in Spanish" })).toHaveAttribute("aria-valuenow", "60");
  expect(screen.getByRole("link", { name: /Add language/i })).toHaveAttribute("href", "/profile/edit#edit-languages");

  // New progress must not interrupt or replay an in-flight journey.
  view.rerender(passTree({ stats: { ...defaults.stats, spanish: { progress: progress(12), partners: 128 } } }));
  expect(initial.querySelector(".bp-atlas > svg")).toBe(initialFlight);
  expect(within(initial).getByRole("progressbar", { name: "Practice progress in Spanish" })).toHaveAttribute("aria-valuenow", "80");

  fireEvent.click(french);

  expect(french).toHaveAttribute("aria-pressed", "true");
  expect(spanish).toHaveAttribute("aria-pressed", "false");
  expect(screen.getAllByRole("article")).toHaveLength(1);
  const focused = screen.getByRole("article", { name: "Boarding pass: English to French" });
  expect(focused.querySelector(".bp-atlas > svg")).not.toBe(initialFlight);
  expect(initialFlight.isConnected).toBe(false);
  expect(within(focused).getByLabelText("Level C1")).toBeInTheDocument();
  expect(within(focused).getByText("Accent Adventurer")).toBeInTheDocument();
  expect(within(focused).getByRole("progressbar", { name: "Practice progress in French" })).toHaveAttribute("aria-valuenow", "20");
  expect(within(focused).getByText("3/15 drills to the next level")).toBeInTheDocument();
  expect(within(focused).getByRole("link", { name: "Practise French" })).toHaveAttribute("href", "/practice?language=french");
  expect(within(focused).getByRole("link", { name: "Find partners: 26 native French speakers" })).toHaveAttribute("href", "/community?they_speak=french");
});

test("remembers a traveller's focus across visits without carrying it into another account", () => {
  const first = render(passTree());
  fireEvent.click(screen.getByRole("button", { name: "Focus on French" }));
  first.unmount();

  const returning = render(passTree());
  expect(screen.getByRole("article", { name: "Boarding pass: English to French" })).toBeInTheDocument();
  returning.rerender(passTree({ profileKey: "traveller-2" }));
  expect(screen.getByRole("article", { name: "Boarding pass: English to Spanish" })).toBeInTheDocument();
  returning.rerender(passTree());
  expect(screen.getByRole("article", { name: "Boarding pass: English to French" })).toBeInTheDocument();
});

test("removing the focused language falls back to an available one and a full language list hides Add", () => {
  const view = render(passTree());
  fireEvent.click(screen.getByRole("button", { name: "Focus on French" }));

  view.rerender(passTree({ languages: ["spanish"] }));
  expect(screen.getByRole("article", { name: "Boarding pass: English to Spanish" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Focus on French" })).not.toBeInTheDocument();
  expect(screen.getAllByRole("article")).toHaveLength(1);

  view.rerender(passTree({ languages: LANGUAGE_KEYS.filter((language) => language !== "english") }));
  expect(screen.queryByRole("link", { name: /Add language/i })).not.toBeInTheDocument();
});

test("public language browsing stays read-only and leaves the saved own-profile focus intact", () => {
  const own = render(passTree());
  fireEvent.click(screen.getByRole("button", { name: "Focus on French" }));
  own.unmount();
  const setItem = jest.spyOn(Storage.prototype, "setItem");

  const publicView = render(passTree({ interactive: false }));
  fireEvent.click(screen.getByRole("button", { name: "View Spanish journey" }));
  expect(screen.getByRole("article", { name: "Boarding pass: English to Spanish" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "View French journey" }));
  const publicPass = screen.getByRole("article", { name: "Boarding pass: English to French" });
  expect(within(publicPass).queryByRole("progressbar")).not.toBeInTheDocument();
  expect(within(publicPass).queryByRole("link")).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: /Add language/i })).not.toBeInTheDocument();
  expect(setItem).not.toHaveBeenCalled();
  publicView.unmount();

  render(passTree());
  expect(screen.getByRole("article", { name: "Boarding pass: English to French" })).toBeInTheDocument();
});

test("unavailable browser storage does not prevent focusing a language", () => {
  jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("Storage unavailable"); });
  jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Storage unavailable"); });

  render(passTree());
  fireEvent.click(screen.getByRole("button", { name: "Focus on French" }));

  expect(screen.getByRole("article", { name: "Boarding pass: English to French" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Focus on French" })).toHaveAttribute("aria-pressed", "true");
});
