import { QueryClient } from "react-query";
import { CONVERSATIONS_LIST_QUERY_KEY } from "./conversationListCache";
import {
  CONVERSATION_LIST_REFETCH_DEBOUNCE_MS,
  CONVERSATION_LIST_STALE_AFTER_HIDDEN_MS,
  applyConversationUpdateToList,
  createTrailingDebounce,
  resolveConversationUpdate,
  shouldRefetchConversationList,
  shouldRefetchListOnFocus,
} from "./conversationListRefetch";

const ME = 1;
const PARTNER = 2;

const update = (trigger, conversationId, actorId) => ({
  type: "conversation_update",
  conversation_id: conversationId,
  trigger,
  actor_id: actorId,
});

const makeList = () => [
  {
    id: 10,
    unread_count: 3,
    last_message: { id: 100, text: "hi", status: "delivered", sender: { id: PARTNER } },
  },
  {
    id: 20,
    unread_count: 0,
    last_message: { id: 200, text: "yo", status: "delivered", sender: { id: ME } },
  },
];

const makeClient = (list = makeList()) => {
  const queryClient = new QueryClient();
  if (list) queryClient.setQueryData(CONVERSATIONS_LIST_QUERY_KEY, list);
  return queryClient;
};

const findConversation = (queryClient, id) =>
  queryClient.getQueryData(CONVERSATIONS_LIST_QUERY_KEY).find((conversation) => conversation.id === id);

describe("resolveConversationUpdate", () => {
  const context = { currentUserId: ME, activeConversationId: "10" };

  it("ignores other event types", () => {
    expect(resolveConversationUpdate({ type: "presence_update" }, context)).toBe("ignore");
    expect(resolveConversationUpdate(null, context)).toBe("ignore");
  });

  it("splits messages_read by actor", () => {
    expect(resolveConversationUpdate(update("messages_read", 20, ME), context)).toBe("self_read");
    expect(resolveConversationUpdate(update("messages_read", 20, PARTNER), context)).toBe("partner_read");
    expect(resolveConversationUpdate(update("messages_read", 20, null), context)).toBe("refetch");
  });

  it("leaves chat-socket triggers of the open conversation to ChatRoom", () => {
    ["message_created", "message_updated", "message_deleted", "message_pinned", "message_unpinned"].forEach(
      (trigger) => {
        expect(resolveConversationUpdate(update(trigger, 10, PARTNER), context)).toBe("open_chat");
        expect(resolveConversationUpdate(update(trigger, 20, PARTNER), context)).toBe("refetch");
      }
    );
  });

  it("refetches unknown triggers and missing ids", () => {
    expect(resolveConversationUpdate(update("something_new", 10, ME), context)).toBe("refetch");
    expect(resolveConversationUpdate(update("message_created", null, ME), context)).toBe("refetch");
  });
});

describe("shouldRefetchConversationList", () => {
  it("refetches when the change wasn't applied locally", () => {
    expect(shouldRefetchConversationList("ignore", false)).toBe(false);
    expect(shouldRefetchConversationList("refetch", true)).toBe(true);
    expect(shouldRefetchConversationList("self_read", true)).toBe(false);
    expect(shouldRefetchConversationList("self_read", false)).toBe(true);
    expect(shouldRefetchConversationList("open_chat", false)).toBe(true);
  });
});

describe("applyConversationUpdateToList", () => {
  it("incoming message in another conversation refetches", () => {
    const queryClient = makeClient();
    expect(
      applyConversationUpdateToList(queryClient, update("message_created", 20, PARTNER), {
        currentUserId: ME,
        activeConversationId: "10",
      })
    ).toBe(true);
  });

  it("own message from another tab refetches unless that chat is open here", () => {
    const queryClient = makeClient();
    const event = update("message_created", 20, ME);
    expect(applyConversationUpdateToList(queryClient, event, { currentUserId: ME })).toBe(true);
    expect(
      applyConversationUpdateToList(queryClient, event, { currentUserId: ME, activeConversationId: 20 })
    ).toBe(false);
  });

  it("a conversation not in the cache (brand new) refetches even when open", () => {
    const queryClient = makeClient();
    expect(
      applyConversationUpdateToList(queryClient, update("message_created", 30, PARTNER), {
        currentUserId: ME,
        activeConversationId: "30",
      })
    ).toBe(true);
    expect(
      applyConversationUpdateToList(makeClient(null), update("messages_read", 10, ME), { currentUserId: ME })
    ).toBe(true);
  });

  it("my read zeroes unread without a refetch", () => {
    const queryClient = makeClient();
    expect(applyConversationUpdateToList(queryClient, update("messages_read", 10, ME), { currentUserId: ME })).toBe(
      false
    );
    expect(findConversation(queryClient, 10).unread_count).toBe(0);
  });

  it("partner read marks my last message read without a refetch", () => {
    const queryClient = makeClient();
    const context = { currentUserId: ME };
    expect(applyConversationUpdateToList(queryClient, update("messages_read", 20, PARTNER), context)).toBe(false);
    expect(findConversation(queryClient, 20).last_message.status).toBe("read");
    // Their read doesn't touch my unread count or their own last message.
    expect(applyConversationUpdateToList(queryClient, update("messages_read", 10, PARTNER), context)).toBe(false);
    expect(findConversation(queryClient, 10)).toEqual(makeList()[0]);
  });

  it("edits/deletes/pins in a closed conversation refetch", () => {
    const queryClient = makeClient();
    ["message_updated", "message_deleted", "message_pinned", "message_unpinned"].forEach((trigger) => {
      expect(
        applyConversationUpdateToList(queryClient, update(trigger, 20, PARTNER), {
          currentUserId: ME,
          activeConversationId: "10",
        })
      ).toBe(true);
    });
  });
});

describe("createTrailingDebounce", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("coalesces a burst into one trailing call", () => {
    const callback = jest.fn();
    const debounced = createTrailingDebounce(callback, CONVERSATION_LIST_REFETCH_DEBOUNCE_MS);
    debounced();
    jest.advanceTimersByTime(1500);
    debounced();
    debounced();
    jest.advanceTimersByTime(1999);
    expect(callback).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("cancel drops and flush runs a pending call", () => {
    const callback = jest.fn();
    const debounced = createTrailingDebounce(callback, 2000);
    debounced();
    debounced.cancel();
    jest.advanceTimersByTime(5000);
    expect(callback).not.toHaveBeenCalled();

    debounced.flush();
    expect(callback).not.toHaveBeenCalled();
    debounced();
    expect(debounced.isPending()).toBe(true);
    debounced.flush();
    expect(callback).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(5000);
    expect(callback).toHaveBeenCalledTimes(1);
  });
});

describe("shouldRefetchListOnFocus", () => {
  const now = 1_000_000;

  it("skips a plain focus", () => {
    expect(shouldRefetchListOnFocus({ now })).toBe(false);
    expect(shouldRefetchListOnFocus({ hiddenAt: now - 30 * 1000, now })).toBe(false);
  });

  it("refetches after a missed update or a long hidden period", () => {
    expect(shouldRefetchListOnFocus({ missedUpdate: true, now })).toBe(true);
    expect(
      shouldRefetchListOnFocus({ hiddenAt: now - CONVERSATION_LIST_STALE_AFTER_HIDDEN_MS - 1, now })
    ).toBe(true);
  });
});
