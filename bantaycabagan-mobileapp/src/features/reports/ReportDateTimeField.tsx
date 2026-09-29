import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { mobileTheme } from '../../constants/mobileTheme';
import { useMobileTheme } from '../../context/ThemeContext';

export const toLocalReportTime = (value: string) => {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};
export const parseReportTime = (text: string) => {
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(text)) return '';
  const date = new Date(text.replace(' ', 'T') + ':00');
  return Number.isFinite(date.getTime()) && toLocalReportTime(date.toISOString()) === text ? date.toISOString() : '';
};
export function ReportDateTimeField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { colors, isDark } = useMobileTheme();
  const [text, setText] = useState(() => toLocalReportTime(value));
  const emitted = useRef(value);
  useEffect(() => {
    if (value !== emitted.current) { setText(toLocalReportTime(value)); emitted.current = value; }
  }, [value]);
  return <View>
    <TextInput accessibilityLabel="Incident or activity date and time" value={text}
      placeholder="YYYY-MM-DD HH:mm" placeholderTextColor={colors.textMuted}
      autoCorrect={false} maxLength={16}
      style={[styles.input, isDark && styles.inputDark, { color: colors.text }]}
      onChangeText={(next) => { setText(next); emitted.current = parseReportTime(next); onChange(emitted.current); }} />
    <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 6 }}>
      When it happened, in local time. Format: YYYY-MM-DD HH:mm (24-hour).
    </Text>
    {text && !parseReportTime(text) ? <Text accessibilityRole="alert" style={{ color: colors.danger, fontSize: 11 }}>Enter a valid date and time.</Text> : null}
  </View>;
}

const styles = StyleSheet.create({
  input: {
    minHeight: 46,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: 12,
    backgroundColor: mobileTheme.surfaceMuted,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 7,
    elevation: 3,
  },
  inputDark: {
    borderColor: 'transparent',
    backgroundColor: '#101f38',
    shadowColor: '#000000',
    shadowOpacity: 0.36,
    elevation: 4,
  },
});
