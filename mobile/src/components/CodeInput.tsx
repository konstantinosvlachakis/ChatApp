import React, { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { TextInputInstance } from "react-native";
import { VERIFICATION_CODE_LENGTH, sanitizeVerificationCode } from "../features/emailVerification";
import type { WarmColors } from "../theme/warm";

export type CodeInputHandle = {
  focus: () => void;
  blur: () => void;
};

type CodeInputProps = {
  warm: WarmColors;
  value: string;
  onChange: (code: string) => void;
  /** Called once the 6th digit is typed or a full code is pasted / autofilled. */
  onComplete?: (code: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  autoFocus?: boolean;
};

/**
 * 6-digit one-time-code field: one (nearly) invisible TextInput over six cells, so typing,
 * backspace, paste and SMS/email autofill (`oneTimeCode` / `one-time-code`) behave like a
 * normal input while the cells show the digits. Non-digits are stripped (`sanitizeVerificationCode`).
 */
export const CodeInput = forwardRef<CodeInputHandle, CodeInputProps>(function CodeInput(
  { warm, value, onChange, onComplete, disabled = false, invalid = false, autoFocus = false },
  ref
) {
  const inputRef = useRef<TextInputInstance>(null);
  const [focused, setFocused] = useState(false);
  const styles = useMemo(() => createStyles(warm), [warm]);

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
    blur: () => inputRef.current?.blur(),
  }));

  const handleChangeText = (text: string) => {
    const next = sanitizeVerificationCode(text);
    if (next === value) return;
    onChange(next);
    if (next.length === VERIFICATION_CODE_LENGTH) onComplete?.(next);
  };

  const activeIndex = Math.min(value.length, VERIFICATION_CODE_LENGTH - 1);

  return (
    <Pressable
      onPress={() => inputRef.current?.focus()}
      disabled={disabled}
      style={styles.row}
      accessible={false}
    >
      {Array.from({ length: VERIFICATION_CODE_LENGTH }, (_, index) => {
        const digit = value[index] ?? "";
        const isActive = focused && !disabled && index === activeIndex;
        return (
          <View
            key={index}
            style={[
              styles.cell,
              digit ? styles.cellFilled : null,
              isActive ? styles.cellActive : null,
              invalid ? styles.cellInvalid : null,
            ]}
            importantForAccessibility="no-hide-descendants"
            accessibilityElementsHidden
          >
            <Text style={styles.digit}>{digit}</Text>
          </View>
        );
      })}
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={handleChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        editable={!disabled}
        autoFocus={autoFocus}
        keyboardType="number-pad"
        inputMode="numeric"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        autoCorrect={false}
        caretHidden
        contextMenuHidden={false}
        selectionColor="transparent"
        style={[StyleSheet.absoluteFill, styles.hiddenInput]}
        accessibilityLabel="6-digit verification code"
        accessibilityHint={value ? `${value.length} of ${VERIFICATION_CODE_LENGTH} digits entered` : undefined}
      />
    </Pressable>
  );
});

const createStyles = (warm: WarmColors) =>
  StyleSheet.create({
    row: {
      flexDirection: "row",
      justifyContent: "space-between",
      gap: 8,
      marginBottom: 12,
    },
    cell: {
      flex: 1,
      maxWidth: 52,
      aspectRatio: 0.82,
      borderRadius: 14,
      borderWidth: 1.5,
      borderColor: warm.line,
      backgroundColor: warm.paper,
      alignItems: "center",
      justifyContent: "center",
    },
    cellFilled: {
      borderColor: warm.lineWarm,
    },
    cellActive: {
      borderColor: warm.teal,
      borderWidth: 2,
    },
    cellInvalid: {
      borderColor: warm.danger,
    },
    digit: {
      fontSize: 24,
      fontWeight: "700",
      color: warm.ink,
    },
    // Not opacity 0: iOS skips one-time-code autofill for fully transparent inputs.
    hiddenInput: {
      opacity: 0.02,
      color: "transparent",
      fontSize: 1,
    },
  });
