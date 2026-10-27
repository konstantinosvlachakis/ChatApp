import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import FilterSheet from "./FilterSheet";

const baseProps = {
  open: true,
  onClose: jest.fn(),
  nativeFilter: "",
  level: "",
  languageOptions: ["spanish", "french"],
  viewerLanguage: "greek",
  onApply: jest.fn(),
  onReset: jest.fn(),
};

describe("FilterSheet", () => {
  beforeEach(() => jest.clearAllMocks());

  test("applies the drafted language and level only on Show people", () => {
    render(<FilterSheet {...baseProps} />);
    expect(screen.getByText("Their Greek level")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Their native language"), { target: { value: "spanish" } });
    fireEvent.click(screen.getByRole("button", { name: "Intermediate" }));
    expect(screen.getByRole("button", { name: "Intermediate" })).toHaveAttribute("aria-pressed", "true");
    expect(baseProps.onApply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Show people/ }));
    expect(baseProps.onApply).toHaveBeenCalledWith({ nativeFilter: "spanish", level: "intermediate" });
  });

  test("closes from the close button and resets", () => {
    render(<FilterSheet {...baseProps} level="advanced" />);
    fireEvent.click(screen.getByRole("button", { name: "Close filters" }));
    expect(baseProps.onClose).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Reset filters" }));
    expect(baseProps.onReset).toHaveBeenCalled();
  });

  test("disables level pills without a native language", () => {
    render(<FilterSheet {...baseProps} viewerLanguage="" />);
    expect(screen.getByRole("button", { name: "Beginner" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Any" })).toBeEnabled();
  });
});
