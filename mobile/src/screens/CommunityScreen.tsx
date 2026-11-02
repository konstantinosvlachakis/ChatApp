import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ExchangeCard } from "../components/people/ExchangeCard";
import { PeopleDiscoveryHeader } from "../components/people/PeopleDiscoveryHeader";
import { PerfectMatchesRail } from "../components/people/PerfectMatchesRail";
import { PeopleFilterSheet } from "../components/people/PeopleFilterSheet";
import { VerifyEmailBanner } from "../components/VerifyEmailBanner";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import {
  activeFilterCount,
  filterLoadedPeople,
  mergePeoplePages,
  nativeLanguageOptions,
  splitPerfectMatches,
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
  const { perfect, remaining } = useMemo(() => splitPerfectMatches(filtered), [filtered]);
  const featured = perfect.length ? undefined : remaining[0];
  const morePeople = useMemo(() => perfect.length ? remaining : remaining.slice(1), [perfect, remaining]);
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
  const header = (
    <View>
      <PeopleDiscoveryHeader
        warm={warm}
        nativeLanguage={viewerLanguage}
        practicingLanguages={viewerPracticing}
        search={search}
        onSearchChange={setSearch}
        segment={segment}
        onSegmentChange={(next) => changeServerFilter(next, level)}
        filterCount={filterCount}
        onOpenFilters={() => setSheetOpen(true)}
        onEditLanguages={() => navigation.navigate("Profile")}
        countText={countText}
      />

      {perfect.length > 0 ? (
        <PerfectMatchesRail
          profiles={perfect}
          warm={warm}
          viewerLanguage={viewerLanguage}
          startingUsername={startingUsername}
          onSayHello={sayHello}
          onViewProfile={viewProfile}
        />
      ) : null}
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
  if (filtered.length === 0) {
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
      <VerifyEmailBanner />
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
