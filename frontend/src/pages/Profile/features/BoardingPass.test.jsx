import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { BoardingPass } from "./BoardingPass";
import { barcodeBars, boardLabel, passLevel, passProgress, routeCode } from "./boardingPassUtils";

const progress = (overrides = {}) => ({
  bucket: 1,
  max_bucket: 3,
  bucket_label: "Basics",
  attempts_in_bucket: 9,
  window_accuracy: 0.8,
  needed_for_promotion: { attempts_remaining: 6, min_attempts: 15, accuracy_target: 0.8 },
  ...overrides,
});


describe("boarding pass helpers", () => {
  test("codes, levels and labels match the mobile app", () => {
    expect(routeCode("Spanish")).toBe("SPA");
    expect(passLevel("Intermediate")).toMatchObject({ seat: "B1", gate: "Conversation Surfer", next: "Accent Adventurer" });
    expect(passLevel("")).toMatchObject({ key: "beginner", seat: "A2" });
    expect(boardLabel(null)).toBe("Find partners");
    expect(boardLabel(1234)).toBe("Board · 1.2k partners");
    expect(barcodeBars("es")).toEqual(barcodeBars("es"));
  });

  test("progress reads drills, low accuracy and the top level", () => {
    expect(passProgress(progress())).toEqual({ fraction: 0.6, caption: "9/15 drills to the next level", stage: "Basics" });
    expect(passProgress(progress({ attempts_in_bucket: 20, window_accuracy: 0.5 })).caption).toBe("Accuracy 50% · need 80%");
    expect(passProgress(progress({ bucket: 3, needed_for_promotion: null })).caption).toBe("Top practice level reached");
    expect(passProgress(null)).toBeNull();
  });
});

describe("BoardingPass", () => {
  const renderPass = (props) =>
    render(
      <MemoryRouter>
        <BoardingPass passenger="kostas" native="greek" language="spanish" level="intermediate" learningCount={2} {...props} />
      </MemoryRouter>
    );

  test("one focused destination with its own level, progress and deep links", () => {
    renderPass({
      interactive: true,
      stats: { progress: progress(), partners: 1240 },
    });
    const pass = screen.getByRole("article", { name: "Boarding pass: Greek to Spanish" });
    expect(within(pass).getByText("kostas")).toBeInTheDocument();
    expect(within(pass).getByText("GRE")).toBeInTheDocument();
    expect(within(pass).getByText("Voyager")).toBeInTheDocument();
    const stops = within(pass).getAllByRole("listitem");
    expect(stops).toHaveLength(1);
    expect(within(stops[0]).getByText("To")).toBeInTheDocument();
    expect(within(stops[0]).getByText("B1")).toBeInTheDocument();
    expect(within(stops[0]).getByText("Conversation Surfer")).toBeInTheDocument();
    expect(within(stops[0]).getByRole("progressbar", { name: "Practice progress in Spanish" })).toHaveAttribute("aria-valuenow", "60");
    expect(within(stops[0]).getByText("9/15 drills to the next level")).toBeInTheDocument();
    expect(within(stops[0]).getByRole("link", { name: "Practise Spanish" })).toHaveAttribute("href", "/practice?language=spanish");
    expect(within(stops[0]).getByRole("link", { name: "Find partners: 1240 native Spanish speakers" })).toHaveAttribute(
      "href",
      "/community?they_speak=spanish"
    );
    expect(within(stops[0]).getByText("1.2k partners")).toBeInTheDocument();
  });

  test("a language Practice doesn't cover says so", () => {
    renderPass({ language: "japanese", level: "", learningCount: 1, interactive: true, stats: { progress: null, partners: 0 } });
    expect(screen.getByText("Practice coming soon")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Find partners for Japanese" })).toHaveTextContent("Partners");
    expect(screen.getByText("Explorer")).toBeInTheDocument();
  });

  test("other people's pass is read-only (no progress, no links)", () => {
    renderPass();
    expect(screen.getByText("Voyager")).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });
});
