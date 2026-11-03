import React from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import PeopleFilterPanel from "./PeopleFilterPanel";
import { DEFAULT_PANEL_FILTERS } from "../utils/peopleQuery";

const baseProps = () => ({
  open: true,
  onClose: jest.fn(),
  filters: DEFAULT_PANEL_FILTERS,
  theySpeakOptions: ["russian"],
  theyLearnOptions: ["greek", "english"],
  onApply: jest.fn(),
  countFor: jest.fn().mockResolvedValue(7),
});

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test("sections, defaults all on, and the last language chip stays on", async () => {
  const props = baseProps();
  render(<PeopleFilterPanel {...props} />);
  const speak = screen.getByRole("group", { name: "They speak" });
  const russian = within(speak).getByRole("button", { name: "Russian" });
  expect(russian).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(russian);
  expect(russian).toHaveAttribute("aria-pressed", "true");
  const learn = screen.getByRole("group", { name: "They're learning" });
  fireEvent.click(within(learn).getByRole("button", { name: "Greek" }));
  expect(within(learn).getByRole("button", { name: "Greek" })).toHaveAttribute("aria-pressed", "false");
  expect(screen.getAllByRole("switch").every((element) => element.getAttribute("aria-checked") === "true")).toBe(true);
  expect(
    within(screen.getByRole("group", { name: "Their level in your language" }))
      .getAllByRole("button")
      .map((button) => button.textContent)
  ).toEqual(["Any", "Beginner", "Intermediate", "Advanced+"]);

  await act(async () => {
    jest.advanceTimersByTime(300);
  });
  fireEvent.click(screen.getByRole("button", { name: "Show 7 people" }));
  expect(props.onApply).toHaveBeenCalledWith(expect.objectContaining({ theyLearn: ["english"], theySpeak: null }));
});

test("Reset restores the defaults and Close / Escape close the panel", () => {
  const props = baseProps();
  render(<PeopleFilterPanel {...props} filters={{ ...DEFAULT_PANEL_FILTERS, sort: "newest" }} />);
  expect(screen.getByRole("button", { name: "Newest" })).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(screen.getByRole("button", { name: "Reset" }));
  expect(screen.getByRole("button", { name: "Best fit" })).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(screen.getByRole("button", { name: "Close filters" }));
  expect(props.onClose).toHaveBeenCalledTimes(1);
  fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
  expect(props.onClose).toHaveBeenCalledTimes(2);
});
