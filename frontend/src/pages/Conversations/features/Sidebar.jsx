import React, { useState } from "react";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import GroupAddRoundedIcon from "@mui/icons-material/GroupAddRounded";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "react-query";
import { toast } from "../../../components/Toast";
import { CONVERSATIONS_LIST_QUERY_KEY } from "../api/conversationListCache";
import ConversationList from "../features/ConversationList";
import GroupPeoplePicker from "./GroupPeoplePicker";

function Sidebar({
  onSelectConversation,
  activeConversationId,
  typingByConversation,
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [creatingGroup, setCreatingGroup] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return (
    <div className="cv-list">
      <div className="cv-list-head">
        <div className="cv-list-title">
          <h1>Conversations</h1>
          <button
            type="button"
            className="cv-icon-button cv-new-group"
            onClick={() => setCreatingGroup(true)}
            aria-label="New group chat"
            title="New group chat"
          >
            <GroupAddRoundedIcon />
          </button>
        </div>
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

      {creatingGroup && (
        <GroupPeoplePicker
          mode="create"
          onClose={() => setCreatingGroup(false)}
          onDone={(group) => {
            setCreatingGroup(false);
            queryClient.invalidateQueries({ queryKey: CONVERSATIONS_LIST_QUERY_KEY });
            toast.success("Group created. Invites are on their way.");
            if (group?.id) navigate(`/conversations/${group.id}`);
          }}
        />
      )}

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
