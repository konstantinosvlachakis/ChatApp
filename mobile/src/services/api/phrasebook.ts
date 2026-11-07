import { api } from "./client";
import type {
  PhrasebookEntry,
  PhrasebookPage,
  PhrasebookReviewBatch,
  PhrasebookReviewResult,
} from "../../types";

export type PhrasebookQuery = { page?: number; pageSize?: number; q?: string; language?: string };

/** Newest first; `due_count` and `languages` describe the whole phrasebook. */
export async function fetchPhrasebook(query: PhrasebookQuery = {}, signal?: AbortSignal): Promise<PhrasebookPage> {
  const params: Record<string, string | number> = {};
  if (query.page) params.page = query.page;
  if (query.pageSize) params.page_size = query.pageSize;
  if (query.q?.trim()) params.q = query.q.trim();
  if (query.language) params.language = query.language;
  const response = await api.get<PhrasebookPage>("/phrasebook/", { params, signal });
  return response.data;
}

export type SaveFromChatInput = {
  messageId: number;
  source: "message" | "translation" | "correction";
  correctionId?: number;
  /** Excerpt that must occur in the source text. */
  text?: string;
  meaning?: string;
  note?: string;
  language?: string;
};

export type SavedPhrase = { entry: PhrasebookEntry; created: boolean };

/** Save a chat message, its translation or a correction. `created: false` = already saved. */
export async function savePhraseFromChat(input: SaveFromChatInput): Promise<SavedPhrase> {
  const body: Record<string, unknown> = { message_id: input.messageId, source: input.source };
  if (input.correctionId != null) body.correction_id = input.correctionId;
  if (input.text) body.text = input.text;
  if (input.meaning) body.meaning = input.meaning;
  if (input.note) body.note = input.note;
  if (input.language) body.language = input.language;
  const response = await api.post<SavedPhrase>("/phrasebook/", body);
  return { entry: response.data.entry, created: Boolean(response.data.created) };
}

export type PhraseFields = { text: string; meaning?: string; note?: string; context?: string; language?: string };

/** Manual entry. `created: false` = the same text is already saved. */
export async function addPhrase(fields: PhraseFields): Promise<SavedPhrase> {
  const response = await api.post<SavedPhrase>("/phrasebook/", fields);
  return { entry: response.data.entry, created: Boolean(response.data.created) };
}

export async function updatePhrase(
  entryId: number,
  fields: Partial<Pick<PhraseFields, "text" | "meaning" | "note" | "language">>
): Promise<PhrasebookEntry> {
  const response = await api.patch<{ entry: PhrasebookEntry }>(`/phrasebook/${entryId}/`, fields);
  return response.data.entry;
}

export async function deletePhrase(entryId: number): Promise<void> {
  await api.delete(`/phrasebook/${entryId}/`);
}

/** Up to 20 due cards plus the review summary. */
export async function fetchPhrasebookReview(): Promise<PhrasebookReviewBatch> {
  const response = await api.get<PhrasebookReviewBatch>("/phrasebook/review/");
  return response.data;
}

export async function submitPhraseReview(
  entryId: number,
  result: PhrasebookReviewResult
): Promise<{ entry: PhrasebookEntry; due_count: number }> {
  const response = await api.post<{ entry: PhrasebookEntry; due_count: number }>(
    `/phrasebook/${entryId}/review/`,
    { result }
  );
  return response.data;
}
