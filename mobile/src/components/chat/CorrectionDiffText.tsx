import React, { useMemo } from "react";
import { StyleSheet, Text, type StyleProp, type TextStyle } from "react-native";
import { describeWordDiff, diffWords, type DiffSegment } from "../../features/wordDiff";
import { fontFamilies } from "../../theme/typography";
import type { WarmColors } from "../../theme/warm";

type CorrectionDiffTextProps = {
  original: string;
  corrected: string;
  warm: WarmColors;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  /** Precomputed segments (the sheet's live preview already has them). */
  segments?: DiffSegment[];
};

/**
 * Word diff of a correction: removed words struck through, added words underlined and bold
 * (shape, not only colour). The label reads the changes out for screen readers.
 */
export function CorrectionDiffText({ original, corrected, warm, style, numberOfLines, segments }: CorrectionDiffTextProps) {
  const diff = useMemo(() => segments ?? diffWords(original, corrected), [corrected, original, segments]);
  const styles = useMemo(() => createStyles(warm), [warm]);
  const description = describeWordDiff(diff);
  return (
    <Text
      style={[styles.base, style]}
      numberOfLines={numberOfLines}
      accessibilityLabel={`Corrected: ${corrected}.${description ? ` Changes: ${description}.` : " No changes."}`}
    >
      {diff.map((segment, index) => (
        <React.Fragment key={index}>
          {index > 0 ? " " : null}
          <Text
            style={segment.type === "removed" ? styles.removed : segment.type === "added" ? styles.added : undefined}
          >
            {segment.text}
          </Text>
        </React.Fragment>
      ))}
    </Text>
  );
}

const createStyles = (warm: WarmColors) =>
  StyleSheet.create({
    base: {
      color: warm.ink,
      fontSize: 14,
      lineHeight: 20,
      fontFamily: fontFamilies.bodyMedium,
    },
    removed: {
      color: warm.danger,
      textDecorationLine: "line-through",
      textDecorationStyle: "solid",
    },
    added: {
      color: warm.teal,
      fontFamily: fontFamilies.bodyExtraBold,
      textDecorationLine: "underline",
      backgroundColor: warm.sage,
    },
  });
