import { draftStorageKeyFor, saveChatDraft, takeDraftFocusRequest } from "./chatDrafts";

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

test("saves a draft under the key MessageInput reads", () => {
  expect(saveChatDraft(42, "Hi! Want to practise together?")).toBe(true);
  expect(localStorage.getItem(draftStorageKeyFor(42))).toBe("Hi! Want to practise together?");
  expect(draftStorageKeyFor(42)).toBe("chat:draft:42");
});

test("a focus request is taken once", () => {
  saveChatDraft(7, "Hello", { focus: true });
  expect(takeDraftFocusRequest(7)).toBe(true);
  expect(takeDraftFocusRequest(7)).toBe(false);
});

test("no focus request without the option, and nothing saved without text or id", () => {
  saveChatDraft(7, "Hello");
  expect(takeDraftFocusRequest(7)).toBe(false);
  expect(saveChatDraft(null, "Hello")).toBe(false);
  expect(saveChatDraft(7, "")).toBe(false);
});
