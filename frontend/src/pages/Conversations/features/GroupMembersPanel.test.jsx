import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import GroupMembersPanel from "./GroupMembersPanel";
import { setGroupMemberNickname } from "../api/groups";

jest.mock("../../../context/UserContext", () => ({ useUser: () => ({ user: { user_id: 1, username: "owner" } }) }));
jest.mock("../../../lib/api", () => ({ getErrorMessage: (_error, fallback) => fallback }));
jest.mock("../api/groups", () => ({
  GROUP_NAME_MAX_LENGTH: 60,
  MAX_GROUP_MEMBERS: 8,
  setGroupMemberNickname: jest.fn(),
}));

const conversation = {
  id: 7, kind: "group", name: "Friends", my_role: "owner",
  participants: [
    { user: { id: 1, username: "owner" }, role: "owner", status: "active", nickname: "" },
    { user: { id: 2, username: "ana" }, role: "member", status: "active", nickname: "Annie" },
  ],
};

test("a group member can edit a nickname while the username stays visible", async () => {
  setGroupMemberNickname.mockResolvedValue({ username: "ana", nickname: "An" });
  const onChanged = jest.fn();
  render(<MemoryRouter><GroupMembersPanel conversation={conversation} onClose={jest.fn()} onChanged={onChanged} /></MemoryRouter>);

  expect(screen.getByText("Annie")).toBeInTheDocument();
  expect(screen.getByText("@ana")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Edit nickname for ana" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Nickname for ana" }), { target: { value: "An" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  await waitFor(() => expect(setGroupMemberNickname).toHaveBeenCalledWith(7, "ana", "An"));
  await waitFor(() => expect(onChanged).toHaveBeenCalled());
});
