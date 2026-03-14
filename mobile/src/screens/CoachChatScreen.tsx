import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import {
  COACH_BOT_ID,
  COACH_MODES,
  COACH_QUICK_PROMPTS,
  type CoachModeId,
  type CoachPreferences,
  getCoachLanguageOptions,
  persistCoachMessages,
  persistCoachPreferences,
  readCoachMessages,
  readCoachPreferences,
  resetCoachConversation,
} from "../features/coachConversation";
import { sendCoachMessage } from "../services/api/coach";
import type { ChatMessage } from "../types";
import type { ThemeColors } from "../theme/colors";

export function CoachChatScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const languageOptions = useMemo(() => getCoachLanguageOptions(user), [user]);
  const listRef = useRef<FlatList<ChatMessage> | null>(null);

  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [selectedLanguage, setSelectedLanguage] = useState("english");
  const [selectedMode, setSelectedMode] = useState<CoachModeId>(COACH_MODES[0].id);
  const [input, setInput] = useState("");
  const [isCoachTyping, setIsCoachTyping] = useState(false);

  const activeMode = COACH_MODES.find((mode) => mode.id === selectedMode) || COACH_MODES[0];
  const hasStartedConversation = messages.length > 1;

  const syncMessages = async (nextMessages: ChatMessage[]) => {
    setMessages(nextMessages);
    await persistCoachMessages(user, nextMessages);
  };

  const syncPreferences = async (nextPreferences: CoachPreferences) => {
    setSelectedLanguage(nextPreferences.language);
    setSelectedMode(nextPreferences.mode);
    await persistCoachPreferences(user, nextPreferences);
  };

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      if (!user) {
        if (mounted) setLoading(false);
        return;
      }

      const preferences = await readCoachPreferences(user);
      const storedMessages = await readCoachMessages(user, preferences);
      if (!mounted) return;
      setSelectedLanguage(preferences.language);
      setSelectedMode(preferences.mode);
      setMessages(storedMessages);
      setLoading(false);
    };

    load().catch(() => {
      if (mounted) setLoading(false);
    });

    return () => {
      mounted = false;
    };
  }, [user]);

  useEffect(() => {
    if (!messages.length) return;
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated: true });
    });
  }, [isCoachTyping, messages]);

  const handlePreferenceChange = async (partial: Partial<CoachPreferences>) => {
    const nextPreferences: CoachPreferences = {
      language: partial.language || selectedLanguage,
      mode: partial.mode || selectedMode,
    };
    await syncPreferences(nextPreferences);
    const nextMessages = await resetCoachConversation(user, nextPreferences);
    setMessages(nextMessages);
  };

  const handleNewConversation = async () => {
    const nextMessages = await resetCoachConversation(user, {
      language: selectedLanguage,
      mode: selectedMode,
    });
    setMessages(nextMessages);
  };

  const handleSend = async (value = input) => {
    const trimmed = value.trim();
    if (!trimmed || !user || isCoachTyping) return;

    const outgoingMessage: ChatMessage = {
      id: Date.now(),
      text: trimmed,
      sender: {
        id: user.user_id || 0,
        username: user.username || "You",
      },
      timestamp: new Date().toISOString(),
      reactions: [],
      current_user_reaction: null,
      can_translate: false,
    };

    const nextMessages = [...messages, outgoingMessage];
    setInput("");
    await syncMessages(nextMessages);
    setIsCoachTyping(true);

    try {
      const payload = await sendCoachMessage({
        message: trimmed,
        target_language: selectedLanguage,
        mode: selectedMode,
      });

      await syncMessages([
        ...nextMessages,
        {
          id: Date.now() + 1,
          text: payload.reply || "I am ready. Send another message and we will keep practising.",
          sender: {
            id: COACH_BOT_ID,
            username: "Lumi",
          },
          timestamp: new Date().toISOString(),
          reactions: [],
          current_user_reaction: null,
          can_translate: false,
        },
      ]);
    } catch (error: any) {
      const fallbackMessage =
        error?.response?.data?.detail ||
        "The coach is unavailable right now. Please try again in a moment.";
      await syncMessages([
        ...nextMessages,
        {
          id: Date.now() + 2,
          text: fallbackMessage,
          sender: {
            id: COACH_BOT_ID,
            username: "Lumi",
          },
          timestamp: new Date().toISOString(),
          reactions: [],
          current_user_reaction: null,
          can_translate: false,
        },
      ]);
    } finally {
      setIsCoachTyping(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerState}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.centerStateText}>Loading Lumi...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        <View style={styles.topBar}>
          <Pressable onPress={() => navigation.goBack()} style={styles.iconButton}>
            <Ionicons name="arrow-back" size={20} color={colors.text} />
          </Pressable>
          <View style={styles.topBarTitleWrap}>
            <Text style={styles.topBarTitle}>Lumi</Text>
            <Text style={styles.topBarSubtitle}>AI language coach</Text>
          </View>
          <Pressable onPress={handleNewConversation} style={styles.iconButton}>
            <Ionicons name="refresh" size={18} color={colors.text} />
          </Pressable>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.headerScrollContent}
          style={styles.headerScroll}
        >
          <View style={styles.heroCard}>
            <View style={styles.heroBadge}>
              <Text style={styles.heroBadgeText}>L</Text>
            </View>
            <Text style={styles.heroTitle}>Practice with Lumi</Text>
            <Text style={styles.heroText}>
              Switch languages, choose a coaching style, and keep the conversation going naturally.
            </Text>
          </View>

          <View style={styles.controlBlock}>
            <Text style={styles.controlLabel}>Language</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.chipRow}>
                {languageOptions.map((option) => {
                  const isActive = option.value === selectedLanguage;
                  return (
                    <Pressable
                      key={option.value}
                      onPress={() => handlePreferenceChange({ language: option.value })}
                      style={[styles.chip, isActive ? styles.chipActive : undefined]}
                    >
                      <Text style={[styles.chipText, isActive ? styles.chipTextActive : undefined]}>
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
          </View>

          <View style={styles.controlBlock}>
            <Text style={styles.controlLabel}>Mode</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.chipRow}>
                {COACH_MODES.map((mode) => {
                  const isActive = mode.id === selectedMode;
                  return (
                    <Pressable
                      key={mode.id}
                      onPress={() => handlePreferenceChange({ mode: mode.id })}
                      style={[styles.modeChip, isActive ? styles.modeChipActive : undefined]}
                    >
                      <Text
                        style={[
                          styles.modeChipTitle,
                          isActive ? styles.modeChipTitleActive : undefined,
                        ]}
                      >
                        {mode.shortLabel}
                      </Text>
                      <Text
                        style={[
                          styles.modeChipText,
                          isActive ? styles.modeChipTextActive : undefined,
                        ]}
                      >
                        {mode.description}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
          </View>
        </ScrollView>

        {!hasStartedConversation ? (
          <View style={styles.quickPromptSection}>
            <View style={styles.quickPromptHeader}>
              <Text style={styles.quickPromptTitle}>Quick Starts</Text>
              <Text style={styles.quickPromptHint}>Tap one to send it</Text>
            </View>
            <View style={styles.quickPromptGrid}>
              {COACH_QUICK_PROMPTS.map((prompt) => (
                <Pressable key={prompt} style={styles.quickPromptCard} onPress={() => handleSend(prompt)}>
                  <Text style={styles.quickPromptText}>{prompt}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => String(item.id)}
          style={styles.messageList}
          contentContainerStyle={styles.messageListContent}
          renderItem={({ item }) => {
            const isMine = item.sender.id !== COACH_BOT_ID;
            return (
              <View style={[styles.messageRow, isMine ? styles.messageRowMine : styles.messageRowOther]}>
                {!isMine ? <View style={styles.botAvatar}><Text style={styles.botAvatarText}>L</Text></View> : null}
                <View style={[styles.messageBubble, isMine ? styles.messageBubbleMine : styles.messageBubbleOther]}>
                  {!isMine ? <Text style={styles.botName}>Lumi</Text> : null}
                  <Text style={[styles.messageText, isMine ? styles.messageTextMine : undefined]}>
                    {item.text}
                  </Text>
                </View>
              </View>
            );
          }}
        />

        {isCoachTyping ? (
          <View style={styles.typingWrap}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.typingText}>Lumi is thinking in {activeMode.shortLabel.toLowerCase()} mode...</Text>
          </View>
        ) : null}

        <View style={styles.composer}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder={`Message Lumi in ${selectedLanguage}`}
            placeholderTextColor={colors.mutedText}
            multiline
          />
          <Pressable
            style={[styles.sendButton, isCoachTyping ? styles.sendButtonDisabled : undefined]}
            onPress={() => handleSend()}
            disabled={isCoachTyping}
          >
            <Ionicons name="send" size={18} color="#fff" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    flex: { flex: 1 },
    container: { flex: 1, backgroundColor: colors.background },
    centerState: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
    centerStateText: { color: colors.mutedText },
    topBar: {
      paddingHorizontal: 14,
      paddingTop: 10,
      paddingBottom: 6,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    iconButton: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    topBarTitleWrap: { alignItems: "center" },
    topBarTitle: { color: colors.text, fontSize: 18, fontWeight: "800" },
    topBarSubtitle: { color: colors.mutedText, fontSize: 12, marginTop: 2 },
    headerScroll: { maxHeight: 220 },
    headerScrollContent: {
      paddingHorizontal: 14,
      paddingBottom: 10,
      gap: 12,
      alignItems: "stretch",
    },
    heroCard: {
      width: 250,
      borderRadius: 24,
      padding: 16,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    heroBadge: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: colors.navy,
      alignItems: "center",
      justifyContent: "center",
    },
    heroBadgeText: { color: "#fff", fontSize: 20, fontWeight: "800" },
    heroTitle: { color: colors.text, fontSize: 18, fontWeight: "800", marginTop: 14 },
    heroText: { color: colors.mutedText, fontSize: 13, lineHeight: 19, marginTop: 6 },
    controlBlock: {
      width: 280,
      borderRadius: 24,
      padding: 14,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    controlLabel: {
      color: colors.mutedText,
      fontSize: 11,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 1,
      marginBottom: 10,
    },
    chipRow: { flexDirection: "row", gap: 8 },
    chip: {
      paddingHorizontal: 12,
      paddingVertical: 9,
      borderRadius: 999,
      backgroundColor: colors.chipBackground,
    },
    chipActive: { backgroundColor: colors.activeChipBackground },
    chipText: { color: colors.chipText, fontWeight: "700" },
    chipTextActive: { color: colors.activeChipText },
    modeChip: {
      width: 145,
      borderRadius: 18,
      padding: 12,
      backgroundColor: colors.surfaceMuted,
      borderWidth: 1,
      borderColor: colors.border,
    },
    modeChipActive: {
      backgroundColor: colors.navy,
      borderColor: colors.navy,
    },
    modeChipTitle: { color: colors.text, fontWeight: "800", fontSize: 14 },
    modeChipTitleActive: { color: "#fff" },
    modeChipText: { color: colors.mutedText, fontSize: 12, lineHeight: 17, marginTop: 4 },
    modeChipTextActive: { color: "rgba(255,255,255,0.78)" },
    quickPromptSection: { paddingHorizontal: 14, paddingBottom: 6 },
    quickPromptHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 10,
    },
    quickPromptTitle: { color: colors.text, fontSize: 14, fontWeight: "800" },
    quickPromptHint: { color: colors.mutedText, fontSize: 12 },
    quickPromptGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    quickPromptCard: {
      width: "48%",
      borderRadius: 18,
      padding: 12,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    quickPromptText: { color: colors.text, fontSize: 13, lineHeight: 18, fontWeight: "600" },
    messageList: { flex: 1 },
    messageListContent: { paddingHorizontal: 14, paddingTop: 8, paddingBottom: 16, gap: 10 },
    messageRow: { flexDirection: "row", alignItems: "flex-end", marginBottom: 10 },
    messageRowMine: { justifyContent: "flex-end" },
    messageRowOther: { justifyContent: "flex-start" },
    botAvatar: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.navy,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 8,
      marginBottom: 2,
    },
    botAvatarText: { color: "#fff", fontWeight: "800" },
    botName: { color: colors.mutedText, fontSize: 11, fontWeight: "700", marginBottom: 4 },
    messageBubble: {
      maxWidth: "78%",
      borderRadius: 20,
      paddingHorizontal: 14,
      paddingVertical: 11,
    },
    messageBubbleMine: {
      backgroundColor: colors.primary,
      borderBottomRightRadius: 8,
    },
    messageBubbleOther: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderBottomLeftRadius: 8,
    },
    messageText: { color: colors.text, fontSize: 15, lineHeight: 21 },
    messageTextMine: { color: "#fff" },
    typingWrap: {
      marginHorizontal: 14,
      marginBottom: 10,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 16,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    typingText: { color: colors.mutedText, flex: 1 },
    composer: {
      paddingHorizontal: 14,
      paddingTop: 8,
      paddingBottom: 12,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.surface,
      flexDirection: "row",
      alignItems: "flex-end",
      gap: 10,
    },
    input: {
      flex: 1,
      minHeight: 46,
      maxHeight: 120,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.inputBackground,
      color: colors.text,
      paddingHorizontal: 14,
      paddingTop: 12,
      paddingBottom: 12,
    },
    sendButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.navy,
      alignItems: "center",
      justifyContent: "center",
    },
    sendButtonDisabled: {
      opacity: 0.6,
    },
  });
