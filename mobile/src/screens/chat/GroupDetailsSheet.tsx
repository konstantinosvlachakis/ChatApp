import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type ScrollViewInstance } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ChatAvatar } from "../../components/chat/ChatAvatar";
import { GroupAvatar } from "../../components/chat/GroupAvatar";
import { conversationTitle, groupMembers } from "../../components/chat/conversationList";
import { getErrorMessage } from "../../services/api/errors";
import { GROUP_NAME_MAX_LENGTH, GROUP_NICKNAME_MAX_LENGTH, MAX_GROUP_MEMBERS, removeGroupMember, renameGroup, setGroupMemberNickname } from "../../services/api/groups";
import { showToast } from "../../services/toast";
import { fontFamilies } from "../../theme/typography";
import type { WarmColors } from "../../theme/warm";
import type { Conversation } from "../../types";
import { KeyboardSheet } from "./KeyboardSheet";

type GroupDetailsSheetProps = {
  warm: WarmColors;
  reduceMotion: boolean;
  visible: boolean;
  group: Conversation;
  initialNicknameUsername?: string | null;
  currentUserId?: number;
  currentUsername?: string;
  onClose: () => void;
  /** The group changed (rename/remove): refetch it. */
  onChanged: () => void;
  /** You left: close the chat. */
  onLeft: () => void;
  onAddPeople: () => void;
  onOpenProfile: (username: string) => void;
};

/** Group details (mirrors web GroupMembersPanel): rename and remove (owner), add people, leave. */
export function GroupDetailsSheet({
  warm,
  reduceMotion,
  visible,
  group,
  initialNicknameUsername = null,
  currentUserId,
  currentUsername,
  onClose,
  onChanged,
  onLeft,
  onAddPeople,
  onOpenProfile,
}: GroupDetailsSheetProps) {
  const styles = useMemo(() => createStyles(warm), [warm]);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(group.name || "");
  const [busy, setBusy] = useState<string | null>(null);
  const [editingNicknameId, setEditingNicknameId] = useState<number | null>(null);
  const [nicknameDraft, setNicknameDraft] = useState("");
  const listRef = useRef<ScrollViewInstance | null>(null);
  const isOwner = group.my_role === "owner";
  const participants = group.participants || [];
  const members = groupMembers(group);
  const others = members.filter((member) => member.id !== currentUserId);
  const invitedCount = participants.length - members.length;
  const isFull = participants.length >= MAX_GROUP_MEMBERS;
  const title = conversationTitle(group);

  useEffect(() => {
    if (!visible) return;
    setRenaming(false);
    const target = group.participants?.find(
      (row) => row.status === "active" && row.user.username === initialNicknameUsername
    );
    setEditingNicknameId(target?.user.id ?? null);
    setNicknameDraft(target?.nickname || "");
    setName(group.name || "");
    if (target) {
      const index = group.participants?.indexOf(target) ?? 0;
      const frame = requestAnimationFrame(() => listRef.current?.scrollTo({ y: Math.max(0, index * 64 - 56), animated: false }));
      return () => cancelAnimationFrame(frame);
    }
  }, [group.name, initialNicknameUsername, visible]);

  const saveName = async () => {
    setBusy("rename");
    try {
      await renameGroup(group.id, name.trim());
      setRenaming(false);
      onChanged();
    } catch (error) {
      showToast(getErrorMessage(error, "Couldn't rename the group."), { variant: "error" });
    } finally {
      setBusy(null);
    }
  };

  const remove = async (username: string, isMe: boolean) => {
    setBusy(username);
    try {
      await removeGroupMember(group.id, username);
      if (isMe) {
        showToast(`You left ${title}.`, { variant: "success" });
        onLeft();
        return;
      }
      onChanged();
    } catch (error) {
      showToast(getErrorMessage(error, isMe ? "Couldn't leave the group." : "Couldn't remove them."), {
        variant: "error",
      });
    } finally {
      setBusy(null);
    }
  };

  const saveNickname = async (username: string) => {
    setBusy(`nickname:${username}`);
    try {
      await setGroupMemberNickname(group.id, username, nicknameDraft.trim());
      setEditingNicknameId(null);
      onChanged();
    } catch (error) {
      showToast(getErrorMessage(error, "Couldn't save the nickname."), { variant: "error" });
    } finally {
      setBusy(null);
    }
  };

  const confirmRemove = (username: string, pending: boolean) => {
    Alert.alert(
      pending ? `Cancel ${username}'s invite?` : `Remove ${username}?`,
      pending ? "They won't be able to join with this invite." : "They'll stop receiving messages from this group.",
      [
        { text: "Keep", style: "cancel" },
        { text: pending ? "Cancel invite" : "Remove", style: "destructive", onPress: () => remove(username, false) },
      ]
    );
  };

  const confirmLeave = () => {
    Alert.alert(
      `Leave ${title}?`,
      `You won't see new messages unless someone invites you again.${
        isOwner && others.length ? " Ownership passes to the longest-standing member." : ""
      }`,
      [
        { text: "Stay", style: "cancel" },
        { text: "Leave group", style: "destructive", onPress: () => remove(currentUsername || "", true) },
      ]
    );
  };

  return (
    <KeyboardSheet warm={warm} visible={visible} reduceMotion={reduceMotion} onClose={onClose}>
      <View style={styles.hero}>
        <GroupAvatar members={others} size={64} warm={warm} />
        {renaming ? (
          <View style={styles.renameRow}>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              maxLength={GROUP_NAME_MAX_LENGTH}
              placeholder={group.display_name || "Group name"}
              placeholderTextColor={warm.mutedInk}
              accessibilityLabel="Group name"
              autoFocus
              returnKeyType="done"
              onSubmitEditing={saveName}
            />
            <Pressable
              style={({ pressed }) => [styles.smallPrimary, pressed && styles.pressed]}
              onPress={saveName}
              disabled={busy === "rename"}
              accessibilityRole="button"
            >
              {busy === "rename" ? (
                <ActivityIndicator size="small" color={warm.onNavy} />
              ) : (
                <Text style={styles.smallPrimaryText}>Save</Text>
              )}
            </Pressable>
          </View>
        ) : (
          <View style={styles.titleRow}>
            <Text style={styles.title} accessibilityRole="header" numberOfLines={2}>
              {title}
            </Text>
            {isOwner ? (
              <Pressable
                style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
                onPress={() => setRenaming(true)}
                accessibilityRole="button"
                accessibilityLabel="Rename group"
                hitSlop={6}
              >
                <Ionicons name="pencil" size={16} color={warm.ink} />
              </Pressable>
            ) : null}
          </View>
        )}
        <Text style={styles.subtitle}>
          {members.length} members{invitedCount > 0 ? ` · ${invitedCount} invited` : ""}
        </Text>
      </View>

      <ScrollView ref={listRef} style={styles.list}>
        {participants.map((participant) => {
          const member = participant.user;
          const isMe = member.id === currentUserId;
          const pending = participant.status === "pending";
          return (
            <View key={member.id} style={styles.member}>
              <Pressable
                style={({ pressed }) => [styles.memberLink, pressed && styles.pressed]}
                onPress={() => onOpenProfile(member.username)}
                accessibilityRole="button"
                accessibilityLabel={`${member.username}${isMe ? ", you" : ""}${
                  participant.role === "owner" ? ", owner" : ""
                }${pending ? ", invited" : ""}`}
                disabled={isMe}
              >
                <ChatAvatar name={member.username} imagePath={member.profile_image_url ?? null} size={40} />
                <Text style={styles.memberName} numberOfLines={1}>
                  {participant.nickname || member.username}
                  {isMe ? <Text style={styles.you}> (you)</Text> : null}
                </Text>
              </Pressable>
              {!pending && editingNicknameId !== member.id ? (
                <Pressable style={styles.iconButton}
                  onPress={() => { setEditingNicknameId(member.id); setNicknameDraft(participant.nickname || ""); }}
                  accessibilityRole="button" accessibilityLabel={`Edit nickname for ${member.username}`}>
                  <Ionicons name="pencil" size={16} color={warm.inkSoft} />
                </Pressable>
              ) : null}
              {editingNicknameId !== member.id && participant.role === "owner" ? (
                <View style={[styles.tag, styles.tagOwner]}>
                  <Text style={[styles.tagText, styles.tagOwnerText]}>OWNER</Text>
                </View>
              ) : null}
              {pending ? (
                <View style={styles.tag}>
                  <Text style={styles.tagText}>INVITED</Text>
                </View>
              ) : null}
              {editingNicknameId !== member.id && isOwner && !isMe ? (
                <Pressable
                  style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
                  onPress={() => confirmRemove(member.username, pending)}
                  disabled={busy === member.username}
                  accessibilityRole="button"
                  accessibilityLabel={pending ? `Cancel ${member.username}'s invite` : `Remove ${member.username}`}
                  hitSlop={6}
                >
                  {busy === member.username ? (
                    <ActivityIndicator size="small" color={warm.teal} />
                  ) : (
                    <Ionicons name="close" size={18} color={warm.inkSoft} />
                  )}
                </Pressable>
              ) : null}
              {editingNicknameId === member.id ? (
                <View style={styles.nicknameEditor}>
                  <TextInput style={[styles.input, styles.nicknameInput]} value={nicknameDraft} onChangeText={setNicknameDraft}
                    maxLength={GROUP_NICKNAME_MAX_LENGTH} placeholder={`Nickname for @${member.username}`} autoFocus
                    placeholderTextColor={warm.mutedInk} accessibilityLabel={`Nickname for ${member.username}`}
                    returnKeyType="done" onSubmitEditing={() => saveNickname(member.username)} />
                  <View style={styles.nicknameActions}>
                    <Pressable style={styles.nicknameCancel} onPress={() => setEditingNicknameId(null)}
                      accessibilityRole="button" accessibilityLabel="Cancel nickname edit">
                      <Text style={styles.nicknameCancelText}>Cancel</Text>
                    </Pressable>
                    <Pressable style={styles.smallPrimary} onPress={() => saveNickname(member.username)}
                      disabled={busy === `nickname:${member.username}`} accessibilityRole="button" accessibilityLabel="Save nickname">
                      <Text style={styles.smallPrimaryText}>Save</Text>
                    </Pressable>
                  </View>
                </View>
              ) : participant.nickname ? <Text style={styles.memberUsername}>@{member.username}</Text> : null}
            </View>
          );
        })}
      </ScrollView>

      <View style={styles.actions}>
        <Pressable
          style={({ pressed }) => [styles.secondary, isFull && styles.disabled, pressed && styles.pressed]}
          onPress={onAddPeople}
          disabled={isFull}
          accessibilityRole="button"
          accessibilityHint={isFull ? `Groups can have up to ${MAX_GROUP_MEMBERS} people` : undefined}
        >
          <Ionicons name="person-add-outline" size={18} color={warm.ink} />
          <Text style={styles.secondaryText}>Add people</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.danger, pressed && styles.pressed]}
          onPress={confirmLeave}
          disabled={Boolean(busy)}
          accessibilityRole="button"
        >
          <Ionicons name="exit-outline" size={18} color={warm.danger} />
          <Text style={styles.dangerText}>Leave group</Text>
        </Pressable>
      </View>
    </KeyboardSheet>
  );
}

const createStyles = (warm: WarmColors) =>
  StyleSheet.create({
    hero: { alignItems: "center", gap: 8 },
    titleRow: { flexDirection: "row", alignItems: "center", gap: 6, maxWidth: "100%" },
    title: { flexShrink: 1, color: warm.ink, fontSize: 20, textAlign: "center", fontFamily: fontFamilies.displayBold },
    subtitle: { color: warm.mutedInk, fontSize: 13, fontFamily: fontFamilies.bodyMedium },
    renameRow: { flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "stretch" },
    input: {
      flex: 1,
      minHeight: 44,
      paddingHorizontal: 14,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: warm.line,
      color: warm.ink,
      fontSize: 15,
      fontFamily: fontFamilies.bodySemiBold,
    },
    smallPrimary: {
      minHeight: 44,
      minWidth: 64,
      paddingHorizontal: 16,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: warm.navy,
    },
    smallPrimaryText: { color: warm.onNavy, fontSize: 14, fontFamily: fontFamilies.bodyBold },
    list: { marginTop: 14, maxHeight: 320 },
    member: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, minHeight: 56 },
    memberLink: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12, minHeight: 52, borderRadius: 14 },
    memberName: { flex: 1, color: warm.ink, fontSize: 15, fontFamily: fontFamilies.bodyBold },
    memberUsername: { width: "100%", marginLeft: 52, marginTop: -8, color: warm.mutedInk, fontSize: 12 },
    nicknameEditor: { width: "100%", gap: 10, paddingBottom: 10 },
    nicknameInput: { flex: 0, width: "100%" },
    nicknameActions: { flexDirection: "row", justifyContent: "flex-end", gap: 12 },
    nicknameCancel: { minWidth: 76, minHeight: 44, alignItems: "center", justifyContent: "center", paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: warm.line, backgroundColor: warm.paper },
    nicknameCancelText: { color: warm.inkSoft, fontSize: 14, fontFamily: fontFamilies.bodyBold },
    you: { color: warm.mutedInk, fontFamily: fontFamilies.bodyMedium },
    tag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: warm.creamDeep },
    tagText: { color: warm.inkSoft, fontSize: 10, letterSpacing: 0.6, fontFamily: fontFamilies.bodyExtraBold },
    tagOwner: { backgroundColor: warm.peachSoft },
    tagOwnerText: { color: warm.peachInk },
    iconButton: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
    actions: { flexDirection: "row", gap: 8, marginTop: 14, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: warm.line },
    secondary: {
      flex: 1,
      flexDirection: "row",
      gap: 6,
      minHeight: 46,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: warm.line,
      alignItems: "center",
      justifyContent: "center",
    },
    secondaryText: { color: warm.ink, fontSize: 15, fontFamily: fontFamilies.bodyBold },
    danger: {
      flex: 1,
      flexDirection: "row",
      gap: 6,
      minHeight: 46,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: warm.dangerSoft,
    },
    dangerText: { color: warm.danger, fontSize: 15, fontFamily: fontFamilies.bodyBold },
    disabled: { opacity: 0.5 },
    pressed: { opacity: 0.85 },
  });
