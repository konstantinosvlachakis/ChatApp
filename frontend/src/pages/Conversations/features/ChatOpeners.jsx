import React, { useEffect, useState } from "react";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import ChatBubbleOutlineRoundedIcon from "@mui/icons-material/ChatBubbleOutlineRounded";
import api, { isAbortError } from "../../../lib/api";

// One fetch per chat per page load: the server caches AI lines for a week anyway.
const openersByConversation = new Map();

/** Test helper: forget fetched lines. */
export const resetChatOpenersCache = () => openersByConversation.clear();

/**
 * Empty-chat ideas: three opening lines from `GET /api/conversations/<id>/openers/` (AI, or
 * rule-based when AI isn't available). Picking one hands it to the composer as a draft.
 */
const ChatOpeners = ({ conversationId, onPick }) => {
  const [openers, setOpeners] = useState(() => openersByConversation.get(conversationId) || null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (openersByConversation.has(conversationId)) {
      setOpeners(openersByConversation.get(conversationId));
      return undefined;
    }
    const controller = new AbortController();
    setOpeners(null);
    setFailed(false);
    api
      .get(`/api/conversations/${conversationId}/openers/`, { signal: controller.signal })
      .then((data) => {
        const lines = Array.isArray(data?.openers) ? data.openers.filter((line) => typeof line === "string") : [];
        openersByConversation.set(conversationId, lines);
        setOpeners(lines);
      })
      .catch((error) => {
        if (!isAbortError(error)) setFailed(true);
      });
    return () => controller.abort();
  }, [conversationId]);

  if (failed || (openers && !openers.length)) {
    return <p className="cv-messages-status">No messages yet. Say hello!</p>;
  }

  return (
    <section className="cv-openers" aria-labelledby="cv-openers-title">
      <span className="cv-openers-icon" aria-hidden="true">
        <AutoAwesomeOutlinedIcon />
      </span>
      <h2 id="cv-openers-title">Start the conversation</h2>
      <p>Pick a line to put it in your message box. You can edit it before sending.</p>
      {openers ? (
        <ul className="cv-openers-list">
          {openers.map((line) => (
            <li key={line}>
              <button type="button" className="cv-opener" onClick={() => onPick(line)}>
                <ChatBubbleOutlineRoundedIcon aria-hidden="true" />
                <span>{line}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="cv-openers-list" role="status" aria-label="Finding opening lines">
          <span className="cv-opener-skeleton" />
          <span className="cv-opener-skeleton" />
          <span className="cv-opener-skeleton" />
        </div>
      )}
    </section>
  );
};

export default ChatOpeners;
