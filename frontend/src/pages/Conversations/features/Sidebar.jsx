import React, { useState } from "react";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import ConversationList from "../features/ConversationList";

function Sidebar({
  onSelectConversation,
  activeConversationId,
  typingByConversation,
}) {
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <div className="cv-list">
      <div className="cv-list-head">
        <h1>Conversations</h1>
        <div className="cv-search" role="search">
          <SearchRoundedIcon aria-hidden="true" />
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && searchQuery) {
                event.stopPropagation();
                setSearchQuery("");
              }
            }}
            placeholder="Search conversations"
            aria-label="Search conversations"
          />
          {searchQuery && (
            <button
              type="button"
              className="cv-icon-button is-plain cv-search-clear"
              onClick={() => setSearchQuery("")}
              aria-label="Clear search"
            >
              <CloseRoundedIcon />
            </button>
          )}
        </div>
      </div>

      <div className="cv-list-scroll">
        <ConversationList
          onSelectConversation={onSelectConversation}
          activeConversationId={activeConversationId}
          typingByConversation={typingByConversation}
          searchQuery={searchQuery}
        />
      </div>
    </div>
  );
}

export default React.memo(Sidebar);
