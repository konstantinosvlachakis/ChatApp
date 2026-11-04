import React from "react";
import { StyleSheet, View } from "react-native";
import type { WarmColors } from "../../theme/warm";
import { ChatAvatar } from "./ChatAvatar";

type Member = { username: string; profile_image_url?: string | null };

/**
 * A group's picture: two members' photos overlapping (front bottom-left, back top-right), or
 * one photo when only one other member is shown. ``members`` should exclude the viewer.
 */
function GroupAvatarBase({ members, size, warm }: { members: Member[]; size: number; warm: WarmColors }) {
  const shown = members.filter(Boolean).slice(0, 2);
  if (shown.length < 2) {
    return <ChatAvatar name={shown[0]?.username} imagePath={shown[0]?.profile_image_url ?? null} size={size} />;
  }
  const inner = Math.round(size * 0.68);
  return (
    <View
      style={{ width: size, height: size }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={[styles.back, { width: inner, height: inner }]}>
        <ChatAvatar name={shown[1].username} imagePath={shown[1].profile_image_url ?? null} size={inner} />
      </View>
      <View
        style={[
          styles.front,
          { width: inner + 4, height: inner + 4, borderRadius: (inner + 4) / 2, backgroundColor: warm.paper },
        ]}
      >
        <ChatAvatar name={shown[0].username} imagePath={shown[0].profile_image_url ?? null} size={inner} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  back: { position: "absolute", top: 0, right: 0 },
  // A paper-coloured ring separates the front photo from the one behind it.
  front: { position: "absolute", bottom: -2, left: -2, alignItems: "center", justifyContent: "center" },
});

export const GroupAvatar = React.memo(GroupAvatarBase);
