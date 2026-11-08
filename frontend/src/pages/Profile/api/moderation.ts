import api from "../../../lib/api";

/** Block / report another member (mirrors mobile services/api/auth.ts). */

export type ReportReason =
  | "spam"
  | "harassment"
  | "inappropriate_content"
  | "impersonation"
  | "scam"
  | "other";

export const REPORT_REASONS: { value: ReportReason; label: string; hint: string }[] = [
  { value: "spam", label: "Spam", hint: "Ads, links or the same message again and again" },
  { value: "harassment", label: "Harassment", hint: "Insults, threats or unwanted attention" },
  { value: "inappropriate_content", label: "Inappropriate content", hint: "Sexual, violent or hateful messages or photos" },
  { value: "impersonation", label: "Impersonation", hint: "Pretending to be someone else" },
  { value: "scam", label: "Scam or fraud", hint: "Asking for money, payments or personal details" },
  { value: "other", label: "Other", hint: "Something else — tell us below" },
];

/** report_user_view keeps `details[:2000]`; enforce the same limit before sending. */
export const REPORT_DETAILS_MAX_LENGTH = 2000;

const blockPath = (username: string) => `/api/profile/public/${encodeURIComponent(username)}/block/`;

/** POST block/ -> {message, is_blocked_by_me}. Deletes every conversation between the pair. */
export const blockUser = (username: string) =>
  api.post<{ message: string; is_blocked_by_me: boolean }>(blockPath(username));

/** DELETE block/ -> {message, is_blocked_by_me: false}. */
export const unblockUser = (username: string) =>
  api.delete<{ message: string; is_blocked_by_me: boolean }>(blockPath(username));

/** POST report/ -> 201 {message}. `details` is required for "other". */
export const reportUser = (username: string, { reason, details = "" }: { reason: ReportReason; details?: string }) =>
  api.post<{ message: string }>(`/api/profile/public/${encodeURIComponent(username)}/report/`, {
    reason,
    details: details.trim().slice(0, REPORT_DETAILS_MAX_LENGTH),
  });
