import { useInfiniteQuery, useQuery } from "react-query";
import api from "../../../lib/api";

/** Phrasebook endpoints (backend `chatapp/learning_views.py`, `chatapp/phrasebook.py`). */

export type PhraseSource = "manual" | "message" | "translation" | "correction";
export type ReviewResult = "again" | "hard" | "good" | "easy";

export type PhrasebookEntry = {
  id: number;
  text: string;
  meaning: string;
  note: string;
  context: string;
  language: string;
  source: PhraseSource;
  source_message_id: number | null;
  source_conversation_id: number | null;
  created_at: string;
  updated_at: string;
  due_at: string;
  interval_days: number;
  repetitions: number;
  lapses: number;
  review_count: number;
  last_reviewed_at: string | null;
};

export type PhrasebookPage = {
  entries: PhrasebookEntry[];
  pagination: {
    page: number;
    page_size: number;
    total_pages: number;
    total_count: number;
    has_next: boolean;
    has_previous: boolean;
  };
  due_count: number;
  languages: string[];
};

export type ReviewBatch = {
  cards: PhrasebookEntry[];
  due_count: number;
  total_count: number;
  reviewed_today: number;
  next_due_at: string | null;
};

export type SavePhraseResult = { entry: PhrasebookEntry; created: boolean };

export const PHRASEBOOK_PAGE_SIZE = 30;

/** Every phrasebook query starts with this key: invalidate it after any write. */
export const PHRASEBOOK_QUERY_KEY = ["phrasebook"] as const;
export const phrasebookListKey = (q: string, language: string) => ["phrasebook", "list", { q, language }] as const;
export const PHRASEBOOK_SUMMARY_KEY = ["phrasebook", "summary"] as const;
export const PHRASEBOOK_REVIEW_KEY = ["phrasebook", "review"] as const;

export const getPhrasebookPage = (params: { page?: number; pageSize?: number; q?: string; language?: string }) =>
  api.get<PhrasebookPage>("/api/phrasebook/", {
    params: {
      page: params.page || 1,
      page_size: params.pageSize || PHRASEBOOK_PAGE_SIZE,
      q: params.q || undefined,
      language: params.language || undefined,
    },
  });

/** Save from a chat message: its text, its translation or a correction (`correction_id`). */
export const savePhraseFromMessage = (body: {
  message_id: number;
  source: Exclude<PhraseSource, "manual">;
  correction_id?: number;
  text?: string;
  meaning?: string;
  note?: string;
  language?: string;
}) => api.post<SavePhraseResult>("/api/phrasebook/", body);

export const addManualPhrase = (body: {
  text: string;
  meaning?: string;
  note?: string;
  context?: string;
  language?: string;
}) => api.post<SavePhraseResult>("/api/phrasebook/", body);

export const updatePhrase = (
  id: number,
  body: Partial<Pick<PhrasebookEntry, "text" | "meaning" | "note" | "language">>
) => api.patch<{ entry: PhrasebookEntry }>(`/api/phrasebook/${id}/`, body);

export const deletePhrase = (id: number) => api.delete(`/api/phrasebook/${id}/`);

export const getReviewBatch = () => api.get<ReviewBatch>("/api/phrasebook/review/");

export const reviewPhrase = (id: number, result: ReviewResult) =>
  api.post<{ entry: PhrasebookEntry; due_count: number }>(`/api/phrasebook/${id}/review/`, { result });

/** Paginated list for the Phrasebook page ("Load more" via `has_next`). */
export const usePhrasebookList = (q: string, language: string) =>
  useInfiniteQuery<PhrasebookPage>({
    queryKey: phrasebookListKey(q, language),
    queryFn: ({ pageParam = 1 }) => getPhrasebookPage({ page: pageParam, q, language }),
    getNextPageParam: (last) => (last?.pagination?.has_next ? last.pagination.page + 1 : undefined),
    keepPreviousData: true,
    useErrorBoundary: false,
  });

/** Due / total counts for entry points (Practice card). One-entry page keeps it cheap. */
export const usePhrasebookSummary = (enabled = true) =>
  useQuery({
    queryKey: PHRASEBOOK_SUMMARY_KEY,
    queryFn: () => getPhrasebookPage({ page: 1, pageSize: 1 }),
    select: (page: PhrasebookPage) => ({
      dueCount: page?.due_count ?? 0,
      totalCount: page?.pagination?.total_count ?? 0,
    }),
    enabled,
    staleTime: 60 * 1000,
    useErrorBoundary: false,
  });
