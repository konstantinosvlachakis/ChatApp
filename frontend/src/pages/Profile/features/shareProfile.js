import { toast } from "../../../components/Toast";
import { logger } from "../../../lib/logger";

export const profileLink = (username) =>
  `${window.location.origin}/people/${encodeURIComponent(username || "")}`;

// Native share sheet where there is one (phones), otherwise copy the link.
export const shareProfileLink = async (username) => {
  const url = profileLink(username);
  if (navigator.share) {
    try {
      await navigator.share({ title: `${username} on LangVoyage`, url });
      return;
    } catch (error) {
      if (error?.name === "AbortError") return;
      logger.warn("Share failed, falling back to copy:", error);
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    toast.success("Profile link copied.");
  } catch (error) {
    logger.warn("Copy profile link failed:", error);
    toast.error("Couldn't copy the link.");
  }
};
