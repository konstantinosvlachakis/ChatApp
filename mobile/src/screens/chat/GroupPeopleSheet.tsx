import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ChatAvatar } from "../../components/chat/ChatAvatar";
import { getOtherParticipant } from "../../components/chat/conversationList";
import { getErrorMessage } from "../../services/api/errors";
import {
  GROUP_NAME_MAX_LENGTH,
  MAX_GROUP_MEMBERS,
  createGroup,
  fetchFollowingForGroups,
  inviteToGroup,
} from "../../services/api/groups";
import { hapticSelection, hapticSuccess } from "../../services/haptics";
import { fontFamilies } from "../../theme/typography";
import type { WarmColors } from "../../theme/warm";
import type { Conversation, ConversationParticipant } from "../../types";
import { KeyboardSheet } from "./KeyboardSheet";

const normalize = (value?: string | null) => String(value || "").toLowerCase().trim();

type GroupPeopleSheetProps = {
  warm: WarmColors;
  reduceMotion: boolean;
  visible: boolean;
  /** "create" a new group, or "add" people to ``group``. */
  mode: "create" | "add";
  group?: Conversation | null;
  /** Your chats (their partners are candidates, with the people you follow). */
  conversations: Conversation[];
  currentUsername?: string;
  preselected?: string[];
  onClose: () => void;
  onDone: (result: Conversation) => void;
};

/**
 * Pick people for a group (mirrors web GroupPeoplePicker). Candidates are your direct-chat
 * partners and the people you follow — the API only accepts those. Max 8 people incl. invites.
 */
export function GroupPeopleSheet({
  warm,
  reduceMotion,
  visible,
  mode,
  group = null,
  conversations,
  currentUsername,
  preselected = [],
  onClose,
  onDone,
}: GroupPeopleSheetProps) {
  const styles = useMemo(() => createStyles(warm), [warm]);
  const [following, setFollowing] = useState<ConversationParticipant[]>([]);
  const [loadingFollowing, setLoadingFollowing] = useState(false);
  const [query, setQuery] = useState("");
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<string[]>(preselected);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Fresh state every time the sheet opens.
  useEffect(() => {
    if (!visible) return undefined;
    setQuery("");
    setName("");
    setSelected(preselected.filter(Boolean));
    setBusy(false);
    setError("");
    let active = true;
    setLoadingFollowing(true);
    fetchFollowingForGroups()
      .then((profiles) => {
        if (active) setFollowing(profiles);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoadingFollowing(false);
      });
    return () => {
      active = false;
    };
    // preselected is read once per opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const taken = useMemo(
    () => new Set((group?.participants || []).map((participant) => normalize(participant.user?.username))),
    [group]
  );
  const capacity = mode === "create" ? MAX_GROUP_MEMBERS - 1 : MAX_GROUP_MEMBERS - (group?.participants || []).length;

  const candidates = useMemo(() => {
    const byName = new Map<string, ConversationParticipant>();
    const add = (profile?: ConversationParticipant | null) => {
      const key = normalize(profile?.username);
      if (!profile || !key || key === normalize(currentUsername) || taken.has(key) || byName.has(key)) return;
      byName.set(key, profile);
    };
    conversations.forEach((conversation) => add(getOtherParticipant(conversation, currentUsername)));
    following.forEach(add);
    return Array.from(byName.values());
  }, [conversations, currentUsername, following, taken]);

  const visibleCandidates = candidates.filter((profile) => normalize(profile.username).includes(normalize(query)));
  const selectedSet = new Set(selected.map(normalize));
  const isFull = selected.length >= capacity;

  const toggle = (username: string) => {
    setError("");
    hapticSelection();
    setSelected((current) =>
      current.some((item) => normalize(item) === normalize(username))
        ? current.filter((item) => normalize(item) !== normalize(username))
        : current.length >= capacity
          ? current
          : [...current, username]
    );
  };

  const submit = async () => {
    if (!selected.length || busy) return;
    setBusy(true);
    setError("");
    try {
      const result =
        mode === "create" ? await createGroup(selected, name.trim()) : await inviteToGroup(group!.id, selected);
      hapticSuccess();
      onDone(result);
    } catch (err) {
      setError(getErrorMessage(err, mode === "create" ? "Couldn't create the group." : "Couldn't send the invites."));
    } finally {
      setBusy(false);
    }
  };

  const submitLabel = busy
    ? mode === "create"
      ? "Creating…"
      : "Inviting…"
    : mode === "create"
      ? `Create group${selected.length ? ` (${selected.length + 1})` : ""}`
      : `Invite${selected.length ? ` ${selected.length}` : ""}`;

  return (
    <KeyboardSheet warm={warm} visible={visible} reduceMotion={reduceMotion} onClose={onClose}>
      <Text style={styles.title} accessibilityRole="header">
        {mode === "create" ? "New group chat" : "Add people"}
      </Text>
      <Text style={styles.hint}>
        {mode === "create"
          ? "Practise together with up to 7 people you follow or chat with. They join when they accept."
          : `Invite people you follow or chat with. ${Math.max(capacity, 0)} ${capacity === 1 ? "place" : "places"} left.`}
      </Text>

      {mode === "create" ? (
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          maxLength={GROUP_NAME_MAX_LENGTH}
          placeholder="Group name (optional)"
          placeholderTextColor={warm.mutedInk}
          accessibilityLabel="Group name, optional"
          returnKeyType="next"
        />
      ) : null}

      {selected.length ? (
        <View style={styles.chips} accessibilityLabel="Selected people">
          {selected.map((username) => (
            <Pressable
              key={username}
              style={styles.chip}
              onPress={() => toggle(username)}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${username}`}
            >
              <Text style={styles.chipText}>{username}</Text>
              <Ionicons name="close" size={14} color={warm.onNavy} />
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={styles.search}>
        <Ionicons name="search" size={18} color={warm.mutedInk} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search people"
          placeholderTextColor={warm.mutedInk}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Search people to add"
        />
      </View>

      <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
        {visibleCandidates.map((profile) => {
          const isSelected = selectedSet.has(normalize(profile.username));
          const disabled = !isSelected && isFull;
          return (
            <Pressable
              key={profile.username}
              style={({ pressed }) => [
                styles.person,
                isSelected && styles.personSelected,
                disabled && styles.personDisabled,
                pressed && styles.pressed,
              ]}
              onPress={() => toggle(profile.username)}
              disabled={disabled}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: isSelected, disabled }}
              accessibilityLabel={profile.username}
            >
              <ChatAvatar name={profile.username} imagePath={profile.profile_image_url ?? null} size={40} />
              <Text style={styles.personName} numberOfLines={1}>
                {profile.username}
              </Text>
              <View style={[styles.check, isSelected && styles.checkOn]}>
                {isSelected ? <Ionicons name="checkmark" size={16} color={warm.onNavy} /> : null}
              </View>
            </Pressable>
          );
        })}
        {!visibleCandidates.length ? (
          <View style={styles.empty}>
            {loadingFollowing ? (
              <ActivityIndicator color={warm.teal} />
            ) : (
              <Text style={styles.emptyText}>
                {candidates.length
                  ? `No one matches “${query.trim()}”.`
                  : "Follow people or start a chat first, then add them here."}
              </Text>
            )}
          </View>
        ) : null}
      </ScrollView>

      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}

      <View style={styles.actions}>
        <Pressable style={({ pressed }) => [styles.secondary, pressed && styles.pressed]} onPress={onClose} accessibilityRole="button">
          <Text style={styles.secondaryText}>Cancel</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.primary, (!selected.length || busy) && styles.primaryDisabled, pressed && styles.pressed]}
          onPress={submit}
          disabled={!selected.length || busy}
          accessibilityRole="button"
          accessibilityState={{ disabled: !selected.length || busy, busy }}
        >
          <Text style={styles.primaryText}>{submitLabel}</Text>
        </Pressable>
      </View>
    </KeyboardSheet>
  );
}

const createStyles = (warm: WarmColors) =>
  StyleSheet.create({
    title: { color: warm.ink, fontSize: 20, fontFamily: fontFamilies.displayBold },
    hint: { marginTop: 4, color: warm.inkSoft, fontSize: 14, lineHeight: 20, fontFamily: fontFamilies.bodyRegular },
    input: {
      marginTop: 14,
      minHeight: 46,
      paddingHorizontal: 14,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: warm.line,
      backgroundColor: warm.paper,
      color: warm.ink,
      fontSize: 15,
      fontFamily: fontFamilies.bodySemiBold,
    },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 12 },
    chip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      minHeight: 32,
      paddingLeft: 12,
      paddingRight: 8,
      borderRadius: 999,
      backgroundColor: warm.navy,
    },
    chipText: { color: warm.onNavy, fontSize: 13, fontFamily: fontFamilies.bodyBold },
    search: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginTop: 12,
      minHeight: 44,
      paddingHorizontal: 14,
      borderRadius: 999,
      backgroundColor: warm.creamDeep,
    },
    searchInput: { flex: 1, color: warm.ink, fontSize: 15, fontFamily: fontFamilies.bodyRegular, paddingVertical: 8 },
    list: { marginTop: 8, maxHeight: 300 },
    person: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, paddingHorizontal: 8, borderRadius: 14 },
    personSelected: { backgroundColor: warm.peachSoft },
    personDisabled: { opacity: 0.45 },
    personName: { flex: 1, color: warm.ink, fontSize: 15, fontFamily: fontFamilies.bodyBold },
    check: {
      width: 24,
      height: 24,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: warm.line,
      alignItems: "center",
      justifyContent: "center",
    },
    checkOn: { borderColor: warm.peachInk, backgroundColor: warm.peachInk },
    empty: { paddingVertical: 24, alignItems: "center" },
    emptyText: { color: warm.mutedInk, fontSize: 14, textAlign: "center", fontFamily: fontFamilies.bodyRegular },
    error: { marginTop: 8, color: warm.danger, fontSize: 14, fontFamily: fontFamilies.bodyBold },
    actions: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 14 },
    secondary: {
      minHeight: 46,
      paddingHorizontal: 18,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: warm.line,
      alignItems: "center",
      justifyContent: "center",
    },
    secondaryText: { color: warm.ink, fontSize: 15, fontFamily: fontFamilies.bodyBold },
    primary: {
      minHeight: 46,
      paddingHorizontal: 20,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: warm.navy,
    },
    primaryDisabled: { opacity: 0.5 },
    primaryText: { color: warm.onNavy, fontSize: 15, fontFamily: fontFamilies.bodyBold },
    pressed: { opacity: 0.85 },
  });
