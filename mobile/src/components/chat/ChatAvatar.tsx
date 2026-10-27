import React, { useMemo, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { API_BASE_URL } from "../../config/api";
import { useTheme } from "../../context/ThemeContext";
import { fontFamilies } from "../../theme/typography";
import { warmColors } from "../../theme/warm";
import { avatarImage } from "../../utils/media";
import { initialsFor } from "./conversationList";

/** Absolute URL for a profile image path, or undefined (initials are shown instead). */
export function resolveChatMediaUrl(path?: string | null) {
  if (!path) return undefined;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  if (path.startsWith("/media/")) return `${API_BASE_URL}${path}`;
  if (path.startsWith("media/")) return `${API_BASE_URL}/${path}`;
  return `${API_BASE_URL}/media/${path}`;
}

type ChatAvatarProps = {
  name?: string | null;
  imagePath?: string | null;
  /** Rendered size in dp (also passed to avatarImage). */
  size: number;
  online?: boolean;
  /** Ring colour around the online dot (the surface behind the avatar). */
  ringColor?: string;
};

/** Round portrait with an initials fallback and an optional online dot. */
function ChatAvatarBase({ name, imagePath, size, online = false, ringColor }: ChatAvatarProps) {
  const { isDark } = useTheme();
  const warm = warmColors(isDark);
  const uri = useMemo(() => avatarImage(resolveChatMediaUrl(imagePath), size), [imagePath, size]);
  // Remember which URL failed so a new photo is tried again.
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const showImage = Boolean(uri) && failedUri !== uri;
  const dot = Math.max(10, Math.round(size * 0.26));

  return (
    <View style={{ width: size, height: size }}>
      <View
        style={[
          styles.circle,
          { width: size, height: size, borderRadius: size / 2, backgroundColor: warm.peachStrong },
        ]}
      >
        {showImage && uri ? (
          <Image
            source={{ uri }}
            style={styles.image}
            onError={() => setFailedUri(uri)}
            accessibilityIgnoresInvertColors
          />
        ) : (
          <Text
            style={[styles.initials, { color: warm.peachDeep, fontSize: Math.max(12, Math.round(size * 0.36)) }]}
            accessibilityElementsHidden
            importantForAccessibility="no"
          >
            {initialsFor(name)}
          </Text>
        )}
      </View>
      {online ? (
        <View
          style={[
            styles.dot,
            {
              width: dot,
              height: dot,
              borderRadius: dot / 2,
              backgroundColor: warm.online,
              borderColor: ringColor || warm.paper,
            },
          ]}
        />
      ) : null}
    </View>
  );
}

export const ChatAvatar = React.memo(ChatAvatarBase);

const styles = StyleSheet.create({
  circle: {
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  initials: {
    fontFamily: fontFamilies.displaySemiBold,
  },
  dot: {
    position: "absolute",
    right: -1,
    bottom: -1,
    borderWidth: 2,
  },
});
