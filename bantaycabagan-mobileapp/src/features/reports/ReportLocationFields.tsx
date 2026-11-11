import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { MaterialIcons as Icon } from '@expo/vector-icons';
import { useMobileTheme } from '../../context/ThemeContext';
import { REPORT_FIELD_LIMITS, type ReportForm } from './reportForm';

type Props = {
  form: ReportForm;
  isResolvingLocation?: boolean;
  locationLookupMessage?: string;
  onEditLocation: (value: string) => void;
  onOpenBarangays: () => void;
  onOpenMap: () => void;
  onUseCurrentGps: () => void;
};

export function ReportLocationFields({ form, isResolvingLocation, locationLookupMessage,
  onEditLocation, onOpenBarangays, onOpenMap, onUseCurrentGps }: Props) {
  const { colors } = useMobileTheme();
  const hasPoint = Number.isFinite(form.latitude) && Number.isFinite(form.longitude);
  const source = form.location_source === 'gps' ? 'Tracker GPS'
    : form.location_source === 'backup_request' ? 'Backup request location' : 'Selected incident point';
  const surface = { backgroundColor: colors.surfaceMuted, borderColor: colors.border };
  return <View style={styles.section}>
    <Text style={[styles.heading, { color: colors.text }]}>Incident location</Text>
    <Text style={[styles.helper, { color: colors.textMuted }]}>Choose where the incident happened, even if it is outside your assigned patrol area.</Text>
    <View style={styles.actions}>
      <TouchableOpacity accessibilityRole="button" onPress={onUseCurrentGps} style={[styles.action, surface]}>
        <Icon name="my-location" size={21} color={colors.blue} />
        <View style={styles.copy}>
          <Text style={[styles.actionTitle, { color: colors.text }]}>Use current GPS</Text>
          <Text style={[styles.helper, { color: colors.textMuted }]}>I am at the incident location</Text>
        </View>
      </TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" onPress={onOpenMap} style={[styles.action, surface]}>
        <Icon name="add-location-alt" size={21} color={colors.blue} />
        <View style={styles.copy}>
          <Text style={[styles.actionTitle, { color: colors.text }]}>Select on map</Text>
          <Text style={[styles.helper, { color: colors.textMuted }]}>Pin the actual incident location</Text>
        </View>
        <Icon name="chevron-right" size={20} color={colors.textMuted} />
      </TouchableOpacity>
    </View>
    {hasPoint && <Text style={[styles.coordinates, { color: colors.textMuted }]}>{source} · {form.latitude!.toFixed(6)}, {form.longitude!.toFixed(6)}</Text>}
    <View style={[styles.result, { borderColor: colors.border }]}>
      <Text style={[styles.label, { color: colors.textMuted }]}>INCIDENT BARANGAY</Text>
      <View style={styles.resultRow}>
        {isResolvingLocation && <ActivityIndicator color={colors.blue} accessibilityLabel="Identifying incident barangay" />}
        <Text accessibilityLiveRegion="polite" style={[styles.resultName, { color: colors.text }]}>
          {isResolvingLocation ? 'Identifying barangay…' : form.barangay || (hasPoint ? 'Confirmation needed' : 'Choose an incident location')}
        </Text>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Confirm or correct incident barangay"
          onPress={onOpenBarangays} style={styles.correct}>
          <Text style={[styles.link, { color: colors.blue }]}>{form.barangay ? 'Correct' : 'Confirm'}</Text>
        </TouchableOpacity>
      </View>
      <Text style={[styles.helper, { color: colors.textMuted }]}>{locationLookupMessage || 'The incident barangay is used for reports and analytics. If GPS or the map is unavailable, confirm it manually.'}</Text>
    </View>
    <Text style={[styles.label, { color: colors.textMuted }]}>EXACT PLACE / LANDMARK</Text>
    <TextInput accessibilityLabel="Exact incident place or landmark" style={[styles.input, surface, { color: colors.text }]}
      value={form.location} onChangeText={onEditLocation} multiline
      maxLength={REPORT_FIELD_LIMITS.location} placeholder="Example: Public market, main entrance"
      placeholderTextColor={colors.textMuted} />
  </View>;
}

const styles = StyleSheet.create({
  section: { marginTop: 20, gap: 8 },
  heading: { fontSize: 16, fontWeight: '700' },
  helper: { fontSize: 12, lineHeight: 18 },
  actions: { gap: 8, marginTop: 4 },
  action: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, borderWidth: 1 },
  copy: { flex: 1, gap: 2 },
  actionTitle: { fontSize: 14, fontWeight: '700' },
  coordinates: { fontSize: 12, lineHeight: 18 },
  result: { borderTopWidth: 1, borderBottomWidth: 1, paddingVertical: 12, marginVertical: 6 },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  resultName: { flex: 1, fontSize: 15, fontWeight: '700', lineHeight: 22 },
  correct: { minHeight: 48, minWidth: 64, justifyContent: 'center', alignItems: 'center' },
  link: { fontSize: 13, fontWeight: '700' },
  label: { fontSize: 11, fontWeight: '700', lineHeight: 17 },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 14, textAlignVertical: 'top' },
});
