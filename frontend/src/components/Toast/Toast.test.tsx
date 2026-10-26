import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import ToastViewport from "./ToastViewport";
import { clearToasts, showToast, toast, toastApiError } from "./toastStore";
import { ApiError } from "../../lib/apiError";

describe("Toast system", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    act(() => clearToasts());
  });

  afterEach(() => {
    act(() => clearToasts());
    jest.useRealTimers();
  });

  test("renders errors as alerts and others as status, and dismisses", () => {
    render(<ToastViewport />);
    act(() => {
      toast.error("Message not sent");
      toast.success("Saved");
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Message not sent");
    expect(screen.getByRole("status")).toHaveTextContent("Saved");

    fireEvent.click(screen.getAllByRole("button", { name: /dismiss/i })[0]);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  test("auto-dismisses after its duration", () => {
    render(<ToastViewport />);
    act(() => {
      showToast("Short", { durationMs: 1000 });
    });
    expect(screen.getByText("Short")).toBeInTheDocument();
    act(() => {
      jest.advanceTimersByTime(1001);
    });
    expect(screen.queryByText("Short")).not.toBeInTheDocument();
  });

  test("keeps at most 3 toasts (oldest dropped)", () => {
    render(<ToastViewport />);
    act(() => {
      ["one", "two", "three", "four"].forEach((text) => toast.info(text));
    });
    expect(screen.queryByText("one")).not.toBeInTheDocument();
    expect(screen.getAllByRole("status")).toHaveLength(3);
  });

  test("toastApiError shows the API message and ignores aborted requests", () => {
    render(<ToastViewport />);
    act(() => {
      toastApiError(new ApiError({ status: 0, code: "aborted", message: "cancelled" }), "Couldn't save");
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    act(() => {
      toastApiError(
        new ApiError({ status: 403, code: "blocked", message: "You cannot message a blocked user." }),
        "Message not sent"
      );
    });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Message not sent: You cannot message a blocked user."
    );
  });
});
