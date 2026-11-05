// Own file: the picker and composer remember "GIFs unavailable" per module (page session), so
// these run with a fresh module state.
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import MessageInput from "./MessageInput";
import { StickerImage, replayUrl } from "./StickerImage";
import api from "../../../lib/api";

jest.mock("../../../lib/api", () => {
  const actual = jest.requireActual("../../../lib/apiError");
  const client = { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() };
  return { __esModule: true, default: client, api: client, getErrorMessage: actual.getErrorMessage, isApiError: actual.isApiError };
});

const STICKERS = [
  { id: "wave", ref: "lumi:wave", label: "Hello", url: "https://example.test/static/stickers/lumi/wave.svg" },
  { id: "love", ref: "lumi:love", label: "Love it", url: "https://example.test/static/stickers/lumi/love.svg" },
];
const GIF = {
  provider: "giphy", id: "abc", title: "Hi", url: "https://media2.giphy.com/a.webp",
  preview_url: "https://media2.giphy.com/a_d.gif", still_url: null, width: 200, height: 150,
};

beforeEach(() => {
  window.localStorage.clear();
  api.get.mockReset();
  api.get.mockImplementation((path) => {
    if (path === "/api/stickers/") return Promise.resolve({ packs: [{ id: "lumi", name: "Lumi", stickers: STICKERS }] });
    if (path.startsWith("/api/gifs/")) return Promise.resolve({ results: [GIF], next_offset: null, attribution: "giphy" });
    return Promise.reject(new Error(path));
  });
});

describe("composer Sticker and GIF buttons", () => {
  test("only shown when the chat can send media", () => {
    render(<MessageInput conversationId={7} onSendMessage={jest.fn()} />);
    expect(screen.queryByRole("button", { name: "Stickers" })).toBeNull();
    expect(screen.queryByRole("button", { name: "GIFs" })).toBeNull();
  });

  test("Stickers opens the sticker tab and sends; focus returns to the button", async () => {
    const onSendMedia = jest.fn(() => Promise.resolve(true));
    render(<MessageInput conversationId={7} onSendMessage={jest.fn()} onSendMedia={onSendMedia} />);
    const stickers = screen.getByRole("button", { name: "Stickers" });
    fireEvent.click(stickers);
    const dialog = await screen.findByRole("dialog", { name: "Stickers and GIFs" });
    expect(await within(dialog).findByRole("tab", { name: "Stickers" })).toHaveAttribute("aria-selected", "true");
    fireEvent.click(await within(dialog).findByRole("button", { name: "Send sticker: Love it" }));
    await waitFor(() => expect(onSendMedia).toHaveBeenCalledWith({ kind: "sticker", sticker: STICKERS[1] }));
    expect(screen.queryByRole("dialog", { name: "Stickers and GIFs" })).toBeNull();
    expect(stickers).toHaveFocus();
  });

  test("GIFs opens the GIF tab, the other button switches tabs, Escape closes", async () => {
    render(<MessageInput conversationId={7} onSendMessage={jest.fn()} onSendMedia={jest.fn()} />);
    const gifs = screen.getByRole("button", { name: "GIFs" });
    fireEvent.click(gifs);
    const dialog = await screen.findByRole("dialog", { name: "Stickers and GIFs" });
    expect(await within(dialog).findByRole("tab", { name: "GIFs" })).toHaveAttribute("aria-selected", "true");
    expect(gifs).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(screen.getByRole("button", { name: "Stickers" }));
    expect(within(screen.getByRole("dialog", { name: "Stickers and GIFs" })).getByRole("tab", { name: "Stickers" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Stickers and GIFs" })).toBeNull();
  });

  test("the GIF button disappears when the server has no GIF key", async () => {
    api.get.mockImplementation((path) =>
      path.startsWith("/api/gifs/")
        ? Promise.reject(Object.assign(new Error("off"), { code: "gifs_unavailable", status: 503 }))
        : Promise.resolve({ packs: [{ id: "lumi", name: "Lumi", stickers: STICKERS }] })
    );
    render(<MessageInput conversationId={7} onSendMessage={jest.fn()} onSendMedia={jest.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "GIFs" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "GIFs" })).toBeNull());
    expect(screen.getByRole("button", { name: "Stickers" })).toBeInTheDocument();
  });
});

describe("StickerImage hover replay", () => {
  const OriginalImage = global.Image;
  afterEach(() => {
    global.Image = OriginalImage;
    jest.useRealTimers();
  });

  test("replays (preloaded, once) only after the first animation has finished", () => {
    jest.useFakeTimers();
    const created = [];
    global.Image = class {
      constructor() {
        created.push(this);
      }
    };
    render(<StickerImage src="/static/stickers/lumi/wave.svg" alt="Sticker: Hello" />);
    const img = screen.getByRole("img", { name: "Sticker: Hello" });

    fireEvent.mouseEnter(img); // still animating
    expect(created).toHaveLength(0);

    act(() => jest.advanceTimersByTime(9000));
    fireEvent.mouseEnter(img);
    expect(created).toHaveLength(1);
    expect(created[0].src).toBe("/static/stickers/lumi/wave.svg?replay=1#once");
    expect(img).toHaveAttribute("src", "/static/stickers/lumi/wave.svg"); // swapped only once loaded
    act(() => created[0].onload());
    expect(img).toHaveAttribute("src", "/static/stickers/lumi/wave.svg?replay=1#once");

    fireEvent.mouseEnter(img); // the short replay is still playing
    expect(created).toHaveLength(1);
  });

  test("replay URLs keep existing query strings", () => {
    expect(replayUrl("/s.svg?v=2", 3)).toBe("/s.svg?v=2&replay=3#once");
  });
});
