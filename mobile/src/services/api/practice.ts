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
  /** Absolute photo URL (null = default avatar / initials). */
  profile_image_url?: string | null;
};

export type PracticeChallenge = {
  id: string;
  sentence?: string;
  sentence_parts?: string[];
  answer?: string;
  options?: string[];
  hint?: string;
  difficulty_bucket?: number;
  language?: string;
  source?: string;
  /** True on the first item of a new round (every library sentence of this level was seen). */
  round_complete?: boolean;
};

/** Per-language difficulty (server `progress`); XP/level stay the motivational score. */
export type PracticeLanguageProgress = {
  language: string;
  /** 1-3 */
  bucket: number;
  max_bucket: number;
  /** "Basics" | "Everyday grammar" | "Advanced grammar" */
  bucket_label: string;
  /** "A1" | "A2–B1" | "B1–B2" */
  cefr: string;
  attempts_in_bucket: number;
  window_size: number;
  /** 0-1 over the recent answers in this bucket, null before the first answer. */
  window_accuracy: number | null;
  /** null at the top bucket. */
  needed_for_promotion: {
    attempts_remaining: number;
    min_attempts: number;
    accuracy_target: number;
  } | null;
  can_promote: boolean;
  /** Set only on the submit that moved the bucket. */
  change: "promoted" | "demoted" | null;
};

export type PracticeStateResponse = {
  language: string;
  stats: PracticeStats | null;
  progress?: PracticeLanguageProgress | null;
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
  already_scored?: boolean;
  daily_xp_limit_reached?: boolean;
  language: string;
  stats: PracticeStats | null;
  progress?: PracticeLanguageProgress | null;
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

/** Voice Repeat sentence from the server library (`GET /practice/voice/next/`). */
export type VoiceSentence = {
  /** `voice:<language>:<bucket>:<index>`; send it back to `completeVoiceSentence`. */
  id: string;
  text: string;
  language: string;
  bucket: number;
  /** True on the first sentence of a new round (every sentence of this level was served). */
  round_complete: boolean;
  /** Minimum match score the server accepts (mirrors requiredSpeechMatchThreshold). */
  pass_threshold?: number;
  /** Optional English gloss. */
  translation_hint?: string;
};

export type VoiceCompleteResponse = {
  id: string;
  language: string;
  passed: boolean;
  pass_threshold: number;
  awarded_xp: number;
  awarded_points: number;
  already_scored: boolean;
  daily_limit_reached: boolean;
  daily_voice_limit_reached: boolean;
  daily_xp_limit_reached: boolean;
  /** Awards are off while the server cache is down (nothing was awarded). */
  awards_unavailable: boolean;
  reason: string;
  stats: PracticeStats | null;
  leaderboard: PracticeLeaderboardEntry[];
  current_rank: number | null;
};

export async function fetchVoiceSentence(language?: string) {
  const response = await api.get<VoiceSentence>("/practice/voice/next/", {
    params: language ? { language } : undefined,
  });
  return response.data;
}

/** Claim XP for a passed sentence (`score` 0-1); capped and checked server-side. */
export async function completeVoiceSentence(id: string, score: number) {
  const response = await api.post<VoiceCompleteResponse>("/practice/voice/complete/", {
    id,
    score,
  });
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
