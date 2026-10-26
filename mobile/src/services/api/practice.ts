import { api } from "./client";

export type PracticeStats = {
  points: number;
  xp: number;
  level: number;
  correct_answers: number;
  total_answers: number;
  accuracy: number;
  preferred_language?: string;
};

export type PracticeLeaderboardEntry = {
  rank: number;
  username: string;
  points: number;
  level: number;
  xp: number;
  is_current_user?: boolean;
};

export type PracticeChallenge = {
  id: string;
  sentence?: string;
  sentence_parts?: string[];
  answer?: string;
  options?: string[];
  hint?: string;
  source?: string;
};

export type PracticeStateResponse = {
  language: string;
  stats: PracticeStats | null;
  leaderboard: PracticeLeaderboardEntry[];
  current_rank: number | null;
};

export type PracticeChallengeResponse = {
  language: string;
  challenge: PracticeChallenge | null;
  stats: PracticeStats | null;
};

export type PracticeSubmitResponse = {
  correct: boolean;
  correct_answer: string;
  awarded_xp: number;
  awarded_points: number;
  language: string;
  stats: PracticeStats | null;
  leaderboard: PracticeLeaderboardEntry[];
  current_rank: number | null;
};

export async function fetchPracticeState(language?: string) {
  const response = await api.get<PracticeStateResponse>("/practice/state/", {
    params: language ? { language } : undefined,
  });
  return response.data;
}

export async function fetchPracticeChallenge(language?: string) {
  const response = await api.get<PracticeChallengeResponse>("/practice/challenge/", {
    params: language ? { language } : undefined,
  });
  return response.data;
}

export async function submitPracticeAnswer(payload: {
  challenge_id: string;
  selected_word: string;
  language: string;
}) {
  const response = await api.post<PracticeSubmitResponse>("/practice/submit/", payload);
  return response.data;
}

export async function translatePracticeSentence(text: string, targetLanguage: string) {
  const response = await api.post<{
    translated_text?: string;
    same_language?: boolean;
  }>("/messages/translate/", {
    text,
    target_language: targetLanguage,
  });
  return response.data;
}
