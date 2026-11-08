import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import UserSafetyMenu from "./UserSafetyMenu";
import ChatHeader from "../../pages/Conversations/features/ChatHeader";
import api from "../../lib/api";
import { clearToasts, getToasts } from "../Toast/toastStore";
import { ApiError } from "../../lib/apiError";

jest.mock("../../lib/api", () => {
  const actual = jest.requireActual("../../lib/apiError");
  const client = { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn(), upload: jest.fn() };
  return {
    __esModule: true,
    default: client,
    api: client,
    getErrorMessage: actual.getErrorMessage,
    isApiError: actual.isApiError,
    isAbortError: () => false,
  };
});

const mockMe = { user_id: 1, username: "kostas" };
jest.mock("../../context/UserContext", () => ({ useUser: () => ({ user: mockMe, setUser: () => {} }) }));
jest.mock("../../context/PresenceContext", () => ({ usePresence: () => ({ onlineUserIds: new Set() }) }));

const renderWithProviders = (ui, { path = "/people/maria", routePath = "/people/:username" } = {}) => {
  const queryClient = new QueryClient();
  const invalidate = jest.spyOn(queryClient, "invalidateQueries");
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={routePath} element={ui} />
          <Route path="/community" element={<p>Community page</p>} />
          <Route path="/conversations" element={<p>Conversations page</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
  return { ...utils, invalidate };
};

const openMenu = () => fireEvent.click(screen.getByRole("button", { name: "More options for maria" }));
const toastMessages = () => getToasts().map((entry) => entry.message);

beforeEach(() => {
  jest.clearAllMocks();
  act(() => clearToasts());
});

describe("UserSafetyMenu", () => {
  test("opens and closes the menu with the trigger, Escape and an outside click", () => {
    renderWithProviders(<UserSafetyMenu username="maria" />);
    const trigger = screen.getByRole("button", { name: "More options for maria" });
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(trigger);
    const menu = screen.getByRole("menu");
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(within(menu).getByRole("menuitem", { name: "Report maria" })).toHaveFocus();
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(within(menu).getByRole("menuitem", { name: "Block maria" })).toHaveFocus();

    fireEvent.keyDown(menu, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    fireEvent.click(trigger);
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  test("block confirm POSTs, invalidates caches, toasts and navigates away", async () => {
    api.post.mockResolvedValue({ message: "Blocked", is_blocked_by_me: true });
    const { invalidate } = renderWithProviders(<UserSafetyMenu username="maria" afterBlockPath="/community" />);
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Block maria" }));

    expect(screen.getByRole("heading", { name: "Block maria?" })).toBeInTheDocument();
    expect(
      screen.getByText(/They won't be able to message you or find you in People\. Your conversations with them will be deleted\. You can unblock them in Settings\./)
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Block" }));

    expect(await screen.findByText("Community page")).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledWith("/api/profile/public/maria/block/");
    const keys = invalidate.mock.calls.map(([arg]) => arg.queryKey);
    expect(keys).toEqual(
      expect.arrayContaining([["conversationsList"], ["conversationMessagesPage"], ["followingForGroups"]])
    );
    expect(toastMessages()).toContain("You blocked maria. You can unblock them in Settings.");
  });

  test("a throttled block shows the server message and stays put", async () => {
    api.post.mockRejectedValue(new ApiError({ status: 429, code: "throttled", message: "Slow down, please." }));
    renderWithProviders(<UserSafetyMenu username="maria" />);
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Block maria" }));
    fireEvent.click(screen.getByRole("button", { name: "Block" }));

    await waitFor(() => expect(toastMessages()).toContain("Couldn't block maria: Slow down, please."));
    expect(screen.queryByText("Community page")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Block maria?" })).toBeInTheDocument();
  });

  test("report requires a reason, and details for Other, then sends the payload", async () => {
    api.post.mockResolvedValue({ message: "Report submitted for maria." });
    renderWithProviders(<UserSafetyMenu username="maria" />);
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Report maria" }));

    const submit = screen.getByRole("button", { name: "Submit report" });
    expect(submit).toBeDisabled();
    expect(screen.getAllByRole("radio")).toHaveLength(6);

    fireEvent.click(screen.getByRole("radio", { name: /^Other/ }));
    expect(submit).toBeDisabled();
    const details = screen.getByRole("textbox", { name: "Details (required)" });
    expect(details).toHaveAttribute("maxLength", "2000");
    fireEvent.change(details, { target: { value: "   " } });
    expect(submit).toBeDisabled();
    fireEvent.change(details, { target: { value: "  Asked for my bank details  " } });
    expect(screen.getByText("29/2000 characters")).toBeInTheDocument();
    expect(submit).toBeEnabled();

    fireEvent.click(submit);
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Report maria" })).not.toBeInTheDocument());
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith("/api/profile/public/maria/report/", {
      reason: "other",
      details: "Asked for my bank details",
    });
    expect(toastMessages()).toContain("Thanks — we'll review this report.");
    expect(screen.queryByText("Community page")).not.toBeInTheDocument();
  });

  test("a reason other than Other can be sent without details", async () => {
    api.post.mockResolvedValue({ message: "ok" });
    renderWithProviders(<UserSafetyMenu username="maria" />);
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Report maria" }));
    fireEvent.click(screen.getByRole("radio", { name: /^Spam/ }));
    expect(screen.getByRole("textbox", { name: "Details (optional)" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Submit report" }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/api/profile/public/maria/report/", { reason: "spam", details: "" })
    );
  });

  test("'Also block' blocks after a successful report", async () => {
    api.post.mockResolvedValueOnce({ message: "Reported" }).mockResolvedValueOnce({ message: "Blocked", is_blocked_by_me: true });
    renderWithProviders(<UserSafetyMenu username="maria" afterBlockPath="/conversations" />);
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Report maria" }));
    fireEvent.click(screen.getByRole("radio", { name: /^Harassment/ }));
    const alsoBlock = screen.getByRole("checkbox", { name: "Also block maria" });
    expect(alsoBlock).not.toBeChecked();
    fireEvent.click(alsoBlock);
    fireEvent.click(screen.getByRole("button", { name: "Submit report" }));

    expect(await screen.findByText("Conversations page")).toBeInTheDocument();
    expect(api.post.mock.calls.map(([path]) => path)).toEqual([
      "/api/profile/public/maria/report/",
      "/api/profile/public/maria/block/",
    ]);
  });

  test("is not rendered for your own username", () => {
    renderWithProviders(<UserSafetyMenu username="Kostas" />);
    expect(screen.queryByRole("button", { name: /More options/ })).not.toBeInTheDocument();
  });
});

describe("ChatHeader overflow menu", () => {
  const direct = {
    id: 7,
    kind: "direct",
    sender: { id: 1, username: "kostas" },
    receiver: { id: 2, username: "maria" },
  };

  const renderHeader = (conversation) =>
    renderWithProviders(<ChatHeader conversation={conversation} />, {
      path: "/conversations/7",
      routePath: "/conversations/:id",
    });

  test("shows Block/Report for a direct chat", () => {
    renderHeader(direct);
    openMenu();
    expect(screen.getByRole("menuitem", { name: "Block maria" })).toBeInTheDocument();
  });

  test("is hidden in group chats", () => {
    renderHeader({
      id: 7,
      kind: "group",
      name: "Study group",
      participants: [
        { status: "active", user: { id: 1, username: "kostas" } },
        { status: "active", user: { id: 2, username: "maria" } },
      ],
    });
    expect(screen.queryByRole("button", { name: /More options/ })).not.toBeInTheDocument();
  });

  test("is hidden for the Lumi coach", () => {
    renderHeader({ ...direct, receiver: { id: -1, username: "Lumi", is_virtual_online: true } });
    expect(screen.queryByRole("button", { name: /More options/ })).not.toBeInTheDocument();
  });
});
