import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { fireEvent as fire } from "@testing-library/react";
import Conversation from "./Conversation";
import MessageInput from "./MessageInput";
import StickerGifPicker from "./StickerGifPicker";
import api from "../../../lib/api";
import { resetStickerPacksCache } from "../api/stickersGifs";
import { messagePreviewText, readRecentStickers } from "../utils/messageMedia";

jest.mock("../../../lib/api", () => {
  const actual = jest.requireActual("../../../lib/apiError");
  const client = { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() };
  return { __esModule: true, default: client, api: client, getErrorMessage: actual.getErrorMessage, isApiError: actual.isApiError };
});

const PACKS = {
  packs: [
    {
      id: "lumi",
      name: "Lumi",
      stickers: [
        { id: "wave", ref: "lumi:wave", label: "Hello", url: "https://example.test/static/stickers/lumi/wave.svg" },
        { id: "love", ref: "lumi:love", label: "Love it", url: "https://example.test/static/stickers/lumi/love.svg" },
      ],
    },
  ],
};
const GIF = {
  provider: "giphy",
  id: "abc123",
  title: "Hello there",
  url: "https://media2.giphy.com/media/abc123/200w.webp",
  preview_url: "https://media2.giphy.com/media/abc123/200w_d.gif",
  still_url: "https://media2.giphy.com/media/abc123/200w_s.gif",
  width: 200,
  height: 150,
};

const routeGet = ({ gifs } = {}) =>
  api.get.mockImplementation((path) => {
    if (path === "/api/stickers/") return Promise.resolve(PACKS);
    if (path.startsWith("/api/gifs/")) return gifs ? gifs(path) : Promise.resolve({ results: [GIF], next_offset: null, attribution: "giphy" });
    return Promise.reject(new Error(`unexpected ${path}`));
  });

beforeEach(() => {
  window.localStorage.clear();
  resetStickerPacksCache();
  api.get.mockReset();
});

describe("messagePreviewText", () => {
  test("names stickers and GIFs instead of an empty preview", () => {
    expect(messagePreviewText({ kind: "sticker", text: "", media: { label: "Hello" } })).toBe("Sticker · Hello");
    expect(messagePreviewText({ kind: "sticker", text: "", media: { label: "Sticker" } })).toBe("Sticker");
    expect(messagePreviewText({ kind: "gif", text: "" })).toBe("GIF");
    expect(messagePreviewText({ kind: "text", text: " hola " })).toBe("hola");
    expect(messagePreviewText({ text: "", attachment_url: "/media/x.png" })).toBe("Attachment");
    expect(messagePreviewText(null, "None")).toBe("None");
  });
});

describe("StickerGifPicker", () => {
  test("sends a sticker and remembers it as recent", async () => {
    routeGet();
    const onSend = jest.fn();
    render(<StickerGifPicker onSend={onSend} />);
    fireEvent.click(await screen.findByRole("button", { name: "Send sticker: Hello" }));
    expect(onSend).toHaveBeenCalledWith({ kind: "sticker", sticker: PACKS.packs[0].stickers[0] });
    expect(readRecentStickers()).toEqual(["lumi:wave"]);
    expect(screen.getByRole("list", { name: "Recent stickers" })).toBeInTheDocument();
  });

  test("GIF tab loads trending, searches after typing and shows attribution", async () => {
    routeGet();
    const onSend = jest.fn();
    render(<StickerGifPicker onSend={onSend} />);
    fireEvent.click(screen.getByRole("tab", { name: "GIFs" }));
    fireEvent.click(await screen.findByRole("button", { name: "Send GIF: Hello there" }));
    expect(onSend).toHaveBeenCalledWith({ kind: "gif", gif: GIF });
    expect(screen.getByText("Powered by GIPHY")).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith("/api/gifs/", expect.objectContaining({ maxAttempts: 1 }));

    jest.useFakeTimers();
    try {
      fireEvent.change(screen.getByRole("searchbox", { name: "Search GIFs" }), { target: { value: "hola" } });
      act(() => jest.advanceTimersByTime(450));
    } finally {
      jest.useRealTimers();
    }
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith("/api/gifs/?q=hola", expect.anything())
    );
  });

  test("hides the GIF tab when the server has no GIF key", async () => {
    routeGet({ gifs: () => Promise.reject(Object.assign(new Error("off"), { code: "gifs_unavailable", status: 503 })) });
    render(<StickerGifPicker onSend={jest.fn()} />);
    fireEvent.click(screen.getByRole("tab", { name: "GIFs" }));
    await waitFor(() => expect(screen.queryByRole("tab", { name: "GIFs" })).toBeNull());
    expect(await screen.findByRole("button", { name: "Send sticker: Hello" })).toBeInTheDocument();
  });
});

describe("Conversation sticker/GIF messages", () => {
  const me = { id: 1, username: "kostas" };
  const partner = { id: 2, username: "ana" };
  const now = new Date().toISOString();
  const sticker = {
    id: 10,
    kind: "sticker",
    text: "",
    media: { pack: "lumi", id: "wave", label: "Hello", url: "https://example.test/wave.svg" },
    sender: me,
    timestamp: now,
    reactions: [],
  };
  const gif = { id: 11, kind: "gif", text: "", media: GIF, sender: partner, timestamp: now, reactions: [] };
  const reply = {
    id: 12,
    text: "lol",
    sender: me,
    timestamp: now,
    reactions: [],
    reply_to: { id: 11, text: "", kind: "gif", media: GIF, sender: partner },
  };

  test("renders stickers and GIFs without a bubble, with a still frame for reduced motion", () => {
    const { container } = render(
      <Conversation messages={[sticker, gif, reply]} userId={1} onDeleteMessage={jest.fn()} onEditMessage={jest.fn()} />
    );
    expect(screen.getByRole("img", { name: "Sticker: Hello" })).toHaveAttribute("src", sticker.media.url);
    expect(screen.getByRole("img", { name: "GIF: Hello there" })).toHaveAttribute("src", GIF.url);
    expect(container.querySelector('source[media="(prefers-reduced-motion: reduce)"]')).toHaveAttribute("srcset", GIF.still_url);
    expect(container.querySelectorAll(".cv-bubble.is-media")).toHaveLength(2);
    expect(screen.queryByText("Audio message")).toBeNull();
    // The reply quote names the GIF instead of "Attachment".
    expect(within(container.querySelector(".cv-bubble-reply")).getByText("GIF")).toBeInTheDocument();
  });

  test("a sticker can be deleted but not edited", () => {
    render(<Conversation messages={[sticker]} userId={1} onDeleteMessage={jest.fn()} onEditMessage={jest.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Message actions" }));
    expect(screen.getByRole("button", { name: "Delete message" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit message" })).toBeNull();
  });

  test("drops unsafe media URLs", () => {
    const evil = { ...gif, id: 13, media: { ...GIF, url: "javascript:alert(1)", still_url: null } };
    const { container } = render(<Conversation messages={[evil]} userId={1} onDeleteMessage={jest.fn()} />);
    expect(container.querySelector(".cv-gif")).toBeNull();
    expect(screen.getByText("GIF")).toBeInTheDocument();
  });
});
