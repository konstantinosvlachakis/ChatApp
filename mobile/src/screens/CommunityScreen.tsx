import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
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
import { useNavigation, useRoute } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ExchangeCard } from "../components/people/ExchangeCard";
import { PeopleFilterSheet } from "../components/people/PeopleFilterSheet";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import {
  PEOPLE_SEGMENTS,
  activeFilterCount,
  filterLoadedPeople,
  languageLabel,
  mergePeoplePages,
  nativeLanguageOptions,
  type PeopleLevel,
  type PeopleSegment,
} from "../features/peopleMatching";
import { fetchPeople } from "../services/api/auth";
import { getErrorMessage, toApiError } from "../services/api/client";
import { createOrGetConversation } from "../services/api/conversations";
import { toastApiError } from "../services/toast";
import { fontFamilies } from "../theme/typography";
import { warmColors, type WarmColors } from "../theme/warm";
import type { PeopleCard } from "../types";

type RequestKind = "first" | "more" | "refresh";

/**
 * People discovery with server matching (mirrors web `pages/Community/page.tsx`):
 * `match` segment and `level` are server filters (they reset pagination); the native-language
 * filter and the text search apply to the loaded profiles, as on web.
 */
export function CommunityScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { user } = useAuth();
  const { isDark } = useTheme();
  const warm = warmColors(isDark);
  const styles = useMemo(() => createStyles(warm), [warm]);
  const viewerLanguage = user?.native_language || "";
  const viewerPracticing = user?.languages_practicing || [];

  // Server query.
  const [segment, setSegment] = useState<PeopleSegment>("all");
  const [level, setLevel] = useState<PeopleLevel>("");
  const [reloadKey, setReloadKey] = useState(0);
  // Client-side filters over loaded profiles.
  const [search, setSearch] = useState("");
  const [nativeFilter, setNativeFilter] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);

  const [profiles, setProfiles] = useState<PeopleCard[]>([]);
  const [hasNext, setHasNext] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  // True until the first page of the current query settles (skeleton, no empty-state flash).
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [moreError, setMoreError] = useState("");
  const [startingUsername, setStartingUsername] = useState("");

  // One request at a time: a new request (filter change, refresh) aborts the previous one, and
  // results are applied only while their controller is still the current one.
  const requestRef = useRef<AbortController | null>(null);
  const queryRef = useRef({ segment, level });
  const pageRef = useRef(1);
  const hasProfilesRef = useRef(false);
  hasProfilesRef.current = profiles.length > 0;
  const startingRef = useRef(false);

  const startRequest = useCallback(async (kind: RequestKind) => {
    const { segment: match, level: levelFilter } = queryRef.current;
    const page = kind === "more" ? pageRef.current + 1 : 1;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(kind === "first");
    setLoadingMore(kind === "more");
    setRefreshing(kind === "refresh");
    // A refresh keeps the current error/list on screen until it succeeds.
    if (kind === "more") setMoreError("");
    else if (kind === "first") setError("");

    try {
      const payload = await fetchPeople({ page, segment: match, level: levelFilter }, { signal: controller.signal });
      if (controller.signal.aborted) return;
      const next = payload.profiles || [];
      setProfiles((previous) => mergePeoplePages(previous, next, page === 1));
      pageRef.current = page;
      setHasNext(Boolean(payload.pagination?.has_next));
      setTotalCount(payload.pagination?.total_count ?? next.length);
      if (page === 1) setError("");
      setMoreError("");
    } catch (failure) {
      if (controller.signal.aborted || toApiError(failure).isAborted) return;
      const message = getErrorMessage(failure, "Could not load people. Please try again.");
      if (kind === "more") setMoreError(message);
      else if (kind === "refresh" && hasProfilesRef.current) toastApiError(failure, message, "Couldn't refresh");
      else setError(message);
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        setLoading(false);
        setLoadingMore(false);
        setRefreshing(false);
      }
    }
  }, []);

  // Server filters (and "Try again") load page 1 of the new query.
  useEffect(() => {
    queryRef.current = { segment, level };
    pageRef.current = 1;
    startRequest("first");
  }, [segment, level, reloadKey, startRequest]);

  useEffect(() => () => requestRef.current?.abort(), []);

  // "Find partners" from a Profile mission: show native speakers of that language.
  useEffect(() => {
    const prefillLanguage = route.params?.prefillLanguage;
    if (!prefillLanguage) return;
    setNativeFilter(String(prefillLanguage));
    setSearch("");
  }, [route.params?.fromMissionAt, route.params?.prefillLanguage]);

  const changeServerFilter = (nextSegment: PeopleSegment, nextLevel: PeopleLevel) => {
    if (nextSegment === segment && nextLevel === level) return;
    // Detach the old request so its `finally` can't clear `loading` before the new one starts.
    requestRef.current?.abort();
    requestRef.current = null;
    setProfiles([]);
    setHasNext(false);
    setTotalCount(0);
    setError("");
    setMoreError("");
    setLoading(true);
    setSegment(nextSegment);
    setLevel(nextLevel);
  };

  const loadMore = () => {
    if (requestRef.current || loading || refreshing || !hasNext || error || moreError) return;
    startRequest("more");
  };

  const refresh = () => {
    if (loading) return;
    startRequest("refresh");
  };

  const languageOptions = useMemo(() => nativeLanguageOptions(profiles, nativeFilter), [profiles, nativeFilter]);
  const filtered = useMemo(() => filterLoadedPeople(profiles, search, nativeFilter), [profiles, search, nativeFilter]);
  const featured = filtered[0];
  const morePeople = useMemo(() => filtered.slice(1), [filtered]);
  const filterCount = activeFilterCount(nativeFilter, level);
  const anythingToClear = filterCount > 0 || segment !== "all" || search.trim().length > 0;

  const clearFilters = () => {
    setSearch("");
    setNativeFilter("");
    changeServerFilter("all", "");
  };

  const applySheet = (next: { nativeFilter: string; level: PeopleLevel }) => {
    setNativeFilter(next.nativeFilter);
    changeServerFilter(segment, next.level);
    setSheetOpen(false);
  };

  const resetSheet = () => {
    setNativeFilter("");
    changeServerFilter(segment, "");
    setSheetOpen(false);
  };

  const viewProfile = useCallback(
    (profile: PeopleCard) => navigation.navigate("PublicProfile", { username: profile.username, profile }),
    [navigation]
  );

  const sayHello = useCallback(
    async (username: string) => {
      if (startingRef.current) return;
      startingRef.current = true;
      setStartingUsername(username);
      try {
        const { id } = await createOrGetConversation(username);
        if (!id) throw new Error("Missing conversation");
        navigation.navigate("Chats", {
          screen: "ChatsHome",
          params: { openConversationId: id, openFromBannerAt: Date.now() },
        });
      } catch (failure) {
        toastApiError(failure, `Could not open a conversation with ${username}. Please try again.`, "Failed");
      } finally {
        startingRef.current = false;
        setStartingUsername("");
      }
    },
    [navigation]
  );

  const renderItem = useCallback(
    ({ item }: { item: PeopleCard }) => (
      <ExchangeCard
        profile={item}
        viewerLanguage={viewerLanguage}
        busy={Boolean(startingUsername)}
        starting={startingUsername === item.username}
        onSayHello={sayHello}
        onViewProfile={viewProfile}
      />
    ),
    [viewerLanguage, startingUsername, sayHello, viewProfile]
  );

  const firstLoad = loading && profiles.length === 0;
  const countText = firstLoad
    ? "Finding people…"
    : `${filtered.length}${hasNext ? "+" : ""} ${filtered.length === 1 ? "person" : "people"} to meet`;
  const practicingSummary = viewerPracticing.length
    ? `${languageLabel(viewerPracticing[0])}${viewerPracticing.length > 1 ? ` +${viewerPracticing.length - 1}` : ""}`
    : "Add a practice language";

  const header = (
    <View>
      <Text style={styles.title} accessibilityRole="header">Find your next great conversation.</Text>
      <Text style={styles.subtitle}>Meet people who speak your next language. Share a little of yours.</Text>

      <Pressable
        style={styles.exchangeStrip}
        onPress={() => navigation.navigate("Profile")}
        accessibilityRole="button"
        accessibilityLabel="Edit your exchange languages"
      >
        <View style={styles.exchangeText}>
          <Text style={styles.exchangeCaption}>Your exchange</Text>
          <Text style={styles.exchangeValue} numberOfLines={1}>
            {viewerLanguage ? languageLabel(viewerLanguage) : "Add a native language"}
            <Text accessibilityElementsHidden importantForAccessibility="no"> ↔ </Text>
            {practicingSummary}
          </Text>
        </View>
        <Text style={styles.exchangeEdit}>Edit</Text>
      </Pressable>

      <View style={styles.searchRow}>
        <View style={styles.searchField}>
          <Ionicons name="search" size={18} color={warm.mutedInk} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search people, languages or goals"
            placeholderTextColor={warm.mutedInk}
            accessibilityLabel="Search loaded profiles"
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
          />
          {search ? (
            <Pressable onPress={() => setSearch("")} accessibilityRole="button" accessibilityLabel="Clear search" style={styles.clearSearch}>
              <Ionicons name="close-circle" size={18} color={warm.mutedInk} />
            </Pressable>
          ) : null}
        </View>
        <Pressable
          style={[styles.filterButton, filterCount > 0 && styles.filterButtonActive]}
          onPress={() => setSheetOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={filterCount > 0 ? `Filters, ${filterCount} active` : "Filters"}
        >
          <Ionicons name="options-outline" size={20} color={filterCount > 0 ? warm.teal : warm.ink} />
          {filterCount > 0 ? (
            <View style={styles.filterCount}>
              <Text style={styles.filterCountText}>{filterCount}</Text>
            </View>
          ) : null}
        </Pressable>
      </View>
      {search.trim() ? <Text style={styles.searchHint}>Searching loaded profiles</Text> : null}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.segments}
        accessibilityLabel="Exchange type"
      >
        {PEOPLE_SEGMENTS.map((entry) => {
          const selected = segment === entry.key;
          return (
            <Pressable
              key={entry.key}
              onPress={() => changeServerFilter(entry.key, level)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={[styles.segment, selected && styles.segmentSelected]}
            >
              <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>{entry.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <Text style={styles.count} accessibilityLiveRegion="polite">{countText}</Text>

      {featured ? (
        <ExchangeCard
          key={`featured-${featured.username}`}
          profile={featured}
          featured
          viewerLanguage={viewerLanguage}
          busy={Boolean(startingUsername)}
          starting={startingUsername === featured.username}
          onSayHello={sayHello}
          onViewProfile={viewProfile}
        />
      ) : null}
      {morePeople.length > 0 ? (
        <View style={styles.moreHeading}>
          <Text style={styles.moreTitle} accessibilityRole="header">More people to meet</Text>
          <Text style={styles.moreSubtitle}>A new perspective in every conversation</Text>
        </View>
      ) : null}
    </View>
  );

  let emptyState: React.ReactElement | null = null;
  if (!featured) {
    if (firstLoad) {
      emptyState = (
        <View style={styles.skeleton} accessibilityLabel="Finding your next connection" accessibilityRole="progressbar">
          <View style={styles.skeletonRow}>
            <View style={styles.skeletonPortrait} />
            <View style={styles.skeletonLines}>
              <View style={styles.skeletonLine} />
              <View style={[styles.skeletonLine, styles.skeletonLineShort]} />
            </View>
          </View>
          <View style={styles.skeletonLine} />
          <View style={[styles.skeletonLine, styles.skeletonLineShort]} />
          <Text style={styles.skeletonText}>Finding your next connection…</Text>
        </View>
      );
    } else if (error) {
      emptyState = (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>We couldn't load people.</Text>
          <Text style={styles.panelText}>{error}</Text>
          <Pressable style={styles.primaryButton} onPress={() => setReloadKey((value) => value + 1)} accessibilityRole="button">
            <Text style={styles.primaryButtonText}>Try again</Text>
          </Pressable>
        </View>
      );
    } else {
      emptyState = (
        <View style={styles.panel}>
          <Text style={styles.panelIcon} accessibilityElementsHidden importantForAccessibility="no">↔</Text>
          <Text style={styles.panelTitle}>No people in this view yet.</Text>
          <Text style={styles.panelText}>
            {hasNext
              ? "Nobody in the profiles loaded so far. Meet more people below, or try a wider filter."
              : "Try another language or a wider exchange filter. You might find an unexpected connection."}
          </Text>
          {anythingToClear ? (
            <Pressable style={styles.primaryButton} onPress={clearFilters} accessibilityRole="button">
              <Text style={styles.primaryButtonText}>Clear filters</Text>
            </Pressable>
          ) : null}
          <Pressable style={styles.textButton} onPress={() => navigation.navigate("Profile")} accessibilityRole="button">
            <Text style={styles.textButtonText}>Update your languages</Text>
          </Pressable>
        </View>
      );
    }
  }

  let footer: React.ReactElement | null = null;
  if (loadingMore) {
    footer = (
      <View style={styles.footer}>
        <ActivityIndicator color={warm.teal} />
        <Text style={styles.footerText}>Finding more people…</Text>
      </View>
    );
  } else if (moreError) {
    footer = (
      <View style={styles.footer}>
        <Text style={styles.footerText}>{moreError}</Text>
        <Pressable style={styles.secondaryButton} onPress={() => startRequest("more")} accessibilityRole="button">
          <Text style={styles.secondaryButtonText}>Try again</Text>
        </Pressable>
      </View>
    );
  } else if (hasNext && !loading && !error) {
    footer = (
      <View style={styles.footer}>
        <Pressable style={styles.secondaryButton} onPress={loadMore} accessibilityRole="button">
          <Text style={styles.secondaryButtonText}>Meet more people</Text>
        </Pressable>
        <Text style={styles.footerText}>
          {profiles.length} of {totalCount} profiles loaded
        </Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <FlatList
        data={morePeople}
        keyExtractor={(item) => item.username}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={header}
        ListEmptyComponent={emptyState ?? undefined}
        ListFooterComponent={footer ?? undefined}
        onEndReached={loadMore}
        onEndReachedThreshold={0.6}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={warm.teal} colors={[warm.action]} />
        }
      />
      <PeopleFilterSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        nativeFilter={nativeFilter}
        level={level}
        languageOptions={languageOptions}
        viewerLanguage={viewerLanguage}
        onApply={applySheet}
        onReset={resetSheet}
      />
    </SafeAreaView>
  );
}

const createStyles = (warm: WarmColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: warm.cream,
    },
    listContent: {
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 28,
      gap: 12,
    },
    title: {
      color: warm.ink,
      fontSize: 25,
      lineHeight: 32,
      fontFamily: fontFamilies.displayBold,
    },
    subtitle: {
      color: warm.mutedInk,
      fontSize: 14,
      lineHeight: 20,
      marginTop: 4,
      marginBottom: 14,
      fontFamily: fontFamilies.bodyMedium,
    },
    exchangeStrip: {
      minHeight: 56,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      backgroundColor: warm.paper,
      borderColor: warm.lineWarm,
      borderWidth: 1,
      borderRadius: 20,
      paddingHorizontal: 16,
      paddingVertical: 10,
      marginBottom: 12,
    },
    exchangeText: {
      flex: 1,
      minWidth: 0,
    },
    exchangeCaption: {
      color: warm.mutedInk,
      fontSize: 12,
      fontFamily: fontFamilies.bodyMedium,
    },
    exchangeValue: {
      color: warm.ink,
      fontSize: 14,
      fontFamily: fontFamilies.bodyBold,
    },
    exchangeEdit: {
      color: warm.teal,
      fontSize: 13,
      fontFamily: fontFamilies.bodyBold,
    },
    searchRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    searchField: {
      flex: 1,
      minHeight: 48,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: warm.paper,
      borderColor: warm.line,
      borderWidth: 1,
      borderRadius: 999,
      paddingLeft: 16,
      paddingRight: 4,
    },
    searchInput: {
      flex: 1,
      minHeight: 46,
      color: warm.ink,
      fontSize: 15,
      fontFamily: fontFamilies.bodyMedium,
    },
    clearSearch: {
      width: 44,
      height: 44,
      alignItems: "center",
      justifyContent: "center",
    },
    searchHint: {
      color: warm.mutedInk,
      fontSize: 12,
      marginTop: 6,
      marginLeft: 16,
      fontFamily: fontFamilies.bodyMedium,
    },
    filterButton: {
      width: 48,
      height: 48,
      borderRadius: 24,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: warm.paper,
      borderColor: warm.line,
      borderWidth: 1,
    },
    filterButtonActive: {
      backgroundColor: warm.sage,
      borderColor: warm.teal,
    },
    filterCount: {
      position: "absolute",
      top: -4,
      right: -4,
      minWidth: 20,
      height: 20,
      borderRadius: 10,
      paddingHorizontal: 5,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: warm.action,
    },
    filterCountText: {
      color: warm.onAction,
      fontSize: 12,
      fontFamily: fontFamilies.bodyBold,
    },
    segments: {
      gap: 8,
      paddingTop: 14,
      paddingBottom: 8,
    },
    segment: {
      minHeight: 44,
      justifyContent: "center",
      paddingHorizontal: 16,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: warm.line,
      backgroundColor: warm.paper,
    },
    segmentSelected: {
      backgroundColor: warm.sage,
      borderColor: warm.teal,
    },
    segmentText: {
      color: warm.mutedInk,
      fontSize: 13,
      fontFamily: fontFamilies.bodyBold,
    },
    segmentTextSelected: {
      color: warm.teal,
    },
    count: {
      color: warm.mutedInk,
      fontSize: 12,
      marginBottom: 12,
      fontFamily: fontFamilies.bodyMedium,
    },
    moreHeading: {
      marginTop: 22,
      marginBottom: 0,
    },
    moreTitle: {
      color: warm.ink,
      fontSize: 19,
      fontFamily: fontFamilies.displayBold,
    },
    moreSubtitle: {
      color: warm.mutedInk,
      fontSize: 13,
      marginTop: 2,
      fontFamily: fontFamilies.bodyMedium,
    },
    skeleton: {
      backgroundColor: warm.peachSoft,
      borderColor: warm.lineWarm,
      borderWidth: 1,
      borderRadius: 28,
      padding: 18,
      gap: 12,
    },
    skeletonRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
    },
    skeletonPortrait: {
      width: 112,
      height: 112,
      borderRadius: 56,
      backgroundColor: warm.peachStrong,
    },
    skeletonLines: {
      flex: 1,
      gap: 12,
    },
    skeletonLine: {
      height: 14,
      borderRadius: 7,
      backgroundColor: warm.skeleton,
    },
    skeletonLineShort: {
      width: "60%",
    },
    skeletonText: {
      color: warm.mutedInk,
      fontSize: 13,
      marginTop: 6,
      fontFamily: fontFamilies.bodyMedium,
    },
    panel: {
      alignItems: "center",
      backgroundColor: warm.paper,
      borderColor: warm.lineWarm,
      borderWidth: 1,
      borderRadius: 28,
      paddingHorizontal: 20,
      paddingVertical: 28,
      gap: 10,
    },
    panelIcon: {
      color: warm.peachInk,
      fontSize: 28,
      fontFamily: fontFamilies.displayBold,
    },
    panelTitle: {
      color: warm.ink,
      fontSize: 18,
      textAlign: "center",
      fontFamily: fontFamilies.displayBold,
    },
    panelText: {
      color: warm.mutedInk,
      fontSize: 14,
      lineHeight: 20,
      textAlign: "center",
      fontFamily: fontFamilies.bodyMedium,
    },
    primaryButton: {
      minHeight: 44,
      borderRadius: 999,
      paddingHorizontal: 22,
      marginTop: 6,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: warm.action,
    },
    primaryButtonText: {
      color: warm.onAction,
      fontSize: 14,
      fontFamily: fontFamilies.bodyBold,
    },
    secondaryButton: {
      minHeight: 44,
      borderRadius: 999,
      paddingHorizontal: 22,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: warm.secondary,
      borderColor: warm.lineWarm,
      borderWidth: 1,
    },
    secondaryButtonText: {
      color: warm.ink,
      fontSize: 14,
      fontFamily: fontFamilies.bodyBold,
    },
    textButton: {
      minHeight: 44,
      justifyContent: "center",
      paddingHorizontal: 12,
    },
    textButtonText: {
      color: warm.teal,
      fontSize: 14,
      fontFamily: fontFamilies.bodyBold,
    },
    footer: {
      alignItems: "center",
      gap: 8,
      paddingVertical: 16,
    },
    footerText: {
      color: warm.mutedInk,
      fontSize: 12,
      textAlign: "center",
      fontFamily: fontFamilies.bodyMedium,
    },
  });
