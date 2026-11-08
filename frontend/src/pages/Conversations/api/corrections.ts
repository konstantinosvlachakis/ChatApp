import api from "../../../lib/api";
import { trackEvent } from "../../../lib/analytics";

/** Partner corrections on chat messages (backend `chatapp/learning_views.py`). */
export const CORRECTION_MAX_LENGTH = 5000;
export const CORRECTION_NOTE_MAX_LENGTH = 500;

export type CorrectionPreference = "often" | "when_asked" | "off";

export type MessageCorrection = {
  id: number;
  corrector: { id: number; username: string };
  corrected_text: string;
  note: string;
  created_at: string;
  updated_at: string;
};

/** Create or replace the caller's correction. Returns the updated Message. */
export const saveCorrection = (messageId: number, correctedText: string, note = "") =>
  api.post<Record<string, unknown>>(`/api/messages/${messageId}/correction/`, {
    corrected_text: correctedText,
    note,
  }).then((message) => {
    trackEvent("correction_made");
    return message;
  });

/** Remove the caller's correction. Returns the updated Message. */
export const removeCorrection = (messageId: number) =>
  api.delete<Record<string, unknown>>(`/api/messages/${messageId}/correction/`);

/** Sender only: ask for (or stop asking for) corrections. Returns the updated Message. */
export const setCorrectionRequested = (messageId: number, requested: boolean) =>
  api.post<Record<string, unknown>>(`/api/messages/${messageId}/correction-request/`, { requested });
