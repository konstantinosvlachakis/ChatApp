import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { ExchangeCard } from "../components/people/ExchangeCard";
import { PeopleDiscoveryHeader } from "../components/people/PeopleDiscoveryHeader";
import { PerfectMatchesRail } from "../components/people/PerfectMatchesRail";
import { PeopleFilterSheet } from "../components/people/PeopleFilterSheet";
import { usePeopleFeed } from "../components/people/usePeopleFeed";
import { VerifyEmailBanner } from "../components/VerifyEmailBanner";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import {
  DEFAULT_PANEL_FILTERS,
  DEFAULT_QUICK_FILTERS,
  PEOPLE_PAGE_SIZE,
  activePanelFilterCount,
  cityFromLocation,
  countParams,
  exchangeRule,
  filterLoadedPeople,
  includesNothing,
  othersParams,
  perfectParams,
  previewTotal,
  viewerExchangeLanguages,
  type PanelFilters,
  type QuickFilters,
} from "../features/peopleMatching";
import { fetchPeople } from "../services/api/auth";
import { createOrGetConversation } from "../services/api/conversations";
import { toastApiError } from "../services/toast";
import { fontFamilies } from "../theme/typography";
import { warmColors, type WarmColors } from "../theme/warm";
import type { PeopleCard } from "../types";

const withoutPage = ({ page, page_size, ...rest }: Record<string, string | number>) => rest;

/**
 * People (mirrors web `pages/Community/page.tsx`): header + rule, search + filter button
 * (bottom sheet), quick pills, the Perfect exchanges rail (`section=perfect`) and the
 * "More people to meet" list (`section=others`) with onEndReached paging.
 */
export function CommunityScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { user } = useAuth();
  const { isDark } = useTheme();
  const warm = warmColors(isDark);
  const styles = useMemo(() => createStyles(warm), [warm]);
  const viewerLanguage = user?.native_language || "";
  const exchange = useMemo(() => viewerExchangeLanguages(user), [user]);

  const [filters, setFilters] = useState<PanelFilters>(DEFAULT_PANEL_FILTERS);
  const [quick, setQuick] = useState<QuickFilters>(DEFAULT_QUICK_FILTERS);
  const [search, setSearch] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [quickHint, setQuickHint] = useState<"" | "near" | "myLevel">("");
  const [startingUsername, setStartingUsername] = useState("");
  const startingRef = useRef(false);

  const perfectBase = useMemo(() => withoutPage(perfectParams(filters, quick, 1)), [filters, quick]);
  const othersBase = useMemo(() => (includesNothing(filters.include) ? null : withoutPage(othersParams(filters, quick, 1))), [filters, quick]);
  const perfect = usePeopleFeed(perfectBase, PEOPLE_PAGE_SIZE);
  const others = usePeopleFeed(othersBase, PEOPLE_PAGE_SIZE);
  const meta = perfect.meta || others.meta;
  const city = meta?.nearCity || cityFromLocation(user?.location);
  const nearAvailable = meta ? meta.nearAvailable : Boolean(city);
  const myLevelAvailable = meta ? meta.myLevelAvailable : true;
  const learningNames = exchange.practising.length ? exchange.practising.map((entry) => entry.language) : meta?.theySpeakOptions || [];
  const rule = exchangeRule(learningNames, exchange.spoken.map((entry) => entry.language));
  const filterCount = activePanelFilterCount(filters);
  const anyQuick = quick.near || quick.active || quick.newMembers || quick.myLevel;

  const perfectShown = useMemo(() => filterLoadedPeople(perfect.profiles, search), [perfect.profiles, search]);
  const othersShown = useMemo(() => filterLoadedPeople(others.profiles, search), [others.profiles, search]);

  // "Find partners" from a Profile mission: native speakers of that language.
  useEffect(() => {
    const prefillLanguage = route.params?.prefillLanguage;
    if (!prefillLanguage) return;
    setSearch("");
    setFilters({ ...DEFAULT_PANEL_FILTERS, theySpeak: [String(prefillLanguage).trim().toLowerCase()] });
  }, [route.params?.fromMissionAt, route.params?.prefillLanguage]);

  const toggleQuick = (key: keyof QuickFilters) => {
    if (key === "near" && !nearAvailable && !quick.near) return setQuickHint("near");
    if (key === "myLevel" && !myLevelAvailable && !quick.myLevel) return setQuickHint("myLevel");
    setQuickHint("");
    setQuick((current) => ({ ...current, [key]: !current[key] }));
  };

  const clearAll = () => {
    setSearch("");
    setFilters(DEFAULT_PANEL_FILTERS);
    setQuick(DEFAULT_QUICK_FILTERS);
    setQuickHint("");
  };

  const countFor = useCallback(
    async (draft: PanelFilters, signal: AbortSignal) => {
      const payload = await fetchPeople(countParams(draft, quick), { signal });
      return previewTotal(payload.counts, draft);
    },
    [quick]
  );

  const viewProfile = useCallback(
    (profile: PeopleCard) => navigation.navigate("PublicProfile", { username: profile.username, profile }),
    [navigation]
  );
  const editLanguages = () => navigation.navigate("Profile");

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

  const refreshing = perfect.refreshing || others.refreshing;
  const refresh = () => {
    perfect.refresh();
    others.refresh();
  };

  const panel = (title: string, text: string, action?: { label: string; onPress: () => void }, link?: { label: string; onPress: () => void }) => (
    <View style={styles.panel}>
      <Text style={styles.panelTitle}>{title}</Text>
      <Text style={styles.panelText}>{text}</Text>
      {action ? (
        <Pressable style={styles.secondaryButton} onPress={action.onPress} accessibilityRole="button">
          <Text style={styles.secondaryButtonText}>{action.label}</Text>
        </Pressable>
      ) : null}
      {link ? (
        <Pressable style={styles.textButton} onPress={link.onPress} accessibilityRole="button">
          <Text style={styles.textButtonText}>{link.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );

  let perfectContent: React.ReactElement;
  if (perfect.loading && !perfect.profiles.length) {
    perfectContent = <View style={styles.skeletonPhoto} accessibilityRole="progressbar" accessibilityLabel="Finding perfect exchanges" />;
  } else if (perfect.error && !perfect.profiles.length) {
    perfectContent = panel("We couldn't load perfect exchanges.", perfect.error, { label: "Try again", onPress: perfect.retry });
  } else if (perfectShown.length) {
    perfectContent = (
      <PerfectMatchesRail
        profiles={perfectShown}
        viewerLanguage={viewerLanguage}
        startingUsername={startingUsername}
        onSayHello={sayHello}
        onViewProfile={viewProfile}
        onEndReached={search.trim() ? undefined : perfect.loadMore}
      />
    );
  } else if (search.trim() && perfect.profiles.length) {
    perfectContent = panel("No perfect exchanges in this search", "Try another name, language or goal.", { label: "Clear search", onPress: () => setSearch("") });
  } else if (quick.near) {
    perfectContent = panel("No perfect exchanges near you", "Try turning off Near you to meet exchanges anywhere.", { label: "Turn off Near you", onPress: () => toggleQuick("near") });
  } else if (anyQuick || filterCount) {
    perfectContent = panel("No perfect exchanges match these filters", "Loosen a filter or two and they'll show up here.", { label: "Clear filters", onPress: clearAll });
  } else {
    perfectContent = panel(
      "No perfect exchanges yet",
      "Nobody right now speaks a language you're learning and is learning one you speak. The people below are a great place to start.",
      undefined,
      { label: "Edit languages", onPress: editLanguages }
    );
  }

  const header = (
    <View>
      <PeopleDiscoveryHeader
        warm={warm}
        rule={rule}
        search={search}
        onSearchChange={setSearch}
        filterCount={filterCount}
        onOpenFilters={() => setSheetOpen(true)}
        onEditLanguages={editLanguages}
        quick={quick}
        city={city}
        onToggleQuick={toggleQuick}
      />
      {quickHint === "near" ? (
        <Pressable onPress={editLanguages} accessibilityRole="button" style={styles.hint}>
          <Text style={styles.hintText}>Add your city to see people near you. <Text style={styles.hintLink}>Set your city</Text></Text>
        </Pressable>
      ) : null}
      {quickHint === "myLevel" ? (
        <Pressable onPress={editLanguages} accessibilityRole="button" style={styles.hint}>
          <Text style={styles.hintText}>Add your level in the languages you're learning to use Your level. <Text style={styles.hintLink}>Edit languages</Text></Text>
        </Pressable>
      ) : null}
      {quick.near && meta?.nearScope === "country" ? (
        <Text style={[styles.hintText, styles.hint]} accessibilityLiveRegion="polite">Nobody else in {city} yet, so you're seeing people in your country.</Text>
      ) : null}

      <View style={styles.perfectHeading}>
        <View style={styles.sectionIcon}>
          <Ionicons name="swap-horizontal" size={15} color={warm.peachInk} />
        </View>
        <Text style={[styles.sectionTitle, styles.sectionTitleInline]} accessibilityRole="header">Perfect exchanges</Text>
      </View>
      {perfectContent}

      <View style={styles.moreHeading}>
        <Text style={styles.sectionTitle} accessibilityRole="header">More people to meet</Text>
        {othersBase && others.total > 0 ? <Text style={styles.sectionCount}>{others.total} {others.total === 1 ? "person" : "people"}</Text> : null}
      </View>
    </View>
  );

  let emptyState: React.ReactElement | null = null;
  if (!othersBase) {
    emptyState = panel("Nobody else is included", "Switch on a group under “In More people, include” in Filters.", { label: "Open filters", onPress: () => setSheetOpen(true) });
  } else if (others.loading && !others.profiles.length) {
    emptyState = (
      <View style={styles.skeleton} accessibilityRole="progressbar" accessibilityLabel="Finding more people">
        <View style={styles.skeletonLine} />
        <View style={[styles.skeletonLine, styles.skeletonLineShort]} />
      </View>
    );
  } else if (others.error) {
    emptyState = panel("We couldn't load people.", others.error, { label: "Try again", onPress: others.retry });
  } else {
    emptyState = panel(
      search.trim() ? "Nobody in this search" : "Nobody else matches yet",
      search.trim() ? "Try another name, language or goal." : "Try a wider filter. You might find an unexpected connection.",
      search.trim() || anyQuick || filterCount ? { label: "Clear filters", onPress: clearAll } : undefined
    );
  }

  let footer: React.ReactElement | null = null;
  if (othersBase && others.loadingMore) {
    footer = (
      <View style={styles.footer}>
        <ActivityIndicator color={warm.teal} />
        <Text style={styles.footerText}>Finding more people…</Text>
      </View>
    );
  } else if (othersBase && others.moreError) {
    footer = (
      <View style={styles.footer}>
        <Text style={styles.footerText}>{others.moreError}</Text>
        <Pressable style={styles.secondaryButton} onPress={others.retryMore} accessibilityRole="button">
          <Text style={styles.secondaryButtonText}>Try again</Text>
        </Pressable>
      </View>
    );
  } else if (othersBase && others.hasNext && !others.loading && !others.error) {
    footer = (
      <View style={styles.footer}>
        <Pressable style={styles.secondaryButton} onPress={others.loadMore} accessibilityRole="button">
          <Text style={styles.secondaryButtonText}>Load more</Text>
        </Pressable>
        <Text style={styles.footerText}>
          {others.profiles.length} of {others.total} loaded
        </Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <VerifyEmailBanner />
      <FlatList
        data={othersBase ? othersShown : []}
        keyExtractor={(item) => item.username}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={header}
        ListEmptyComponent={emptyState ?? undefined}
        ListFooterComponent={footer ?? undefined}
        onEndReached={others.loadMore}
        onEndReachedThreshold={0.6}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={warm.teal} colors={[warm.action]} />}
      />
      <PeopleFilterSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        filters={filters}
        theySpeakOptions={meta?.theySpeakOptions || []}
        theyLearnOptions={meta?.theyLearnOptions || []}
        countFor={countFor}
        onApply={(next) => {
          setFilters(next);
          setSheetOpen(false);
        }}
      />
    </SafeAreaView>
  );
}

const createStyles = (warm: WarmColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: warm.cream },
    listContent: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 28, gap: 12 },
    sectionTitle: { color: warm.ink, fontSize: 18, marginTop: 14, marginBottom: 10, fontFamily: fontFamilies.displayBold },
    perfectHeading: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 14, marginBottom: 10 },
    sectionTitleInline: { marginTop: 0, marginBottom: 0 },
    sectionIcon: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: warm.peach },
    moreHeading: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginTop: 10 },
    sectionCount: { color: warm.mutedInk, fontSize: 13, fontFamily: fontFamilies.bodyMedium },
    hint: { marginTop: 10 },
    hintText: { color: warm.inkSoft, fontSize: 13, lineHeight: 19, fontFamily: fontFamilies.bodyMedium },
    hintLink: { color: warm.ink, fontFamily: fontFamilies.bodyBold, textDecorationLine: "underline" },
    skeletonPhoto: { height: 330, width: "60%", alignSelf: "center", borderRadius: 20, backgroundColor: warm.peachSoft },
    skeleton: { backgroundColor: warm.paper, borderColor: warm.line, borderWidth: 1, borderRadius: 24, padding: 18, gap: 12 },
    skeletonLine: { height: 14, borderRadius: 7, backgroundColor: warm.skeleton },
    skeletonLineShort: { width: "60%" },
    panel: {
      alignItems: "center",
      backgroundColor: warm.paper,
      borderColor: warm.lineWarm,
      borderWidth: 1,
      borderRadius: 28,
      paddingHorizontal: 20,
      paddingVertical: 24,
      gap: 10,
    },
    panelTitle: { color: warm.ink, fontSize: 17, textAlign: "center", fontFamily: fontFamilies.displayBold },
    panelText: { color: warm.mutedInk, fontSize: 14, lineHeight: 20, textAlign: "center", fontFamily: fontFamilies.bodyMedium },
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
    secondaryButtonText: { color: warm.ink, fontSize: 14, fontFamily: fontFamilies.bodyBold },
    textButton: { minHeight: 44, justifyContent: "center", paddingHorizontal: 12 },
    textButtonText: { color: warm.ink, fontSize: 14, fontFamily: fontFamilies.bodyBold },
    footer: { alignItems: "center", gap: 8, paddingVertical: 16 },
    footerText: { color: warm.mutedInk, fontSize: 12, textAlign: "center", fontFamily: fontFamilies.bodyMedium },
  });
