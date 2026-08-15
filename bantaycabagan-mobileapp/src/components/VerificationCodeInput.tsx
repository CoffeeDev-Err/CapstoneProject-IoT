import React, { useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { mobileTheme } from '../constants/mobileTheme';

const CODE_LENGTH = 6;

type Props = {
  value: string;
  onChangeText: (value: string) => void;
  dark?: boolean;
  invalid?: boolean;
};

export default function VerificationCodeInput({
  value,
  onChangeText,
  dark = false,
  invalid = false,
}: Props) {
  const inputRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const normalizedValue = value.replace(/\D/g, '').slice(0, CODE_LENGTH);
  const activeIndex = Math.min(
    focused ? selection.start : normalizedValue.length,
    CODE_LENGTH - 1,
  );

  const focusDigit = (index: number) => {
    const start = Math.min(index, normalizedValue.length);
    const nextSelection = {
      start,
      end: normalizedValue[index] ? start + 1 : start,
    };

    setSelection(nextSelection);
    inputRef.current?.focus();
    requestAnimationFrame(() => {
      inputRef.current?.setNativeProps({ selection: nextSelection });
    });
  };

  const handleChangeText = (nextValue: string) => {
    const nextCode = nextValue.replace(/\D/g, '').slice(0, CODE_LENGTH);
    onChangeText(nextCode);
    setSelection({ start: nextCode.length, end: nextCode.length });
  };

  return (
    <View style={styles.field}>
      <Text style={[styles.label, dark && styles.labelDark]}>Verification Code</Text>
      <View style={styles.codeRow} accessibilityLabel="Enter the six-digit verification code">
        {Array.from({ length: CODE_LENGTH }, (_, index) => {
          const isActive = focused && index === activeIndex;
          return (
            <Pressable
              key={index}
              onPress={() => focusDigit(index)}
              accessibilityRole="button"
              accessibilityLabel={`Verification code digit ${index + 1}`}
              style={[
                styles.codeBox,
                dark && styles.codeBoxDark,
                isActive && styles.codeBoxActive,
                invalid && styles.codeBoxInvalid,
              ]}
            >
              <Text style={[styles.codeDigit, dark && styles.codeDigitDark]}>
                {normalizedValue[index] || ''}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <TextInput
        ref={inputRef}
        value={normalizedValue}
        selection={selection}
        onChangeText={handleChangeText}
        onSelectionChange={(event) => setSelection(event.nativeEvent.selection)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        keyboardType="number-pad"
        inputMode="numeric"
        maxLength={CODE_LENGTH}
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        caretHidden
        style={styles.hiddenInput}
        accessibilityLabel="Six-digit verification code"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  field: { position: 'relative', marginBottom: 14 },
  label: { marginBottom: 7, color: mobileTheme.textMuted, fontSize: 12, fontWeight: '700' },
  labelDark: { color: '#aebbd0' },
  codeRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 7 },
  codeBox: {
    flex: 1,
    maxWidth: 52,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: mobileTheme.border,
    borderRadius: 9,
    backgroundColor: '#fafbff',
  },
  codeBoxDark: { borderColor: '#2a3a56', backgroundColor: '#0e1a30' },
  codeBoxActive: {
    borderWidth: 2,
    borderColor: mobileTheme.blue,
    shadowColor: mobileTheme.blue,
    shadowOpacity: 0.18,
    shadowRadius: 5,
    elevation: 2,
  },
  codeBoxInvalid: { borderColor: mobileTheme.danger },
  codeDigit: { color: mobileTheme.text, fontSize: 21, fontWeight: '800' },
  codeDigitDark: { color: '#f8fafc' },
  hiddenInput: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 1,
    height: 1,
    opacity: 0.01,
  },
});
