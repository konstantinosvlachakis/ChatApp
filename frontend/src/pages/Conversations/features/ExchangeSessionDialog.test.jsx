import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ExchangeSessionDialog, { initialLanguagePair } from "./ExchangeSessionDialog";

jest.mock("../../../lib/api", () => {
  const actual = jest.requireActual("../../../lib/apiError");
  const client = { get: jest.fn(), post: jest.fn() };
  return {
    __esModule: true,
    default: client,
    api: client,
    API_TIMEOUTS: { default: 15000, upload: 60000, coach: 35000 },
    getErrorMessage: actual.getErrorMessage,
    isApiError: actual.isApiError,
  };
});

const OPTIONS = {
  languages: ["english", "greek", "spanish"],
  default_languages: ["spanish", "english"],
  durations: [10, 20, 30],
};

test("defaults to 20 minutes and the partner's language first; swap and submit", async () => {
  const onSubmit = jest.fn().mockResolvedValue({ id: 1 });
  const onClose = jest.fn();
  render(<ExchangeSessionDialog options={OPTIONS} partnerName="ana" onSubmit={onSubmit} onClose={onClose} />);

  expect(screen.getByRole("radio", { name: "20 min" })).toBeChecked();
  expect(screen.getByRole("combobox", { name: "First language" })).toHaveValue("spanish");
  expect(screen.getByRole("combobox", { name: "Then switch to" })).toHaveValue("english");

  fireEvent.click(screen.getByRole("radio", { name: "30 min" }));
  fireEvent.click(screen.getByRole("button", { name: "Swap the language order" }));
  expect(screen.getByText("15 min English, then 15 min Spanish.")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText(/Your own topic/), { target: { value: "  Music  " } });
  fireEvent.click(screen.getByRole("button", { name: "Send invite" }));

  expect(onSubmit).toHaveBeenCalledWith({
    duration_minutes: 30,
    first_language: "english",
    second_language: "spanish",
    topic: "Music",
  });
  await waitFor(() => expect(onClose).toHaveBeenCalled());
});

test("same language disables submit; server errors show inline", async () => {
  const onSubmit = jest.fn().mockRejectedValue(Object.assign(new Error("Pick two different languages."), {
    isApiError: true,
    status: 400,
    code: "invalid_languages",
  }));
  render(<ExchangeSessionDialog options={OPTIONS} onSubmit={onSubmit} onClose={() => {}} />);
  fireEvent.change(screen.getByRole("combobox", { name: "Then switch to" }), { target: { value: "spanish" } });
  expect(screen.getByRole("button", { name: "Send invite" })).toBeDisabled();
  fireEvent.change(screen.getByRole("combobox", { name: "Then switch to" }), { target: { value: "greek" } });
  fireEvent.click(screen.getByRole("button", { name: "Send invite" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Pick two different languages.");
});

test("initial pair falls back when defaults are missing or equal", () => {
  expect(initialLanguagePair({ languages: ["english", "greek"], default_languages: ["english", "english"] })).toEqual([
    "english",
    "greek",
  ]);
  expect(initialLanguagePair({ languages: ["english", "greek"], default_languages: ["", ""] })).toEqual([
    "english",
    "greek",
  ]);
  expect(initialLanguagePair({ languages: ["english", "greek"], default_languages: ["", "greek"] })).toEqual([
    "greek",
    "english",
  ]);
});
