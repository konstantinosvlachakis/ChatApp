import React, { useCallback, useContext, useMemo, useRef, type RefObject } from "react";
import type { FlatList, LayoutChangeEvent, ScrollViewProps } from "react-native";
import { BottomTabBarHeightContext } from "@react-navigation/bottom-tabs";
import { KeyboardChatScrollView } from "react-native-keyboard-controller";

// Shared keyboard wiring for the people chat (ChatRoomView) and Lumi (CoachChatScreen), built on
// react-native-keyboard-controller (KeyboardProvider in App.tsx):
// - the FlatList scrolls inside a `KeyboardChatScrollView`, which insets and lifts its content
//   with the keyboard frame by frame, so the latest message stays visible;
// - the composer (and floating buttons) sit in `KeyboardStickyView`s with `stickyOffset`;
// - both are offset by the bottom tab bar height: the keyboard covers the tab bar (and its
//   safe-area inset), so only the part above it has to be avoided.

export type ChatContentInsets = { top: number; bottom: number; left: number; right: number };

/** Height of the bottom tab bar (incl. safe-area inset) below the chat, or 0 outside the tabs. */
export function useTabBarOffset() {
  return useContext(BottomTabBarHeightContext) ?? 0;
}

/** `offset` for KeyboardStickyView: ride on the keyboard, minus the covered tab bar. */
export function useStickyOffset(tabBarOffset: number) {
  return useMemo(() => ({ closed: 0, opened: tabBarOffset }), [tabBarOffset]);
}

/** `renderScrollComponent` for a chat FlatList (stable while its inputs are). */
export function useChatScrollComponent(
  tabBarOffset: number,
  onContentInsetChange?: (insets: ChatContentInsets) => void
) {
  return useCallback(
    (scrollProps: ScrollViewProps) => (
      <KeyboardChatScrollView
        {...scrollProps}
        offset={tabBarOffset}
        keyboardLiftBehavior="always"
        onContentInsetChange={onContentInsetChange}
      />
    ),
    [onContentInsetChange, tabBarOffset]
  );
}

/**
 * Scroll-to-end that includes the keyboard's bottom content inset (FlatList.scrollToEnd only
 * knows the content height, so with the keyboard open it would stop short of the last message).
 * Wire the returned handlers to the FlatList / `useChatScrollComponent`.
 */
export function useInsetAwareScrollToEnd<T>(listRef: RefObject<FlatList<T> | null>) {
  const contentHeightRef = useRef(0);
  const layoutHeightRef = useRef(0);
  const bottomInsetRef = useRef(0);

  const onContentSizeChange = useCallback((_width: number, height: number) => {
    contentHeightRef.current = height;
  }, []);
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    layoutHeightRef.current = event.nativeEvent.layout.height;
  }, []);
  const onContentInsetChange = useCallback((insets: ChatContentInsets) => {
    bottomInsetRef.current = insets.bottom;
  }, []);

  const scrollToEnd = useCallback(
    (animated = true) => {
      requestAnimationFrame(() => {
        const list = listRef.current;
        if (!list) return;
        const inset = bottomInsetRef.current;
        if (inset > 0 && layoutHeightRef.current > 0 && contentHeightRef.current > 0) {
          list.scrollToOffset({
            offset: Math.max(0, contentHeightRef.current + inset - layoutHeightRef.current),
            animated,
          });
          return;
        }
        list.scrollToEnd({ animated });
      });
    },
    [listRef]
  );

  return { scrollToEnd, onContentSizeChange, onLayout, onContentInsetChange, bottomInsetRef };
}
