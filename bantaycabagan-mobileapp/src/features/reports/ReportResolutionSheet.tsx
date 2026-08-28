import React from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SwipeDismissSheet } from '../../components/SwipeDismissSheet';
import { mobileTheme } from '../../constants/mobileTheme';
import { useMobileTheme } from '../../context/ThemeContext';
import type { PoliceReport } from '../../types/operations';

type SheetClose = (afterClose?: () => void) => void;

type ReportResolutionSheetProps = {
  notes: string;
  onChangeNotes: (notes: string) => void;
  onClose: () => void;
  onResolve: (close: SheetClose) => void;
  saving: boolean;
  target: PoliceReport | null;
};

export function ReportResolutionSheet({
  notes, onChangeNotes, onClose, onResolve, saving, target,
}: ReportResolutionSheetProps) {
  const { colors, isDark } = useMobileTheme();
  return (
    <SwipeDismissSheet visible={Boolean(target)} onClose={onClose}
      sheetStyle={[styles.sheet, isDark && { backgroundColor: colors.surface }]}>
      {({ close }) => (
        <View style={styles.content}>
          <Text style={[styles.title, { color: colors.text }]}>Resolve Incident</Text>
          <Text style={[styles.copy, { color: colors.textMuted }]}>
            Confirm that {target?.title} has been handled. This will update the web dashboard.
          </Text>
          <Text style={[styles.label, { color: colors.textMuted }]}>RESOLUTION NOTES</Text>
          <TextInput style={[styles.input, { color: colors.text, borderColor: colors.border,
            backgroundColor: isDark ? colors.surfaceMuted : mobileTheme.surface }]}
            value={notes} onChangeText={onChangeNotes}
            placeholder="Describe the action taken and outcome" placeholderTextColor={colors.textMuted}
            multiline textAlignVertical="top" />
          <View style={styles.actions}>
            <TouchableOpacity style={[styles.cancel, { borderColor: colors.border }]} onPress={() => close()}>
              <Text style={[styles.cancelText, { color: colors.text }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.confirm} onPress={() => onResolve(close)} disabled={saving}>
              <Text style={styles.confirmText}>{saving ? 'Saving...' : 'Confirm Resolve'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </SwipeDismissSheet>
  );
}

const styles = StyleSheet.create({
  sheet: { borderTopLeftRadius: 18, borderTopRightRadius: 18, backgroundColor: mobileTheme.surface },
  content: { padding: 20, paddingBottom: 30 },
  title: { fontSize: 19, fontWeight: '800' },
  copy: { marginTop: 7, fontSize: 12, lineHeight: 18 },
  label: { marginTop: 14, marginBottom: 6, fontSize: 10, fontWeight: '800' },
  input: { minHeight: 110, paddingHorizontal: 12, paddingTop: 12, borderWidth: 1, borderRadius: 12, fontSize: 13 },
  actions: { marginTop: 16, flexDirection: 'row', gap: 10 },
  cancel: { minHeight: 44, flex: 1, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 10 },
  cancelText: { fontSize: 12, fontWeight: '800' },
  confirm: { minHeight: 44, flex: 1.4, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: mobileTheme.purple },
  confirmText: { color: '#ffffff', fontSize: 12, fontWeight: '800' },
});
