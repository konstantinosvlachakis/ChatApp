import React from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
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

  test("follow toast actions run and dismiss the notification", () => {
    const viewProfile = jest.fn();
    const followBack = jest.fn();
    render(<ToastViewport />);
    act(() => { showToast("maria followed you", { actions: [
      { label: "View profile", onClick: viewProfile },
      { label: "Follow back", onClick: followBack },
    ] }); });
    fireEvent.click(screen.getByRole("button", { name: "Follow back" }));
    expect(followBack).toHaveBeenCalledTimes(1);
    expect(viewProfile).not.toHaveBeenCalled();
    expect(screen.queryByText("maria followed you")).not.toBeInTheDocument();
  });

  test("top toast with avatar and actions renders as a card with a primary button", () => {
    const followBack = jest.fn();
    render(<ToastViewport />);
    act(() => { showToast("saxas followed you", {
      placement: "top",
      eyebrow: "New follower",
      avatarUrl: "https://example.com/saxas.jpg",
      actions: [
        { label: "View profile", onClick: jest.fn() },
        { label: "Follow back", primary: true, onClick: followBack },
      ],
    }); });
    const top = screen.getByTestId("toast-viewport-top");
    expect(top).toHaveTextContent("New follower");
    expect(top).toHaveTextContent("saxas followed you");
    expect(top.querySelector("img")).toHaveAttribute("src", "https://example.com/saxas.jpg");
    const primary = within(top).getByRole("button", { name: "Follow back" });
    expect(primary).toHaveClass("is-primary");
    fireEvent.click(primary);
    expect(followBack).toHaveBeenCalledTimes(1);
    expect(top).toBeEmptyDOMElement();
  });

  test("top placement renders in the centred stack and auto-dismisses", () => {
    render(<ToastViewport />);
    act(() => {
      showToast("Your profile changes were saved.", { variant: "success", placement: "top" });
      toast.info("Corner note");
    });
    expect(screen.getByTestId("toast-viewport-top")).toHaveTextContent("Your profile changes were saved.");
    expect(screen.getByTestId("toast-viewport")).not.toHaveTextContent("Your profile changes were saved.");
    expect(screen.getByTestId("toast-viewport")).toHaveTextContent("Corner note");
    act(() => {
      jest.advanceTimersByTime(4000);
    });
    expect(screen.getByTestId("toast-viewport-top")).toBeEmptyDOMElement();
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
