import { useEffect, useId, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "react-query";
import MoreHorizRoundedIcon from "@mui/icons-material/MoreHorizRounded";
import BlockRoundedIcon from "@mui/icons-material/BlockRounded";
import FlagOutlinedIcon from "@mui/icons-material/FlagOutlined";
import ConfirmDialog from "../../pages/Settings/ConfirmDialog";
import { toast, toastApiError } from "../Toast";
import { useUser } from "../../context/UserContext";
import {
  REPORT_DETAILS_MAX_LENGTH,
  REPORT_REASONS,
  blockUser,
  reportUser,
} from "../../pages/Profile/api/moderation";
import { CONVERSATIONS_LIST_QUERY_KEY } from "../../pages/Conversations/api/conversationListCache";
import "../../pages/Settings/settings.css";
import "./moderation.css";

/**
 * React Query caches that can still show a blocked person. People (usePeopleFeed), the public
 * profile and the own-profile Following card are component state and refetch on mount, so
 * navigating away is what refreshes them.
 */
export const BLOCK_INVALIDATED_QUERY_KEYS = [
  CONVERSATIONS_LIST_QUERY_KEY, // the shared conversations are deleted server-side
  ["conversationMessagesPage"], // history pages of those deleted conversations
  ["followingForGroups"], // GroupPeoplePicker's following list (block removes follows)
];

const ReportDialog = ({ open, name, busy, onSubmit, onClose }) => {
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [alsoBlock, setAlsoBlock] = useState(false);
  const firstRadioRef = useRef(null);
  const detailsId = useId();
  const counterId = useId();
  const groupName = useId();

  useEffect(() => {
    if (!open) return;
    setReason("");
    setDetails("");
    setAlsoBlock(false);
  }, [open]);

  const detailsRequired = reason === "other";
  const valid = Boolean(reason) && (!detailsRequired || details.trim().length > 0);

  return (
    <ConfirmDialog
      open={open}
      title={`Report ${name}`}
      confirmLabel="Submit report"
      busyLabel="Sending…"
      busy={busy}
      confirmDisabled={!valid}
      onConfirm={() => onSubmit({ reason, details: details.trim(), alsoBlock })}
      onClose={onClose}
      initialFocusRef={firstRadioRef}
    >
      <p>Reports are private — {name} won't know who sent it. What's going on?</p>
      <fieldset className="md-reasons">
        <legend className="md-visually-hidden">Reason for reporting {name}</legend>
        {REPORT_REASONS.map((option, index) => (
          <label key={option.value} className="md-reason">
            <input
              ref={index === 0 ? firstRadioRef : undefined}
              type="radio"
              name={groupName}
              value={option.value}
              checked={reason === option.value}
              onChange={() => setReason(option.value)}
              disabled={busy}
            />
            <span className="md-reason-text">
              <span className="md-reason-label">{option.label}</span>
              <span className="md-reason-hint">{option.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="md-field">
        <label htmlFor={detailsId} className="st-dialog-label">
          Details {detailsRequired ? "(required)" : "(optional)"}
        </label>
        <textarea
          id={detailsId}
          className="md-textarea"
          rows={3}
          value={details}
          maxLength={REPORT_DETAILS_MAX_LENGTH}
          onChange={(event) => setDetails(event.target.value.slice(0, REPORT_DETAILS_MAX_LENGTH))}
          required={detailsRequired}
          aria-required={detailsRequired || undefined}
          aria-describedby={counterId}
          placeholder={detailsRequired ? "Tell us what happened" : "Anything that helps us review this"}
          disabled={busy}
        />
        <span id={counterId} className="md-counter">
          {details.length}/{REPORT_DETAILS_MAX_LENGTH} characters
        </span>
      </div>
      <label className="md-check">
        <input
          type="checkbox"
          checked={alsoBlock}
          onChange={(event) => setAlsoBlock(event.target.checked)}
          disabled={busy}
        />
        <span>Also block {name}</span>
      </label>
    </ConfirmDialog>
  );
};

/**
 * "More" (⋯) menu with Report and Block for another member's public profile or a direct chat.
 * Never rendered for yourself; callers also skip Lumi/coach and group chats.
 */
const UserSafetyMenu = ({ username, displayName, triggerClassName = "", afterBlockPath = "/community" }) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user: me } = useUser();
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialog, setDialog] = useState(null); // "block" | "report" | null
  const [busy, setBusy] = useState(false);
  const wrapperRef = useRef(null);
  const triggerRef = useRef(null);
  const itemRefs = useRef([]);
  const busyRef = useRef(false);
  const menuId = useId();
  const name = displayName || username;

  useEffect(() => {
    if (!menuOpen) return undefined;
    itemRefs.current[0]?.focus();
    const handlePointerDown = (event) => {
      if (!wrapperRef.current?.contains(event.target)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [menuOpen]);

  if (!username || (me?.username && me.username.toLowerCase() === String(username).toLowerCase())) {
    return null;
  }

  const closeMenu = ({ restoreFocus = true } = {}) => {
    setMenuOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };

  const handleMenuKeyDown = (event) => {
    const items = itemRefs.current.filter(Boolean);
    const index = items.indexOf(document.activeElement);
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeMenu();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      items[(index + step + items.length) % items.length]?.focus();
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      items[event.key === "Home" ? 0 : items.length - 1]?.focus();
    } else if (event.key === "Tab") {
      setMenuOpen(false);
    }
  };

  const openDialog = (kind) => {
    closeMenu();
    setDialog(kind);
  };

  const closeDialog = () => {
    if (!busyRef.current) setDialog(null);
  };

  const runBlock = async () => {
    try {
      await blockUser(username);
    } catch (err) {
      toastApiError(err, `Couldn't block ${name}`);
      return false;
    }
    BLOCK_INVALIDATED_QUERY_KEYS.forEach((queryKey) => queryClient.invalidateQueries({ queryKey }));
    toast.success(`You blocked ${name}. You can unblock them in Settings.`);
    setDialog(null);
    navigate(afterBlockPath, { replace: true });
    return true;
  };

  const withBusy = async (task) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await task();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const handleConfirmBlock = () => withBusy(runBlock);

  const handleSubmitReport = ({ reason, details, alsoBlock }) =>
    withBusy(async () => {
      try {
        await reportUser(username, { reason, details });
      } catch (err) {
        toastApiError(err, "Couldn't send the report");
        return;
      }
      toast.success("Thanks — we'll review this report.");
      if (alsoBlock) {
        const blocked = await runBlock();
        if (blocked) return;
      }
      setDialog(null);
    });

  return (
    <div className="md-menu" ref={wrapperRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`${triggerClassName} md-trigger`.trim()}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-controls={menuOpen ? menuId : undefined}
        aria-label={`More options for ${name}`}
        title="More"
        onClick={() => setMenuOpen((open) => !open)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && menuOpen) {
            event.preventDefault();
            closeMenu();
          } else if (event.key === "ArrowDown" && !menuOpen) {
            event.preventDefault();
            setMenuOpen(true);
          }
        }}
      >
        <MoreHorizRoundedIcon aria-hidden="true" />
      </button>
      {menuOpen && (
        <div
          id={menuId}
          role="menu"
          aria-label={`Options for ${name}`}
          className="md-menu-list"
          onKeyDown={handleMenuKeyDown}
        >
          <button
            ref={(node) => {
              itemRefs.current[0] = node;
            }}
            type="button"
            role="menuitem"
            className="md-menu-item"
            onClick={() => openDialog("report")}
          >
            <FlagOutlinedIcon aria-hidden="true" />
            Report {name}
          </button>
          <button
            ref={(node) => {
              itemRefs.current[1] = node;
            }}
            type="button"
            role="menuitem"
            className="md-menu-item is-danger"
            onClick={() => openDialog("block")}
          >
            <BlockRoundedIcon aria-hidden="true" />
            Block {name}
          </button>
        </div>
      )}

      <ConfirmDialog
        open={dialog === "block"}
        title={`Block ${name}?`}
        confirmLabel="Block"
        busyLabel="Blocking…"
        busy={busy}
        tone="danger"
        onConfirm={handleConfirmBlock}
        onClose={closeDialog}
      >
        <p>
          They won't be able to message you or find you in People. Your conversations with them will be
          deleted. You can unblock them in Settings.
        </p>
      </ConfirmDialog>
      <ReportDialog
        open={dialog === "report"}
        name={name}
        busy={busy}
        onSubmit={handleSubmitReport}
        onClose={closeDialog}
      />
    </div>
  );
};

export default UserSafetyMenu;
