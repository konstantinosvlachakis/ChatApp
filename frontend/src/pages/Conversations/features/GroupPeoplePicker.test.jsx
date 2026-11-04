import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "react-query";
import { MemoryRouter } from "react-router-dom";
import api from "../../../lib/api";
import GroupPeoplePicker from "./GroupPeoplePicker";
import GroupInvites from "./GroupInvites";

jest.mock("../../../lib/api", () => {
  const actual = jest.requireActual("../../../lib/apiError");
  const client = { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() };
  return {
    __esModule: true,
    default: client,
    api: client,
    getErrorMessage: actual.getErrorMessage,
    isApiError: actual.isApiError,
    isAbortError: () => false,
  };
});
jest.mock("../../../context/UserContext", () => ({
  useUser: () => ({ user: { user_id: 1, username: "me" } }),
}));
const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
  useNavigate: () => mockNavigate,
}));

const conversations = [
  { id: 5, kind: "direct", sender: { id: 1, username: "me" }, receiver: { id: 2, username: "ana" } },
  { id: 6, kind: "group", sender: { id: 1, username: "me" }, receiver: null, participants: [] },
];
const following = [{ id: 3, username: "ben" }, { id: 2, username: "ana" }];

const respondTo = (path) => {
  if (path.startsWith("/api/conversations/?include=groups")) return Promise.resolve(conversations);
  if (path === "/api/profile/following/") return Promise.resolve({ profiles: following });
  if (path === "/api/conversations/invites/") {
    return Promise.resolve({
      invites: [
        {
          conversation_id: 9,
          name: "Greek club",
          display_name: "Greek club",
          invited_by: { id: 2, username: "ana" },
          members: [{ id: 2, username: "ana" }],
          member_count: 1,
          invited_at: "2026-11-04T10:00:00Z",
        },
      ],
    });
  }
  return Promise.resolve([]);
};

const renderWithQuery = (ui) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );

beforeEach(() => {
  jest.clearAllMocks();
  api.get.mockImplementation(respondTo);
});

test("lists chat partners and people you follow once each, and creates the group", async () => {
  api.post.mockResolvedValue({ id: 77, kind: "group" });
  const onDone = jest.fn();
  renderWithQuery(<GroupPeoplePicker mode="create" onClose={() => {}} onDone={onDone} />);

  const ben = await screen.findByRole("button", { name: /ben/ });
  expect(screen.getAllByRole("button", { name: /^ana/ })).toHaveLength(1);
  fireEvent.click(ben);
  fireEvent.click(screen.getByRole("button", { name: /^ana/ }));
  fireEvent.change(screen.getByLabelText(/Group name/), { target: { value: "  Greek club " } });
  fireEvent.click(screen.getByRole("button", { name: "Create group (3)" }));

  await waitFor(() => expect(onDone).toHaveBeenCalledWith({ id: 77, kind: "group" }));
  expect(api.post).toHaveBeenCalledWith("/api/conversations/groups/", { members: ["ben", "ana"], name: "Greek club" });
});

test("in add mode it hides current members and invites the selection", async () => {
  api.post.mockResolvedValue({ id: 6 });
  const group = {
    id: 6,
    kind: "group",
    participants: [
      { user: { id: 1, username: "me" }, status: "active", role: "owner" },
      { user: { id: 2, username: "ana" }, status: "pending", role: "member" },
    ],
  };
  renderWithQuery(<GroupPeoplePicker mode="add" conversation={group} onClose={() => {}} onDone={() => {}} />);

  fireEvent.click(await screen.findByRole("button", { name: /ben/ }));
  expect(screen.queryByRole("button", { name: /^ana/ })).not.toBeInTheDocument();
  expect(screen.getByText(/6 places left/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Invite 1" }));

  await waitFor(() =>
    expect(api.post).toHaveBeenCalledWith("/api/conversations/6/members/", { usernames: ["ben"] })
  );
});

test("shows the API's reason when creating fails", async () => {
  const { ApiError } = jest.requireActual("../../../lib/apiError");
  api.post.mockRejectedValue(
    new ApiError({ status: 400, code: "not_invitable", message: "You can only invite people you follow or already chat with." })
  );
  renderWithQuery(<GroupPeoplePicker mode="create" preselected={["ana"]} onClose={() => {}} onDone={() => {}} />);

  fireEvent.click(await screen.findByRole("button", { name: "Create group (2)" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("You can only invite people you follow");
});

test("group invites can be joined from the list", async () => {
  api.post.mockResolvedValue({ id: 9, kind: "group" });
  renderWithQuery(<GroupInvites />);

  expect(await screen.findByText("Greek club")).toBeInTheDocument();
  expect(screen.getByText(/ana invited you · 1 member/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Join" }));

  await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/conversations/9"));
  expect(api.post).toHaveBeenCalledWith("/api/conversations/9/invite/", { action: "accept" });
  await waitFor(() => expect(screen.queryByText("Greek club")).not.toBeInTheDocument());
});
