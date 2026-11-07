import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useReducedMotion } from "../components/chat/useReducedMotion";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { formatRelativeDue, languageLabel, phraseSourceLabel } from "../features/corrections";
import {
  addPhrase,
  deletePhrase,
  fetchPhrasebook,
  fetchPhrasebookReview,
  updatePhrase,
} from "../services/api/phrasebook";
import { getErrorMessage } from "../services/api/errors";
import { hapticSuccess } from "../services/haptics";
import { showToast, toastApiError } from "../services/toast";
import { fontFamilies } from "../theme/typography";
import { warmColors, type WarmColors } from "../theme/warm";
import type { PhrasebookEntry } from "../types";
import { PhraseFormSheet, type PhraseFormState, type PhraseFormValues } from "./phrasebook/PhraseFormSheet";

const PAGE_SIZE = 30;
const SEARCH_DEBOUNCE_MS = 300;

// Root stack route `Phrasebook`: saved phrases (search, language filter, paging), add/edit/delete,
// and the entry point to `PhrasebookReview`.
export function PhrasebookScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const { isDark } = useTheme();
  const warm = warmColors(isDark);
  const styles = useMemo(() => createStyles(warm), [warm]);
  const reduceMotion = useReducedMotion();

  const [entries, setEntries] = useState<PhrasebookEntry[]>([]);
  const [languages, setLanguages] = useState<string[]>([]);
  const [dueCount, setDueCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [nextDueAt, setNextDueAt] = useState<string | null>(null);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [language, setLanguage] = useState("");
  const [form, setForm] = useState<PhraseFormState>(null);

  const pageRef = useRef(1);
  const requestSeqRef = useRef(0);
  const loadingMoreRef = useRef(false);
  const filtersRef = useRef({ q: "", language: "" });
  filtersRef.current = { q: debouncedQuery, language };

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  /** Page 1 for the current filters (replaces the list); later pages append. */
  const load = useCallback(async (page: number, mode: "initial" | "refresh" | "more" | "silent") => {
    const seq = ++requestSeqRef.current;
    const { q, language: lang } = filtersRef.current;
    if (mode === "refresh") setRefreshing(true);
    if (mode === "more") {
      loadingMoreRef.current = true;
      setLoadingMore(true);
    }
    try {
      const data = await fetchPhrasebook({ page, pageSize: PAGE_SIZE, q, language: lang });
      if (seq !== requestSeqRef.current) return;
      pageRef.current = data.pagination?.page || page;
      setHasNext(Boolean(data.pagination?.has_next));
      setEntries((prev) => {
        if (page === 1) return data.entries || [];
        const seen = new Set(prev.map((entry) => entry.id));
        return [...prev, ...(data.entries || []).filter((entry) => !seen.has(entry.id))];
      });
      setDueCount(data.due_count || 0);
      setLanguages(data.languages || []);
      if (!q && !lang) setTotalCount(data.pagination?.total_count || 0);
      setLoadError("");
      // "All caught up": ask the review endpoint when the next card comes due.
      if (page === 1 && !data.due_count) {
        fetchPhrasebookReview()
          .then((review) => {
            if (seq !== requestSeqRef.current) return;
            setNextDueAt(review.next_due_at);
            setTotalCount(review.total_count || 0);
          })
          .catch(() => {});
      }
    } catch (error) {
      if (seq !== requestSeqRef.current) return;
      if (mode === "more") toastApiError(error, "Could not load more phrases.");
      else setLoadError(getErrorMessage(error, "Could not load your phrasebook."));
    } finally {
      if (seq === requestSeqRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
      if (mode === "more") {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      }
    }
  }, []);

  // Filters changed: back to page 1.
  const firstLoadRef = useRef(true);
  useEffect(() => {
    if (firstLoadRef.current) return;
    load(1, "silent");
  }, [debouncedQuery, language, load]);

  // On focus (first open, and back from a review): refresh counts and the list.
  useFocusEffect(
    useCallback(() => {
      load(1, firstLoadRef.current ? "initial" : "silent");
      firstLoadRef.current = false;
    }, [load])
  );

  const onEndReached = useCallback(() => {
    if (!hasNext || loadingMoreRef.current || loading) return;
    load(pageRef.current + 1, "more");
  }, [hasNext, load, loading]);

  const languageOptions = useMemo(() => {
    const set = new Set<string>();
    (user?.languages_practicing || []).forEach((value) => value && set.add(value.trim().toLowerCase()));
    languages.forEach((value) => value && set.add(value));
    return [...set];
  }, [languages, user?.languages_practicing]);
  const defaultLanguage = language || user?.languages_practicing?.[0]?.trim().toLowerCase() || "";

  const submitForm = useCallback(
    async (values: PhraseFormValues) => {
      if (!form) return;
      if (form.mode === "edit") {
        const entry = await updatePhrase(form.entry.id, {
          text: values.text,
          meaning: values.meaning,
          note: values.note,
          language: values.language,
        });
        setEntries((prev) => prev.map((item) => (item.id === entry.id ? entry : item)));
        setForm(null);
        showToast("Phrase updated", { variant: "success", durationMs: 2000 });
        return;
      }
      const { created } = await addPhrase({
        text: values.text,
        meaning: values.meaning || undefined,
        note: values.note || undefined,
        context: values.context || undefined,
        language: values.language || undefined,
      });
      setForm(null);
      hapticSuccess();
      showToast(created ? "Saved to phrasebook" : "Already in your phrasebook", {
        variant: created ? "success" : "info",
        durationMs: 2500,
      });
      load(1, "silent");
    },
    [form, load]
  );

  const confirmDelete = useCallback(
    (entry: PhrasebookEntry) => {
      Alert.alert("Delete this phrase?", `“${entry.text}” will be removed from your phrasebook.`, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            deletePhrase(entry.id)
              .then(() => {
                setEntries((prev) => prev.filter((item) => item.id !== entry.id));
                setTotalCount((count) => Math.max(0, count - 1));
                load(1, "silent");
              })
              .catch((error) => toastApiError(error, "Could not delete this phrase.", "Not deleted"));
          },
        },
      ]);
    },
    [load]
  );

  const openEntryMenu = useCallback(
    (entry: PhrasebookEntry) => {
      Alert.alert(entry.text, undefined, [
        { text: "Edit", onPress: () => setForm({ mode: "edit", entry }) },
        { text: "Delete", style: "destructive", onPress: () => confirmDelete(entry) },
        { text: "Cancel", style: "cancel" },
      ]);
    },
    [confirmDelete]
  );

  const renderEntry = useCallback(
    ({ item }: { item: PhrasebookEntry }) => (
      <EntryCard entry={item} warm={warm} styles={styles} onOpenMenu={openEntryMenu} />
    ),
    [openEntryMenu, styles, warm]
  );

  const filtered = Boolean(debouncedQuery || language);
  const header = (
    <View style={styles.headerBlock}>
      <View style={styles.reviewCard}>
        <View style={styles.reviewIcon}>
          <Ionicons name="albums-outline" size={20} color={warm.teal} />
        </View>
        <View style={styles.reviewBody}>
          {dueCount > 0 ? (
            <>
              <Text style={styles.reviewTitle}>
                {dueCount === 1 ? "1 phrase to review" : `${dueCount} phrases to review`}
              </Text>
              <Pressable
                style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
                onPress={() => navigation.navigate("PhrasebookReview")}
                accessibilityRole="button"
                accessibilityLabel={`Review ${dueCount} due`}
              >
                <Ionicons name="play" size={16} color={warm.onAction} />
                <Text style={styles.primaryButtonText}>Review {dueCount} due</Text>
              </Pressable>
            </>
          ) : totalCount > 0 ? (
            <>
              <Text style={styles.reviewTitle}>All caught up</Text>
              <Text style={styles.reviewText}>
                {nextDueAt ? `Next review ${formatRelativeDue(nextDueAt)}.` : "Nothing is due right now."}
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.reviewTitle}>Start your phrasebook</Text>
              <Text style={styles.reviewText}>
                Long-press a chat message or a correction and choose Save, or add a phrase yourself.
              </Text>
            </>
          )}
        </View>
      </View>

      <View style={styles.searchBox}>
        <Ionicons name="search" size={18} color={warm.mutedInk} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search phrases, meanings, notes"
          placeholderTextColor={warm.mutedInk}
          returnKeyType="search"
          autoCorrect={false}
          accessibilityLabel="Search your phrasebook"
        />
        {query ? (
          <Pressable onPress={() => setQuery("")} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear search">
            <Ionicons name="close-circle" size={18} color={warm.mutedInk} />
          </Pressable>
        ) : null}
      </View>

      {languages.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {["", ...languages].map((value) => {
            const selected = value === language;
            return (
              <Pressable
                key={value || "all"}
                style={[styles.chip, selected && styles.chipActive]}
                onPress={() => setLanguage(value)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={value ? `Show ${languageLabel(value)} phrases` : "Show all languages"}
              >
                <Text style={[styles.chipText, selected && styles.chipTextActive]}>
                  {value ? languageLabel(value) : "All"}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.topBar}>
        <Pressable
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={6}
        >
          <Ionicons name="chevron-back" size={20} color={warm.ink} />
        </Pressable>
        <Text style={styles.title} accessibilityRole="header">
          Phrasebook
        </Text>
        <Pressable
          style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
          onPress={() => setForm({ mode: "add" })}
          accessibilityRole="button"
          accessibilityLabel="Add phrase"
        >
          <Ionicons name="add" size={18} color={warm.onNavy} />
          <Text style={styles.addButtonText}>Add</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={warm.teal} accessibilityLabel="Loading your phrasebook" />
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderEntry}
          ListHeaderComponent={header}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          onEndReached={onEndReached}
          onEndReachedThreshold={0.4}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => load(1, "refresh")} tintColor={warm.teal} />
          }
          ListEmptyComponent={
            loadError ? (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>{loadError}</Text>
                <Pressable
                  style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
                  onPress={() => load(1, "initial")}
                  accessibilityRole="button"
                >
                  <Text style={styles.secondaryButtonText}>Try again</Text>
                </Pressable>
              </View>
            ) : filtered ? (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>No phrases match.</Text>
              </View>
            ) : undefined
          }
          ListFooterComponent={
            loadingMore ? <ActivityIndicator style={styles.footer} color={warm.teal} accessibilityLabel="Loading more" /> : undefined
          }
        />
      )}

      <PhraseFormSheet
        warm={warm}
        reduceMotion={reduceMotion}
        state={form}
        languageOptions={languageOptions}
        defaultLanguage={defaultLanguage}
        onClose={() => setForm(null)}
        onSubmit={submitForm}
      />
    </SafeAreaView>
  );
}

type EntryCardProps = {
  entry: PhrasebookEntry;
  warm: WarmColors;
  styles: ReturnType<typeof createStyles>;
  onOpenMenu: (entry: PhrasebookEntry) => void;
};

const EntryCard = React.memo(function EntryCard({ entry, warm, styles, onOpenMenu }: EntryCardProps) {
  const lang = languageLabel(entry.language);
  const source = phraseSourceLabel(entry.source);
  const label = [
    entry.text,
    entry.meaning ? `meaning ${entry.meaning}` : "",
    entry.context ? `context ${entry.context}` : "",
    entry.note ? `note ${entry.note}` : "",
    lang,
    source,
  ]
    .filter(Boolean)
    .join(", ");
  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onLongPress={() => onOpenMenu(entry)}
      delayLongPress={400}
      accessibilityLabel={label}
      accessibilityHint="Long-press for edit and delete"
      accessibilityActions={[{ name: "longpress", label: "Edit or delete" }]}
      onAccessibilityAction={() => onOpenMenu(entry)}
    >
      <View style={styles.cardTop}>
        <Text style={styles.cardText} selectable>
          {entry.text}
        </Text>
        <Pressable
          style={styles.moreButton}
          onPress={() => onOpenMenu(entry)}
          accessibilityRole="button"
          accessibilityLabel={`Options for ${entry.text}`}
          hitSlop={6}
        >
          <Ionicons name="ellipsis-horizontal" size={18} color={warm.inkSoft} />
        </Pressable>
      </View>
      {entry.meaning ? <Text style={styles.cardMeaning}>{entry.meaning}</Text> : null}
      {entry.context ? (
        <Text style={styles.cardContext} numberOfLines={3}>
          “{entry.context}”
        </Text>
      ) : null}
      {entry.note ? (
        <Text style={styles.cardNote}>
          <Text style={styles.cardNoteLabel}>Note: </Text>
          {entry.note}
        </Text>
      ) : null}
      <View style={styles.badges}>
        {lang ? (
          <View style={styles.badgeLanguage}>
            <Text style={styles.badgeLanguageText}>{lang}</Text>
          </View>
        ) : null}
        <View style={styles.badgeSource}>
          <Text style={styles.badgeSourceText}>{source}</Text>
        </View>
      </View>
    </Pressable>
  );
});

const createStyles = (warm: WarmColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: warm.cream },
    topBar: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    backButton: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
    title: { flex: 1, color: warm.ink, fontSize: 24, fontFamily: fontFamilies.displayBold },
    addButton: {
      minHeight: 40,
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 14,
      borderRadius: 999,
      backgroundColor: warm.navy,
    },
    addButtonText: { color: warm.onNavy, fontSize: 14, fontFamily: fontFamilies.bodyBold },
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    listContent: { paddingHorizontal: 16, paddingBottom: 32, gap: 10 },
    headerBlock: { gap: 12, marginBottom: 4 },
    reviewCard: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 12,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: warm.lineWarm,
      backgroundColor: warm.peachSoft,
      padding: 14,
    },
    reviewIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: warm.sage,
    },
    reviewBody: { flex: 1, gap: 8 },
    reviewTitle: { color: warm.ink, fontSize: 17, fontFamily: fontFamilies.displayBold },
    reviewText: { color: warm.mutedInk, fontSize: 13, lineHeight: 19, fontFamily: fontFamilies.bodySemiBold },
    primaryButton: {
      alignSelf: "flex-start",
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 18,
      borderRadius: 999,
      backgroundColor: warm.action,
    },
    primaryButtonText: { color: warm.onAction, fontSize: 15, fontFamily: fontFamilies.displaySemiBold },
    secondaryButton: {
      minHeight: 44,
      paddingHorizontal: 18,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: warm.line,
      backgroundColor: warm.secondary,
      alignItems: "center",
      justifyContent: "center",
    },
    secondaryButtonText: { color: warm.ink, fontSize: 14, fontFamily: fontFamilies.bodyBold },
    searchBox: {
      minHeight: 46,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 14,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: warm.line,
      backgroundColor: warm.paper,
    },
    searchInput: { flex: 1, minHeight: 44, color: warm.ink, fontSize: 15, fontFamily: fontFamilies.bodySemiBold },
    chipRow: { gap: 8, paddingRight: 8 },
    chip: {
      minHeight: 36,
      paddingHorizontal: 14,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: warm.line,
      backgroundColor: warm.paper,
      alignItems: "center",
      justifyContent: "center",
    },
    chipActive: { backgroundColor: warm.navy, borderColor: warm.navy },
    chipText: { color: warm.ink, fontSize: 13, fontFamily: fontFamilies.bodyBold },
    chipTextActive: { color: warm.onNavy },
    card: {
      borderRadius: 20,
      borderWidth: 1,
      borderColor: warm.line,
      backgroundColor: warm.paper,
      padding: 14,
      gap: 6,
    },
    cardPressed: { backgroundColor: warm.creamDeep },
    cardTop: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
    cardText: { flex: 1, color: warm.ink, fontSize: 17, lineHeight: 23, fontFamily: fontFamilies.displaySemiBold },
    moreButton: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
    cardMeaning: { color: warm.inkSoft, fontSize: 15, lineHeight: 21, fontFamily: fontFamilies.bodySemiBold },
    cardContext: {
      color: warm.mutedInk,
      fontSize: 13,
      lineHeight: 19,
      fontStyle: "italic",
      fontFamily: fontFamilies.bodyMedium,
    },
    cardNote: { color: warm.mutedInk, fontSize: 13, lineHeight: 19, fontFamily: fontFamilies.bodyMedium },
    cardNoteLabel: { fontFamily: fontFamilies.bodyBold },
    badges: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 2 },
    badgeLanguage: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, backgroundColor: warm.sage },
    badgeLanguageText: { color: warm.teal, fontSize: 12, fontFamily: fontFamilies.bodyBold },
    badgeSource: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, backgroundColor: warm.peach },
    badgeSourceText: { color: warm.peachInk, fontSize: 12, fontFamily: fontFamilies.bodyBold },
    empty: { alignItems: "center", gap: 12, paddingVertical: 32 },
    emptyText: { color: warm.mutedInk, fontSize: 14, textAlign: "center", fontFamily: fontFamilies.bodySemiBold },
    footer: { marginVertical: 16 },
    pressed: { opacity: 0.85 },
  });
