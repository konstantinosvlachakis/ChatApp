import React, { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { fetchChatOpeners } from "../../services/api/conversations";
import { fontFamilies } from "../../theme/typography";
import type { WarmColors } from "../../theme/warm";

// One fetch per chat per app session: the server caches AI lines for a week anyway.
const openersByConversation = new Map<number, string[]>();

type Props = {
  conversationId: number;
  warm: WarmColors;
  onPick: (line: string) => void;
};

/**
 * Empty-chat ideas (web ChatOpeners): three opening lines from
 * `GET /conversations/<id>/openers/`; tapping one puts it in the composer as a draft.
 * Renders nothing when the lines can't be loaded (the empty state's greeting stays).
 */
export function ChatOpeners({ conversationId, warm, onPick }: Props) {
  const styles = useMemo(() => createStyles(warm), [warm]);
  const [lines, setLines] = useState<string[] | null>(() => openersByConversation.get(conversationId) ?? null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const cached = openersByConversation.get(conversationId);
    if (cached) {
      setLines(cached);
      return undefined;
    }
    const controller = new AbortController();
    setLines(null);
    setFailed(false);
    fetchChatOpeners(conversationId, controller.signal)
      .then((next) => {
        openersByConversation.set(conversationId, next);
        setLines(next);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [conversationId]);

  if (failed || (lines && !lines.length)) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.heading}>
        <Ionicons name="sparkles-outline" size={15} color={warm.peachInk} />
        <Text style={styles.headingText} accessibilityRole="header">Ideas to start with</Text>
      </View>
      {lines ? (
        lines.map((line) => (
          <Pressable
            key={line}
            onPress={() => onPick(line)}
            accessibilityRole="button"
            accessibilityHint="Puts this line in your message box"
            style={({ pressed }) => [styles.line, pressed && styles.pressed]}
          >
            <Ionicons name="chatbubble-outline" size={16} color={warm.peachInk} style={styles.lineIcon} />
            <Text style={styles.lineText}>{line}</Text>
          </Pressable>
        ))
      ) : (
        <View accessibilityRole="progressbar" accessibilityLabel="Finding opening lines" style={styles.skeletons}>
          {[0, 1, 2].map((key) => <View key={key} style={styles.skeleton} />)}
        </View>
      )}
    </View>
  );
}

/** Test/session helper: forget fetched lines. */
export const resetChatOpenersCache = () => openersByConversation.clear();

const createStyles = (warm: WarmColors) =>
  StyleSheet.create({
    wrap: { alignSelf: "stretch", gap: 8, marginTop: 14 },
    heading: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 2 },
    headingText: { color: warm.inkSoft, fontSize: 13, fontFamily: fontFamilies.bodyBold },
    line: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: warm.lineWarm,
      backgroundColor: warm.paper,
    },
    lineIcon: { marginTop: 2 },
    lineText: { flex: 1, color: warm.ink, fontSize: 14, lineHeight: 20, fontFamily: fontFamilies.bodyMedium },
    skeletons: { gap: 8 },
    skeleton: { height: 46, borderRadius: 16, backgroundColor: warm.skeleton },
    pressed: { opacity: 0.75 },
  });
