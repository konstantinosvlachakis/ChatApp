import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { isOpenableUrl } from "../../components/chat/attachments";
import { fetchGifs, fetchStickerPacks } from "../../services/api/conversations";
import { getErrorMessage } from "../../services/api/errors";
import { hapticSelection } from "../../services/haptics";
import { fontFamilies } from "../../theme/typography";
import type { WarmColors } from "../../theme/warm";
import type { GifMedia, Sticker, StickerPack } from "../../types";
import { KeyboardSheet } from "./KeyboardSheet";

export type MediaPick = { kind: "sticker"; sticker: Sticker } | { kind: "gif"; gif: GifMedia };

type StickerGifSheetProps = {
  warm: WarmColors;
  reduceMotion: boolean;
  visible: boolean;
  onClose: () => void;
  onPick: (pick: MediaPick) => void;
};

const RECENT_STICKERS_KEY = "lv_recent_stickers";
const RECENT_STICKERS_LIMIT = 8;
const GIF_SEARCH_DEBOUNCE_MS = 400;
const PANEL_HEIGHT = 380;
// Remembered for the app session: without a server key the GIF tab stays hidden.
let gifsKnownUnavailable = false;

async function readRecentStickers(): Promise<string[]> {
  try {
    const parsed = JSON.parse((await AsyncStorage.getItem(RECENT_STICKERS_KEY)) || "[]");
    return Array.isArray(parsed) ? parsed.filter((ref) => typeof ref === "string").slice(0, RECENT_STICKERS_LIMIT) : [];
  } catch {
    return [];
  }
}

function rememberRecentSticker(current: string[], ref: string): string[] {
  const next = [ref, ...current.filter((item) => item !== ref)].slice(0, RECENT_STICKERS_LIMIT);
  AsyncStorage.setItem(RECENT_STICKERS_KEY, JSON.stringify(next)).catch(() => {});
  return next;
}

function StickerGrid({
  stickers,
  styles,
  onPick,
}: {
  stickers: Sticker[];
  styles: ReturnType<typeof createStyles>;
  onPick: (sticker: Sticker) => void;
}) {
  return (
    <View style={styles.stickerGrid}>
      {stickers.map((sticker) =>
        isOpenableUrl(sticker.url) ? (
          <Pressable
            key={sticker.ref}
            onPress={() => onPick(sticker)}
            style={({ pressed }) => [styles.stickerCell, pressed && styles.cellPressed]}
            accessibilityRole="button"
            accessibilityLabel={`Send sticker: ${sticker.label}`}
          >
            <Image
              source={{ uri: sticker.url }}
              style={styles.stickerImage}
              contentFit="contain"
              cachePolicy="memory-disk"
              recyclingKey={sticker.ref}
              accessibilityIgnoresInvertColors
            />
          </Pressable>
        ) : null
      )}
    </View>
  );
}

function StickersTab({ styles, warm, onPick }: { styles: ReturnType<typeof createStyles>; warm: WarmColors; onPick: (pick: MediaPick) => void }) {
  const [packs, setPacks] = useState<StickerPack[] | null>(null);
  const [error, setError] = useState("");
  const [recentRefs, setRecentRefs] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    readRecentStickers().then((refs) => active && setRecentRefs(refs));
    fetchStickerPacks()
      .then((result) => active && setPacks(result))
      .catch((err) => active && setError(getErrorMessage(err, "Couldn't load stickers.")));
    return () => {
      active = false;
    };
  }, []);

  const byRef = useMemo(() => {
    const map = new Map<string, Sticker>();
    (packs || []).forEach((pack) => pack.stickers.forEach((sticker) => map.set(sticker.ref, sticker)));
    return map;
  }, [packs]);
  const recent = recentRefs.map((ref) => byRef.get(ref)).filter((sticker): sticker is Sticker => Boolean(sticker));

  const pick = (sticker: Sticker) => {
    setRecentRefs((current) => rememberRecentSticker(current, sticker.ref));
    onPick({ kind: "sticker", sticker });
  };

  if (error) return <Text style={styles.status} accessibilityLiveRegion="polite">{error}</Text>;
  if (!packs) return <ActivityIndicator style={styles.loader} color={warm.teal} accessibilityLabel="Loading stickers" />;

  return (
    <ScrollView style={styles.panel} contentContainerStyle={styles.panelContent} keyboardShouldPersistTaps="handled">
      {recent.length > 0 ? (
        <>
          <Text style={styles.heading} accessibilityRole="header">Recent</Text>
          <StickerGrid stickers={recent} styles={styles} onPick={pick} />
        </>
      ) : null}
      {packs.map((pack) => (
        <React.Fragment key={pack.id}>
          <Text style={styles.heading} accessibilityRole="header">{pack.name}</Text>
          <StickerGrid stickers={pack.stickers} styles={styles} onPick={pick} />
        </React.Fragment>
      ))}
    </ScrollView>
  );
}

function GifsTab({
  styles,
  warm,
  onPick,
  onUnavailable,
}: {
  styles: ReturnType<typeof createStyles>;
  warm: WarmColors;
  onPick: (pick: MediaPick) => void;
  onUnavailable: () => void;
}) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [results, setResults] = useState<GifMedia[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "more" | "error">("loading");
  const [error, setError] = useState("");
  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), GIF_SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const load = useCallback(
    (searchQuery: string, offset: number) => {
      requestRef.current?.abort();
      const controller = new AbortController();
      requestRef.current = controller;
      setStatus(offset ? "more" : "loading");
      setError("");
      fetchGifs(searchQuery, offset, controller.signal)
        .then((page) => {
          if (controller.signal.aborted) return;
          setResults((previous) => (offset ? [...previous, ...page.results] : page.results));
          setNextOffset(page.next_offset ?? null);
          setStatus("ready");
        })
        .catch((err) => {
          if (controller.signal.aborted) return;
          if ((err as { code?: string })?.code === "gifs_unavailable") {
            gifsKnownUnavailable = true;
            onUnavailable();
            return;
          }
          setError(getErrorMessage(err, "Couldn't load GIFs."));
          setStatus("error");
        });
    },
    [onUnavailable]
  );

  useEffect(() => {
    load(debouncedQuery, 0);
    return () => requestRef.current?.abort();
  }, [debouncedQuery, load]);

  const loadMore = () => {
    if (status === "ready" && nextOffset !== null) load(debouncedQuery, nextOffset);
  };

  return (
    <View style={styles.panel}>
      <View style={styles.search}>
        <Ionicons name="search" size={18} color={warm.mutedInk} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          style={styles.searchInput}
          placeholder="Search GIPHY"
          placeholderTextColor={warm.mutedInk}
          returnKeyType="search"
          autoCorrect={false}
          maxLength={50}
          accessibilityLabel="Search GIFs"
        />
      </View>
      {status === "loading" ? (
        <ActivityIndicator style={styles.loader} color={warm.teal} accessibilityLabel="Loading GIFs" />
      ) : status === "error" ? (
        <View style={styles.statusWrap}>
          <Text style={styles.status} accessibilityLiveRegion="polite">{error}</Text>
          <Pressable onPress={() => load(debouncedQuery, 0)} accessibilityRole="button" hitSlop={8}>
            <Text style={styles.link}>Try again</Text>
          </Pressable>
        </View>
      ) : results.length === 0 ? (
        <Text style={styles.status}>No GIFs found{debouncedQuery ? ` for “${debouncedQuery}”` : ""}.</Text>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(gif) => gif.id}
          numColumns={2}
          columnWrapperStyle={styles.gifRow}
          contentContainerStyle={styles.gifList}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          onEndReached={loadMore}
          onEndReachedThreshold={0.6}
          ListFooterComponent={status === "more" ? <ActivityIndicator style={styles.footerLoader} color={warm.teal} /> : undefined}
          renderItem={({ item }) => {
            const uri = isOpenableUrl(item.preview_url) ? item.preview_url : item.url;
            if (!isOpenableUrl(uri)) return <View style={styles.gifCell} />;
            return (
              <Pressable
                onPress={() => onPick({ kind: "gif", gif: item })}
                style={({ pressed }) => [styles.gifCell, pressed && styles.cellPressed]}
                accessibilityRole="button"
                accessibilityLabel={`Send GIF${item.title ? `: ${item.title}` : ""}`}
              >
                <Image
                  source={{ uri }}
                  style={styles.gifImage}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  recyclingKey={item.id}
                  accessibilityIgnoresInvertColors
                />
              </Pressable>
            );
          }}
        />
      )}
      <Text style={styles.attribution}>Powered by GIPHY</Text>
    </View>
  );
}

/** Bottom sheet with Stickers and GIFs tabs; picking one calls `onPick` (the screen sends it). */
export function StickerGifSheet({ warm, reduceMotion, visible, onClose, onPick }: StickerGifSheetProps) {
  const styles = useMemo(() => createStyles(warm), [warm]);
  const [tab, setTab] = useState<"stickers" | "gifs">("stickers");
  const [gifsAvailable, setGifsAvailable] = useState(!gifsKnownUnavailable);

  const handlePick = useCallback(
    (pick: MediaPick) => {
      hapticSelection();
      onPick(pick);
    },
    [onPick]
  );
  const handleUnavailable = useCallback(() => {
    setGifsAvailable(false);
    setTab("stickers");
  }, []);

  const tabs: Array<{ id: "stickers" | "gifs"; label: string }> = [
    { id: "stickers", label: "Stickers" },
    ...(gifsAvailable ? [{ id: "gifs" as const, label: "GIFs" }] : []),
  ];

  return (
    <KeyboardSheet warm={warm} visible={visible} reduceMotion={reduceMotion} onClose={onClose}>
      <View style={styles.tabs} accessibilityRole="tablist">
        {tabs.map((item) => {
          const selected = tab === item.id;
          return (
            <Pressable
              key={item.id}
              onPress={() => setTab(item.id)}
              style={[styles.tab, selected && styles.tabSelected]}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
            >
              <Text style={[styles.tabText, selected && styles.tabTextSelected]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {visible ? (
        tab === "gifs" && gifsAvailable ? (
          <GifsTab styles={styles} warm={warm} onPick={handlePick} onUnavailable={handleUnavailable} />
        ) : (
          <StickersTab styles={styles} warm={warm} onPick={handlePick} />
        )
      ) : null}
    </KeyboardSheet>
  );
}

const createStyles = (warm: WarmColors) =>
  StyleSheet.create({
    tabs: { flexDirection: "row", gap: 8, marginBottom: 8 },
    tab: {
      minHeight: 40,
      paddingHorizontal: 16,
      justifyContent: "center",
      borderRadius: 999,
      borderWidth: 1,
      borderColor: warm.line,
    },
    tabSelected: { backgroundColor: warm.peach, borderColor: warm.peach },
    tabText: { color: warm.inkSoft, fontSize: 15, fontFamily: fontFamilies.bodyBold },
    tabTextSelected: { color: warm.peachInk },
    panel: { height: PANEL_HEIGHT },
    panelContent: { paddingBottom: 12 },
    heading: {
      marginTop: 8,
      marginBottom: 4,
      color: warm.mutedInk,
      fontSize: 12,
      letterSpacing: 1,
      textTransform: "uppercase",
      fontFamily: fontFamilies.bodyBold,
    },
    stickerGrid: { flexDirection: "row", flexWrap: "wrap" },
    stickerCell: { width: "25%", aspectRatio: 1, padding: 6, borderRadius: 16 },
    stickerImage: { flex: 1 },
    cellPressed: { backgroundColor: warm.creamDeep },
    search: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      minHeight: 44,
      marginBottom: 8,
      paddingHorizontal: 14,
      borderRadius: 999,
      backgroundColor: warm.creamDeep,
    },
    searchInput: { flex: 1, color: warm.ink, fontSize: 15, fontFamily: fontFamilies.bodyRegular, paddingVertical: 8 },
    gifList: { paddingBottom: 8 },
    gifRow: { gap: 6, marginBottom: 6 },
    gifCell: { flex: 1, height: 120, borderRadius: 12, overflow: "hidden", backgroundColor: warm.creamDeep },
    gifImage: { width: "100%", height: "100%" },
    loader: { marginTop: 32 },
    footerLoader: { marginVertical: 12 },
    statusWrap: { alignItems: "center", gap: 8, marginTop: 24 },
    status: { marginTop: 24, color: warm.mutedInk, fontSize: 14, textAlign: "center", fontFamily: fontFamilies.bodyRegular },
    link: { color: warm.teal, fontSize: 14, fontFamily: fontFamilies.bodyBold, textDecorationLine: "underline" },
    attribution: {
      paddingTop: 6,
      color: warm.mutedInk,
      fontSize: 12,
      textAlign: "right",
      fontFamily: fontFamilies.bodyBold,
    },
  });
