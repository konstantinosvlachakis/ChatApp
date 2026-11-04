import { api } from "../../../lib/api";

export type Sticker = { id: string; ref: string; label: string; url: string };
export type StickerPack = { id: string; name: string; stickers: Sticker[] };
export type GifMedia = {
  provider: "giphy";
  id: string;
  title: string;
  url: string;
  preview_url: string;
  still_url: string | null;
  width: number;
  height: number;
};
export type GifPage = { results: GifMedia[]; next_offset: number | null; attribution: string };

// The packs only change with a deploy: fetch once per page load.
let stickerPacksPromise: Promise<StickerPack[]> | null = null;

export const fetchStickerPacks = (): Promise<StickerPack[]> => {
  if (!stickerPacksPromise) {
    stickerPacksPromise = api
      .get<{ packs: StickerPack[] }>("/api/stickers/")
      .then((data) => data?.packs || [])
      .catch((error) => {
        stickerPacksPromise = null; // let the next open retry
        throw error;
      });
  }
  return stickerPacksPromise;
};

export const resetStickerPacksCache = () => {
  stickerPacksPromise = null;
};

export const fetchGifs = (
  { query = "", offset = 0 }: { query?: string; offset?: number },
  signal?: AbortSignal
): Promise<GifPage> => {
  const params = new URLSearchParams();
  if (query.trim()) params.set("q", query.trim());
  if (offset) params.set("offset", String(offset));
  const suffix = params.toString() ? `?${params}` : "";
  // One attempt: 503 `gifs_unavailable` means "no key", and retries would only
  // spend the GIPHY quota while the user types.
  return api.get<GifPage>(`/api/gifs/${suffix}`, { signal, maxAttempts: 1 });
};
