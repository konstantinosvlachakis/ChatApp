import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Modal,
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
import { CoachAvatar } from "../components/CoachAvatar";
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
import { fontFamilies } from "../theme/typography";

export function CoachChatScreen() {
  const replyAnimationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const languageOptions = useMemo(() => getCoachLanguageOptions(user), [user]);
  const listRef = useRef<FlatList<ChatMessage> | null>(null);
  const menuTranslateX = useRef(new Animated.Value(320)).current;

  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [selectedLanguage, setSelectedLanguage] = useState("english");
  const [selectedMode, setSelectedMode] = useState<CoachModeId>(COACH_MODES[0].id);
  const [input, setInput] = useState("");
  const [isCoachTyping, setIsCoachTyping] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [animatedReplyMessageId, setAnimatedReplyMessageId] = useState<number | null>(null);
  const [animatedReplyText, setAnimatedReplyText] = useState("");

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

  const stopReplyAnimation = () => {
    if (replyAnimationTimeoutRef.current) {
      clearTimeout(replyAnimationTimeoutRef.current);
      replyAnimationTimeoutRef.current = null;
    }
    setAnimatedReplyMessageId(null);
    setAnimatedReplyText("");
  };

  const startReplyAnimation = (messageId: number, fullText: string) => {
    stopReplyAnimation();
    setAnimatedReplyMessageId(messageId);
    setAnimatedReplyText("");

    let index = 0;
    const textLength = fullText.length;
    const tick = () => {
      index = Math.min(textLength, index + Math.max(1, Math.ceil(textLength / 80)));
      setAnimatedReplyText(fullText.slice(0, index));
      if (index >= textLength) {
        replyAnimationTimeoutRef.current = null;
        setAnimatedReplyMessageId(null);
        return;
      }
      replyAnimationTimeoutRef.current = setTimeout(tick, 18);
    };

    tick();
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
      stopReplyAnimation();
    };
  }, [user]);

  useEffect(() => {
    if (!messages.length) return;
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated: true });
    });
  }, [animatedReplyText, isCoachTyping, messages]);

  useEffect(() => {
    Animated.timing(menuTranslateX, {
      toValue: isMenuOpen ? 0 : 320,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [isMenuOpen, menuTranslateX]);

  const handlePreferenceChange = async (partial: Partial<CoachPreferences>) => {
    const nextPreferences: CoachPreferences = {
      language: partial.language || selectedLanguage,
      mode: partial.mode || selectedMode,
    };
    await syncPreferences(nextPreferences);

    if (!hasStartedConversation) {
      stopReplyAnimation();
      const nextMessages = await resetCoachConversation(user, nextPreferences);
      setMessages(nextMessages);
      setIsMenuOpen(false);
      return;
    }

    const languageChanged = nextPreferences.language !== selectedLanguage;
    const modeChanged = nextPreferences.mode !== selectedMode;
    if (languageChanged || modeChanged) {
      const nextMode = COACH_MODES.find((mode) => mode.id === nextPreferences.mode) || COACH_MODES[0];
      const nextLanguageLabel =
        languageOptions.find((option) => option.value === nextPreferences.language)?.label ||
        nextPreferences.language;

      await syncMessages([
        ...messages,
        {
          id: Date.now(),
          text: `Got it. We'll continue in ${nextLanguageLabel} with ${nextMode.label.toLowerCase()} mode.`,
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
    }

    setIsMenuOpen(false);
  };

  const handleNewConversation = async () => {
    stopReplyAnimation();
    const nextMessages = await resetCoachConversation(user, {
      language: selectedLanguage,
      mode: selectedMode,
    });
    setMessages(nextMessages);
    setIsMenuOpen(false);
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

      const coachReply: ChatMessage = {
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
      };

      await syncMessages([
        ...nextMessages,
        coachReply,
      ]);
      startReplyAnimation(coachReply.id, coachReply.text || "");
    } catch (error: any) {
      const fallbackMessage =
        error?.response?.data?.detail ||
        "The coach is unavailable right now. Please try again in a moment.";
      const coachReply: ChatMessage = {
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
      };
      await syncMessages([
        ...nextMessages,
        coachReply,
      ]);
      startReplyAnimation(coachReply.id, coachReply.text || "");
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
            <Text style={styles.topBarSubtitle}>
              {languageOptions.find((option) => option.value === selectedLanguage)?.label ||
                selectedLanguage}
              {" · "}
              {activeMode.label}
            </Text>
          </View>
          <Pressable onPress={() => setIsMenuOpen(true)} style={styles.iconButton}>
            <Ionicons name="menu" size={20} color={colors.text} />
          </Pressable>
        </View>

        {!hasStartedConversation ? (
          <View style={styles.emptyHero}>
            <CoachAvatar language={selectedLanguage} size={48} variant="flat" />
            <Text style={styles.emptyHeroTitle}>Practice with Lumi</Text>
            <Text style={styles.emptyHeroText}>
              Open the side menu for languages, modes, and quick-start prompts.
            </Text>
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
              <View
                style={[
                  styles.messageRow,
                  isMine ? styles.messageRowMine : styles.messageRowOther,
                ]}
              >
                {!isMine ? (
                  <View style={styles.botAvatarWrap}>
                    <CoachAvatar language={selectedLanguage} size={32} />
                  </View>
                ) : null}
                <View
                  style={[
                    styles.messageBubble,
                    isMine ? styles.messageBubbleMine : styles.messageBubbleOther,
                  ]}
                >
                  {!isMine ? <Text style={styles.botName}>Lumi</Text> : null}
                  <Text style={[styles.messageText, isMine ? styles.messageTextMine : undefined]}>
                    {animatedReplyMessageId === item.id ? animatedReplyText : item.text}
                  </Text>
                </View>
              </View>
            );
          }}
        />

        {isCoachTyping ? (
          <View style={styles.typingWrap}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.typingText}>
              Lumi is thinking in {activeMode.shortLabel.toLowerCase()} mode...
            </Text>
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

        <Modal
          visible={isMenuOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setIsMenuOpen(false)}
        >
          <Pressable style={styles.menuOverlay} onPress={() => setIsMenuOpen(false)}>
            <Animated.View
              style={[
                styles.menuPanel,
                {
                  transform: [{ translateX: menuTranslateX }],
                },
              ]}
            >
              <Pressable style={styles.menuPanelInner} onPress={() => {}}>
              <View style={styles.menuHeader}>
                <View style={styles.menuHeaderTextWrap}>
                  <Text style={styles.menuTitle}>Lumi Tools</Text>
                  <Text style={styles.menuSubtitle}>
                    Adjust your practice without leaving the chat.
                  </Text>
                </View>
                <Pressable onPress={() => setIsMenuOpen(false)} style={styles.menuCloseButton}>
                  <Ionicons name="close" size={18} color={colors.text} />
                </Pressable>
              </View>

              <ScrollView
                style={styles.menuScroll}
                contentContainerStyle={styles.menuScrollContent}
                showsVerticalScrollIndicator={false}
              >
                <Pressable onPress={handleNewConversation} style={styles.menuActionButton}>
                  <Ionicons name="refresh" size={16} color={colors.text} />
                  <Text style={styles.menuActionButtonText}>New conversation</Text>
                </Pressable>

                <View style={styles.menuSection}>
                  <Text style={styles.menuSectionLabel}>Language</Text>
                  <View style={styles.menuChipWrap}>
                    {languageOptions.map((option) => {
                      const isActive = option.value === selectedLanguage;
                      return (
                        <Pressable
                          key={option.value}
                          onPress={() => handlePreferenceChange({ language: option.value })}
                          style={[styles.chip, isActive ? styles.chipActive : undefined]}
                        >
                          <Text
                            style={[styles.chipText, isActive ? styles.chipTextActive : undefined]}
                          >
                            {option.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                <View style={styles.menuSection}>
                  <Text style={styles.menuSectionLabel}>Mode</Text>
                  <View style={styles.menuModeList}>
                    {COACH_MODES.map((mode) => {
                      const isActive = mode.id === selectedMode;
                      return (
                        <Pressable
                          key={mode.id}
                          onPress={() => handlePreferenceChange({ mode: mode.id })}
                          style={[
                            styles.menuModeCard,
                            isActive ? styles.menuModeCardActive : undefined,
                          ]}
                        >
                          <Text
                            style={[
                              styles.menuModeTitle,
                              isActive ? styles.menuModeTitleActive : undefined,
                            ]}
                          >
                            {mode.shortLabel}
                          </Text>
                          <Text
                            style={[
                              styles.menuModeText,
                              isActive ? styles.menuModeTextActive : undefined,
                            ]}
                          >
                            {mode.description}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                {!hasStartedConversation ? (
                  <View style={styles.menuSection}>
                    <View style={styles.quickPromptHeader}>
                      <Text style={styles.quickPromptTitle}>Quick Starts</Text>
                      <Text style={styles.quickPromptHint}>Tap one to send it</Text>
                    </View>
                    <View style={styles.quickPromptGrid}>
                      {COACH_QUICK_PROMPTS.map((prompt) => (
                        <Pressable
                          key={prompt}
                          style={styles.quickPromptCard}
                          onPress={() => {
                            setIsMenuOpen(false);
                            handleSend(prompt);
                          }}
                        >
                          <Text style={styles.quickPromptText}>{prompt}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                ) : null}

                <View style={styles.menuFooterCard}>
                  <Text style={styles.menuFooterEyebrow}>Current Setup</Text>
                  <Text style={styles.menuFooterTitle}>
                    {languageOptions.find((option) => option.value === selectedLanguage)?.label ||
                      selectedLanguage}
                    {" · "}
                    {activeMode.label}
                  </Text>
                  <Text style={styles.menuFooterText}>
                    Use the side menu to steer the session, then jump right back into the chat.
                  </Text>
                </View>
              </ScrollView>
              </Pressable>
            </Animated.View>
          </Pressable>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    flex: { flex: 1 },
    container: { flex: 1, backgroundColor: colors.background },
    centerState: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
    centerStateText: { color: colors.mutedText, fontFamily: fontFamilies.bodyMedium },
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
    topBarTitle: { color: colors.text, fontSize: 18, fontFamily: fontFamilies.displayBold },
    topBarSubtitle: {
      color: colors.mutedText,
      fontSize: 12,
      marginTop: 2,
      fontFamily: fontFamilies.bodyMedium,
    },
    emptyHero: {
      marginHorizontal: 14,
      marginBottom: 10,
      paddingHorizontal: 16,
      paddingVertical: 16,
      borderRadius: 24,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    emptyHeroTitle: {
      color: colors.text,
      fontSize: 18,
      fontFamily: fontFamilies.displayBold,
      marginTop: 12,
    },
    emptyHeroText: {
      color: colors.mutedText,
      fontSize: 13,
      lineHeight: 19,
      marginTop: 6,
      fontFamily: fontFamilies.bodyMedium,
    },
    menuOverlay: {
      flex: 1,
      backgroundColor: "rgba(15, 23, 42, 0.36)",
      alignItems: "flex-end",
    },
    menuPanel: {
      width: "84%",
      maxWidth: 360,
      height: "100%",
      alignSelf: "flex-end",
    },
    menuPanelInner: {
      flex: 1,
      backgroundColor: colors.background,
      paddingHorizontal: 16,
      paddingTop: 58,
      paddingBottom: 20,
      borderLeftWidth: 1,
      borderLeftColor: colors.border,
    },
    menuHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 12,
      marginBottom: 16,
    },
    menuHeaderTextWrap: { flex: 1 },
    menuTitle: {
      color: colors.text,
      fontSize: 20,
      fontFamily: fontFamilies.displaySemiBold,
    },
    menuSubtitle: {
      color: colors.mutedText,
      fontSize: 13,
      lineHeight: 18,
      marginTop: 4,
      fontFamily: fontFamilies.bodyMedium,
    },
    menuCloseButton: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    menuActionButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 12,
      borderRadius: 16,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 16,
    },
    menuActionButtonText: {
      color: colors.text,
      fontFamily: fontFamilies.bodyBold,
    },
    menuSection: {
      marginBottom: 18,
    },
    menuScroll: {
      flex: 1,
      marginHorizontal: -4,
    },
    menuScrollContent: {
      paddingHorizontal: 4,
      paddingBottom: 28,
    },
    menuSectionLabel: {
      color: colors.mutedText,
      fontSize: 11,
      fontFamily: fontFamilies.bodyBold,
      textTransform: "uppercase",
      letterSpacing: 1,
      marginBottom: 10,
    },
    menuChipWrap: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    chip: {
      paddingHorizontal: 12,
      paddingVertical: 9,
      borderRadius: 999,
      backgroundColor: colors.chipBackground,
    },
    chipActive: { backgroundColor: colors.activeChipBackground },
    chipText: { color: colors.chipText, fontFamily: fontFamilies.bodyBold },
    chipTextActive: { color: colors.activeChipText },
    menuModeList: { gap: 8 },
    menuModeCard: {
      borderRadius: 18,
      padding: 12,
      backgroundColor: colors.surfaceMuted,
      borderWidth: 1,
      borderColor: colors.border,
    },
    menuModeCardActive: {
      backgroundColor: colors.navy,
      borderColor: colors.navy,
    },
    menuModeTitle: { color: colors.text, fontFamily: fontFamilies.displaySemiBold, fontSize: 14 },
    menuModeTitleActive: { color: "#fff" },
    menuModeText: {
      color: colors.mutedText,
      fontSize: 12,
      lineHeight: 17,
      marginTop: 4,
      fontFamily: fontFamilies.bodyMedium,
    },
    menuModeTextActive: { color: "rgba(255,255,255,0.78)" },
    quickPromptHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 10,
    },
    quickPromptTitle: { color: colors.text, fontSize: 14, fontFamily: fontFamilies.displaySemiBold },
    quickPromptHint: { color: colors.mutedText, fontSize: 12, fontFamily: fontFamilies.bodyMedium },
    quickPromptGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    quickPromptCard: {
      width: "48%",
      borderRadius: 18,
      padding: 12,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    quickPromptText: {
      color: colors.text,
      fontSize: 13,
      lineHeight: 18,
      fontFamily: fontFamilies.bodySemiBold,
    },
    menuFooterCard: {
      marginTop: 6,
      borderRadius: 20,
      padding: 14,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    menuFooterEyebrow: {
      color: colors.mutedText,
      fontSize: 11,
      fontFamily: fontFamilies.bodyBold,
      textTransform: "uppercase",
      letterSpacing: 1,
    },
    menuFooterTitle: {
      color: colors.text,
      fontSize: 15,
      fontFamily: fontFamilies.displaySemiBold,
      marginTop: 8,
    },
    menuFooterText: {
      color: colors.mutedText,
      fontSize: 13,
      lineHeight: 18,
      marginTop: 6,
      fontFamily: fontFamilies.bodyMedium,
    },
    messageList: { flex: 1 },
    messageListContent: { paddingHorizontal: 14, paddingTop: 8, paddingBottom: 16, gap: 10 },
    messageRow: { flexDirection: "row", alignItems: "flex-end", marginBottom: 10 },
    messageRowMine: { justifyContent: "flex-end" },
    messageRowOther: { justifyContent: "flex-start" },
    botAvatarWrap: { marginRight: 8, marginBottom: 2 },
    botName: {
      color: colors.mutedText,
      fontSize: 11,
      fontFamily: fontFamilies.bodyBold,
      marginBottom: 4,
    },
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
    messageText: { color: colors.text, fontSize: 15, lineHeight: 21, fontFamily: fontFamilies.bodyMedium },
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
    typingText: { color: colors.mutedText, flex: 1, fontFamily: fontFamilies.bodyMedium },
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
