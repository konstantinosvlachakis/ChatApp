import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";
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
import { getErrorMessage } from "../services/api/errors";
import { getMessageGroupFlags } from "../components/chat/messageGroups";
import { SendButton } from "../components/chat/SendButton";
import { useReducedMotion } from "../components/chat/useReducedMotion";
import type { ChatMessage } from "../types";
import { fontFamilies } from "../theme/typography";
import { warmColors, type WarmColors } from "../theme/warm";

export function CoachChatScreen() {
  const replyAnimationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const { isDark } = useTheme();
  const warm = warmColors(isDark);
  const styles = useMemo(() => createStyles(warm), [warm]);
  const reduceMotion = useReducedMotion();
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

  // Latest messages (updated synchronously by syncMessages) so async appends never use a stale list.
  const messagesRef = useRef<ChatMessage[]>(messages);
  messagesRef.current = messages;
  // In-flight send guard, set before the first await (state updates are too late for double taps).
  const sendInFlightRef = useRef(false);
  // Bumped on new conversation / mode / language change; replies from an older generation are dropped.
  const generationRef = useRef(0);

  const activeMode = COACH_MODES.find((mode) => mode.id === selectedMode) || COACH_MODES[0];
  const hasStartedConversation = messages.length > 1;
  // Bubble grouping like the people chats (sender change, new day or a 5 min pause).
  const groupFlags = useMemo(() => getMessageGroupFlags(messages), [messages]);

  const syncMessages = async (nextMessages: ChatMessage[]) => {
    messagesRef.current = nextMessages;
    setMessages(nextMessages);
    await persistCoachMessages(user, nextMessages);
  };

  const startNewGeneration = () => {
    generationRef.current += 1;
    sendInFlightRef.current = false;
    setIsCoachTyping(false);
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
      messagesRef.current = storedMessages;
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
    const toValue = isMenuOpen ? 0 : 320;
    if (reduceMotion) {
      menuTranslateX.setValue(toValue);
      return;
    }
    Animated.timing(menuTranslateX, {
      toValue,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [isMenuOpen, menuTranslateX, reduceMotion]);

  const handlePreferenceChange = async (partial: Partial<CoachPreferences>) => {
    const nextPreferences: CoachPreferences = {
      language: partial.language || selectedLanguage,
      mode: partial.mode || selectedMode,
    };
    const languageChanged = nextPreferences.language !== selectedLanguage;
    const modeChanged = nextPreferences.mode !== selectedMode;
    if (!hasStartedConversation || languageChanged || modeChanged) {
      startNewGeneration();
    }
    const generation = generationRef.current;
    await syncPreferences(nextPreferences);

    if (!hasStartedConversation) {
      stopReplyAnimation();
      const nextMessages = await resetCoachConversation(user, nextPreferences);
      if (generationRef.current !== generation) return;
      messagesRef.current = nextMessages;
      setMessages(nextMessages);
      setIsMenuOpen(false);
      return;
    }

    if (languageChanged || modeChanged) {
      const nextMode = COACH_MODES.find((mode) => mode.id === nextPreferences.mode) || COACH_MODES[0];
      const nextLanguageLabel =
        languageOptions.find((option) => option.value === nextPreferences.language)?.label ||
        nextPreferences.language;

      if (generationRef.current !== generation) return;
      await syncMessages([
        ...messagesRef.current,
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
    startNewGeneration();
    const generation = generationRef.current;
    stopReplyAnimation();
    const nextMessages = await resetCoachConversation(user, {
      language: selectedLanguage,
      mode: selectedMode,
    });
    if (generationRef.current !== generation) return;
    messagesRef.current = nextMessages;
    setMessages(nextMessages);
    setIsMenuOpen(false);
  };

  const handleSend = async (value = input) => {
    const trimmed = value.trim();
    if (!trimmed || !user || isCoachTyping || sendInFlightRef.current) return;
    sendInFlightRef.current = true;
    setIsCoachTyping(true);
    const generation = generationRef.current;

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

    setInput("");

    try {
      await syncMessages([...messagesRef.current, outgoingMessage]);
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

      // The user started over (or switched mode/language) while waiting: drop this reply.
      if (generationRef.current !== generation) return;
      await syncMessages([
        ...messagesRef.current,
        coachReply,
      ]);
      startReplyAnimation(coachReply.id, coachReply.text || "");
    } catch (error) {
      if (generationRef.current !== generation) return;
      // Shown as the coach's reply bubble (the chat itself is the feedback surface).
      const fallbackMessage = getErrorMessage(
        error,
        "The coach is unavailable right now. Please try again in a moment."
      );
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
        ...messagesRef.current,
        coachReply,
      ]);
      startReplyAnimation(coachReply.id, coachReply.text || "");
    } finally {
      // A newer generation already reset the guard and may have its own send in flight.
      if (generationRef.current === generation) {
        sendInFlightRef.current = false;
        setIsCoachTyping(false);
      }
    }
  };

  const languageLabel =
    languageOptions.find((option) => option.value === selectedLanguage)?.label || selectedLanguage;

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <View style={styles.centerState} accessibilityLiveRegion="polite">
          <ActivityIndicator color={warm.teal} />
          <Text style={styles.centerStateText}>Loading Lumi…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        <View style={styles.header}>
          <View style={styles.topBar}>
            <Pressable
              onPress={() => navigation.goBack()}
              style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Back to chats"
            >
              <Ionicons name="chevron-back" size={24} color={warm.ink} />
            </Pressable>
            <CoachAvatar language={selectedLanguage} size={40} hideBadge />
            <View style={styles.topBarTitleWrap}>
              <View style={styles.titleRow}>
                <Text style={styles.topBarTitle}>Lumi</Text>
                <View style={styles.aiTag}>
                  <Text style={styles.aiTagText}>AI</Text>
                </View>
              </View>
              <Text style={[styles.topBarSubtitle, isCoachTyping && styles.topBarSubtitleActive]} numberOfLines={1}>
                {isCoachTyping ? "thinking…" : "Your practice companion"}
              </Text>
            </View>
            <Pressable
              onPress={() => setIsMenuOpen(true)}
              style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Lumi tools: language, mode and new conversation"
            >
              <Ionicons name="options-outline" size={22} color={warm.ink} />
            </Pressable>
          </View>
          <View style={styles.setupBar}>
            <Pressable
              onPress={() => setIsMenuOpen(true)}
              style={({ pressed }) => [styles.setupPill, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={`Language: ${languageLabel}. Change`}
            >
              <Ionicons name="globe-outline" size={15} color={warm.teal} />
              <Text style={styles.setupPillText} numberOfLines={1}>
                {languageLabel}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setIsMenuOpen(true)}
              style={({ pressed }) => [styles.setupPill, styles.setupPillMode, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={`Mode: ${activeMode.label}. Change`}
            >
              <Ionicons name="sparkles-outline" size={15} color={warm.peachInk} />
              <Text style={styles.setupPillText} numberOfLines={1}>
                {activeMode.shortLabel}
              </Text>
            </Pressable>
          </View>
        </View>

        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => String(item.id)}
          style={styles.messageList}
          contentContainerStyle={styles.messageListContent}
          ListHeaderComponent={
            !hasStartedConversation ? (
              <View style={styles.emptyHero}>
                <CoachAvatar language={selectedLanguage} size={56} variant="flat" />
                <Text style={styles.emptyHeroTitle}>Practice with Lumi</Text>
                <Text style={styles.emptyHeroText}>
                  Chat in {languageLabel}, get gentle corrections, or try a quick start below.
                </Text>
                <View style={styles.heroPrompts}>
                  {COACH_QUICK_PROMPTS.slice(0, 3).map((prompt) => (
                    <Pressable
                      key={prompt}
                      style={({ pressed }) => [styles.heroPrompt, pressed && styles.pressed]}
                      onPress={() => handleSend(prompt)}
                      disabled={isCoachTyping}
                      accessibilityRole="button"
                      accessibilityLabel={`Send: ${prompt}`}
                    >
                      <Text style={styles.heroPromptText}>{prompt}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null
          }
          ListFooterComponent={
            isCoachTyping ? (
              <View style={[styles.messageRow, styles.messageRowStartsGroup]} accessibilityLiveRegion="polite">
                <View style={styles.avatarSlot}>
                  <CoachAvatar language={selectedLanguage} size={28} hideBadge />
                </View>
                <View style={[styles.messageBubble, styles.messageBubbleOther, styles.typingBubble]}>
                  <ActivityIndicator size="small" color={warm.teal} />
                  <Text style={styles.typingText}>
                    Lumi is thinking in {activeMode.shortLabel.toLowerCase()} mode…
                  </Text>
                </View>
              </View>
            ) : null
          }
          renderItem={({ item }) => {
            const isMine = item.sender.id !== COACH_BOT_ID;
            const flags = groupFlags[item.id];
            const startsGroup = flags?.startsGroup ?? true;
            const endsGroup = flags?.endsGroup ?? true;
            return (
              <>
                {flags?.dayLabel ? (
                  <View style={styles.daySeparatorRow}>
                    <View style={styles.daySeparatorPill}>
                      <Text style={styles.daySeparatorText}>{flags.dayLabel}</Text>
                    </View>
                  </View>
                ) : null}
                <View
                  style={[
                    styles.messageRow,
                    startsGroup && styles.messageRowStartsGroup,
                    isMine ? styles.messageRowMine : styles.messageRowOther,
                  ]}
                >
                  {!isMine ? (
                    <View style={styles.avatarSlot}>
                      {endsGroup ? <CoachAvatar language={selectedLanguage} size={28} hideBadge /> : null}
                    </View>
                  ) : null}
                  <View
                    style={[
                      styles.messageBubble,
                      isMine ? styles.messageBubbleMine : styles.messageBubbleOther,
                      !startsGroup && (isMine ? styles.messageMineJoinedTop : styles.messageOtherJoinedTop),
                    ]}
                  >
                    <Text style={styles.messageText}>
                      {animatedReplyMessageId === item.id ? animatedReplyText : item.text}
                    </Text>
                  </View>
                </View>
              </>
            );
          }}
        />

        <View style={styles.composer}>
          <View style={styles.composerPill}>
            <TextInput
              style={styles.input}
              value={input}
              onChangeText={setInput}
              placeholder={`Message Lumi in ${languageLabel}`}
              placeholderTextColor={warm.mutedInk}
              multiline
              accessibilityLabel="Message Lumi"
            />
          </View>
          <SendButton
            warm={warm}
            visible={input.trim().length > 0}
            disabled={isCoachTyping}
            busy={isCoachTyping}
            accessibilityLabel="Send to Lumi"
            onPress={() => handleSend()}
          />
        </View>

        <Modal
          visible={isMenuOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setIsMenuOpen(false)}
        >
          <Pressable
            style={styles.menuOverlay}
            onPress={() => setIsMenuOpen(false)}
            accessibilityRole="button"
            accessibilityLabel="Close Lumi tools"
          >
            <Animated.View
              style={[
                styles.menuPanel,
                {
                  transform: [{ translateX: menuTranslateX }],
                },
              ]}
            >
              <Pressable style={styles.menuPanelInner} onPress={() => {}} accessible={false}>
              <View style={styles.menuHeader}>
                <View style={styles.menuHeaderTextWrap}>
                  <Text style={styles.menuTitle} accessibilityRole="header">Lumi tools</Text>
                  <Text style={styles.menuSubtitle}>
                    Adjust your practice without leaving the chat.
                  </Text>
                </View>
                <Pressable
                  onPress={() => setIsMenuOpen(false)}
                  style={styles.menuCloseButton}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                >
                  <Ionicons name="close" size={20} color={warm.ink} />
                </Pressable>
              </View>

              <ScrollView
                style={styles.menuScroll}
                contentContainerStyle={styles.menuScrollContent}
                showsVerticalScrollIndicator={false}
              >
                <Pressable
                  onPress={handleNewConversation}
                  style={({ pressed }) => [styles.menuActionButton, pressed && styles.pressed]}
                  accessibilityRole="button"
                >
                  <Ionicons name="refresh" size={18} color={warm.onNavy} />
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
                          accessibilityRole="button"
                          accessibilityState={{ selected: isActive }}
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
                          accessibilityRole="button"
                          accessibilityState={{ selected: isActive }}
                        >
                          <Text
                            style={[
                              styles.menuModeTitle,
                              isActive ? styles.menuModeTitleActive : undefined,
                            ]}
                          >
                            {mode.shortLabel}
                          </Text>
                          <Text style={styles.menuModeText}>{mode.description}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                {!hasStartedConversation ? (
                  <View style={styles.menuSection}>
                    <View style={styles.quickPromptHeader}>
                      <Text style={styles.quickPromptTitle}>Quick starts</Text>
                      <Text style={styles.quickPromptHint}>Tap one to send it</Text>
                    </View>
                    <View style={styles.quickPromptGrid}>
                      {COACH_QUICK_PROMPTS.map((prompt) => (
                        <Pressable
                          key={prompt}
                          style={({ pressed }) => [styles.quickPromptCard, pressed && styles.pressed]}
                          onPress={() => {
                            setIsMenuOpen(false);
                            handleSend(prompt);
                          }}
                          accessibilityRole="button"
                        >
                          <Text style={styles.quickPromptText}>{prompt}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                ) : null}

                <View style={styles.menuFooterCard}>
                  <Text style={styles.menuFooterEyebrow}>Current setup</Text>
                  <Text style={styles.menuFooterTitle}>
                    {languageLabel}
                    {" · "}
                    {activeMode.label}
                  </Text>
                  <Text style={styles.menuFooterText}>
                    Use this menu to steer the session, then jump right back into the chat.
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

const BUBBLE_RADIUS = 20;
const JOINED_RADIUS = 6;

const createStyles = (warm: WarmColors) =>
  StyleSheet.create({
    flex: { flex: 1 },
    container: { flex: 1, backgroundColor: warm.paper },
    pressed: { opacity: 0.8 },
    centerState: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
    centerStateText: { color: warm.mutedInk, fontSize: 14, fontFamily: fontFamilies.bodyMedium },
    header: {
      backgroundColor: warm.paper,
      borderBottomWidth: 1,
      borderBottomColor: warm.line,
      paddingBottom: 8,
    },
    topBar: {
      paddingHorizontal: 6,
      paddingTop: 6,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    iconButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
    },
    topBarTitleWrap: { flex: 1, minWidth: 0 },
    titleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
    topBarTitle: { color: warm.ink, fontSize: 17, fontFamily: fontFamilies.displayBold },
    aiTag: {
      borderRadius: 999,
      paddingHorizontal: 7,
      paddingVertical: 1,
      backgroundColor: warm.sage,
    },
    aiTagText: { color: warm.teal, fontSize: 12, fontFamily: fontFamilies.bodyExtraBold },
    topBarSubtitle: {
      color: warm.mutedInk,
      fontSize: 13,
      marginTop: 1,
      fontFamily: fontFamilies.bodyMedium,
    },
    topBarSubtitleActive: {
      color: warm.teal,
      fontFamily: fontFamilies.bodyBold,
    },
    setupBar: {
      flexDirection: "row",
      gap: 8,
      paddingHorizontal: 14,
      paddingTop: 6,
    },
    setupPill: {
      flexShrink: 1,
      minHeight: 36,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      borderRadius: 999,
      paddingHorizontal: 12,
      backgroundColor: warm.sage,
    },
    setupPillMode: {
      backgroundColor: warm.peach,
    },
    setupPillText: {
      color: warm.ink,
      fontSize: 13,
      fontFamily: fontFamilies.bodyBold,
    },
    emptyHero: {
      marginTop: 12,
      marginBottom: 8,
      padding: 18,
      borderRadius: 28,
      backgroundColor: warm.peachSoft,
      borderWidth: 1,
      borderColor: warm.lineWarm,
      alignItems: "flex-start",
    },
    emptyHeroTitle: {
      color: warm.ink,
      fontSize: 20,
      fontFamily: fontFamilies.displayBold,
      marginTop: 12,
    },
    emptyHeroText: {
      color: warm.mutedInk,
      fontSize: 14,
      lineHeight: 21,
      marginTop: 6,
      fontFamily: fontFamilies.bodyRegular,
    },
    heroPrompts: {
      alignSelf: "stretch",
      gap: 8,
      marginTop: 14,
    },
    heroPrompt: {
      minHeight: 44,
      justifyContent: "center",
      borderRadius: 999,
      paddingHorizontal: 16,
      paddingVertical: 10,
      backgroundColor: warm.paper,
      borderWidth: 1,
      borderColor: warm.lineWarm,
    },
    heroPromptText: {
      color: warm.ink,
      fontSize: 14,
      fontFamily: fontFamilies.bodySemiBold,
    },
    menuOverlay: {
      flex: 1,
      backgroundColor: warm.scrim,
      alignItems: "flex-end",
    },
    menuPanel: {
      width: "86%",
      maxWidth: 360,
      height: "100%",
      alignSelf: "flex-end",
    },
    menuPanelInner: {
      flex: 1,
      backgroundColor: warm.cream,
      paddingHorizontal: 16,
      paddingTop: 58,
      paddingBottom: 20,
      borderTopLeftRadius: 28,
      borderBottomLeftRadius: 28,
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
      color: warm.ink,
      fontSize: 20,
      fontFamily: fontFamilies.displayBold,
    },
    menuSubtitle: {
      color: warm.mutedInk,
      fontSize: 13,
      lineHeight: 18,
      marginTop: 4,
      fontFamily: fontFamilies.bodyMedium,
    },
    menuCloseButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: warm.paper,
      borderWidth: 1,
      borderColor: warm.line,
    },
    menuActionButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      minHeight: 46,
      paddingHorizontal: 16,
      borderRadius: 999,
      backgroundColor: warm.navy,
      marginBottom: 18,
    },
    menuActionButtonText: {
      color: warm.onNavy,
      fontSize: 15,
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
      color: warm.teal,
      fontSize: 12,
      fontFamily: fontFamilies.bodyExtraBold,
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
      minHeight: 44,
      justifyContent: "center",
      paddingHorizontal: 14,
      borderRadius: 999,
      backgroundColor: warm.paper,
      borderWidth: 1,
      borderColor: warm.line,
    },
    chipActive: { backgroundColor: warm.sage, borderColor: warm.teal },
    chipText: { color: warm.ink, fontSize: 14, fontFamily: fontFamilies.bodyBold },
    chipTextActive: { color: warm.teal },
    menuModeList: { gap: 8 },
    menuModeCard: {
      borderRadius: 20,
      padding: 12,
      backgroundColor: warm.paper,
      borderWidth: 1,
      borderColor: warm.line,
    },
    menuModeCardActive: {
      backgroundColor: warm.peachSoft,
      borderColor: warm.peachInk,
    },
    menuModeTitle: { color: warm.ink, fontFamily: fontFamilies.displaySemiBold, fontSize: 14 },
    menuModeTitleActive: { color: warm.peachInk },
    menuModeText: {
      color: warm.mutedInk,
      fontSize: 13,
      lineHeight: 18,
      marginTop: 4,
      fontFamily: fontFamilies.bodyMedium,
    },
    quickPromptHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 10,
    },
    quickPromptTitle: { color: warm.ink, fontSize: 14, fontFamily: fontFamilies.displaySemiBold },
    quickPromptHint: { color: warm.mutedInk, fontSize: 12, fontFamily: fontFamilies.bodyMedium },
    quickPromptGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    quickPromptCard: {
      width: "48%",
      borderRadius: 18,
      padding: 12,
      backgroundColor: warm.paper,
      borderWidth: 1,
      borderColor: warm.line,
    },
    quickPromptText: {
      color: warm.ink,
      fontSize: 13,
      lineHeight: 18,
      fontFamily: fontFamilies.bodySemiBold,
    },
    menuFooterCard: {
      marginTop: 6,
      borderRadius: 22,
      padding: 14,
      backgroundColor: warm.sage,
    },
    menuFooterEyebrow: {
      color: warm.teal,
      fontSize: 12,
      fontFamily: fontFamilies.bodyExtraBold,
      textTransform: "uppercase",
      letterSpacing: 1,
    },
    menuFooterTitle: {
      color: warm.ink,
      fontSize: 15,
      fontFamily: fontFamilies.displaySemiBold,
      marginTop: 8,
    },
    menuFooterText: {
      color: warm.inkSoft,
      fontSize: 13,
      lineHeight: 18,
      marginTop: 6,
      fontFamily: fontFamilies.bodyMedium,
    },
    messageList: { flex: 1 },
    messageListContent: { paddingHorizontal: 12, paddingTop: 4, paddingBottom: 16 },
    daySeparatorRow: { alignItems: "center", marginTop: 14, marginBottom: 4 },
    daySeparatorPill: {
      borderRadius: 999,
      backgroundColor: warm.creamDeep,
      paddingHorizontal: 12,
      paddingVertical: 4,
    },
    daySeparatorText: { color: warm.inkSoft, fontSize: 12, fontFamily: fontFamilies.bodyBold },
    messageRow: { flexDirection: "row", alignItems: "flex-end", marginTop: 2 },
    messageRowStartsGroup: { marginTop: 12 },
    messageRowMine: { justifyContent: "flex-end" },
    messageRowOther: { justifyContent: "flex-start" },
    avatarSlot: { width: 28, marginRight: 8, marginBottom: 2 },
    messageBubble: {
      maxWidth: "78%",
      borderRadius: BUBBLE_RADIUS,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    messageBubbleMine: {
      backgroundColor: warm.bubbleOut,
      borderBottomRightRadius: JOINED_RADIUS,
    },
    messageMineJoinedTop: { borderTopRightRadius: JOINED_RADIUS },
    messageBubbleOther: {
      backgroundColor: warm.bubbleIn,
      borderBottomLeftRadius: JOINED_RADIUS,
    },
    messageOtherJoinedTop: { borderTopLeftRadius: JOINED_RADIUS },
    messageText: { color: warm.ink, fontSize: 15, lineHeight: 22, fontFamily: fontFamilies.bodyMedium },
    typingBubble: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    typingText: { color: warm.inkSoft, fontSize: 14, flexShrink: 1, fontFamily: fontFamilies.bodyMedium },
    composer: {
      paddingHorizontal: 10,
      paddingTop: 8,
      paddingBottom: 8,
      borderTopWidth: 1,
      borderTopColor: warm.line,
      backgroundColor: warm.paper,
      flexDirection: "row",
      alignItems: "flex-end",
    },
    composerPill: {
      flex: 1,
      minHeight: 44,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: warm.line,
      backgroundColor: warm.cream,
      paddingHorizontal: 16,
    },
    input: {
      minHeight: 42,
      maxHeight: 120,
      color: warm.ink,
      fontSize: 15,
      fontFamily: fontFamilies.bodyMedium,
      paddingTop: 11,
      paddingBottom: 11,
    },
  });
