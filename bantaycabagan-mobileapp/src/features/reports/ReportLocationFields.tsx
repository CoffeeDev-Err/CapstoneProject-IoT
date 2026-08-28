import React from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { MaterialIcons as Icon } from '@expo/vector-icons';
import { mobileTheme } from '../../constants/mobileTheme';
import { useMobileTheme } from '../../context/ThemeContext';
import type { ReportForm } from './reportForm';

type ReportLocationFieldsProps = {
  form: ReportForm;
  onEditLocation: (value: string) => void;
  onOpenBarangays: () => void;
  onOpenMap: () => void;
  onUseCurrentGps: () => void;
};

export function ReportLocationFields({
  form, onEditLocation, onOpenBarangays, onOpenMap, onUseCurrentGps,
}: ReportLocationFieldsProps) {
  const { colors, isDark } = useMobileTheme();
  const inputSurface = isDark ? { backgroundColor: colors.surfaceMuted, borderColor: colors.border } : null;
  return (
    <>
      <Text style={[styles.label, { color: colors.textMuted }]}>BARANGAY</Text>
      <TouchableOpacity style={[styles.select, inputSurface]} onPress={onOpenBarangays}>
        <Icon name="map" size={18} color={mobileTheme.purple} />
        <Text style={[styles.fieldText, { color: form.barangay ? colors.text : colors.textMuted }]}>
          {form.barangay || 'Select a Cabagan barangay'}
        </Text>
        <Icon name="keyboard-arrow-down" size={21} color={colors.textMuted} />
      </TouchableOpacity>

      <Text style={[styles.label, { color: colors.textMuted }]}>EXACT INCIDENT PLACE / LANDMARK</Text>
      <TextInput style={[styles.input, inputSurface, { color: colors.text }]}
        value={form.location} onChangeText={onEditLocation}
        placeholder="Example: Anao Public Market entrance" placeholderTextColor={colors.textMuted} />
      <View style={styles.assistRow}>
        <View style={styles.source}>
          <Icon name={form.location_source === 'gps' ? 'gps-fixed' : 'edit-location-alt'}
            size={15} color={colors.textMuted} />
          <Text style={[styles.sourceText, { color: colors.textMuted }]}>
            {form.location_source === 'gps' ? 'Current GPS suggestion' : 'Manual incident location'}
          </Text>
        </View>
        <TouchableOpacity style={[styles.gpsButton, inputSurface]} onPress={onUseCurrentGps}>
          <Icon name="my-location" size={16} color={mobileTheme.purple} />
          <Text style={styles.gpsText}>Use current GPS</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity style={[styles.mapButton, inputSurface]} onPress={onOpenMap}>
        <View style={styles.mapIcon}><Icon name="add-location-alt" size={20} color={mobileTheme.purple} /></View>
        <View style={styles.mapCopy}>
          <Text style={[styles.mapTitle, { color: colors.text }]}>Pick the incident point on map</Text>
          <Text style={[styles.mapMeta, { color: colors.textMuted }]}>
            {typeof form.latitude === 'number' && typeof form.longitude === 'number'
              ? `${form.latitude.toFixed(6)}, ${form.longitude.toFixed(6)}`
              : 'Recommended when the report is submitted after leaving the scene'}
          </Text>
        </View>
        <Icon name="chevron-right" size={22} color={colors.textMuted} />
      </TouchableOpacity>
      <Text style={[styles.helper, { color: colors.textMuted }]}>
        Verify the actual incident place. Your current position may be different if you submit later.
      </Text>
    </>
  );
}

const styles = StyleSheet.create({
  label: { marginTop: 14, marginBottom: 6, fontSize: 10, fontWeight: '800' },
  select: { minHeight: 46, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: mobileTheme.border, borderRadius: 12, backgroundColor: mobileTheme.surface },
  fieldText: { flex: 1, fontSize: 13, lineHeight: 18 },
  input: { minHeight: 46, paddingHorizontal: 12, borderWidth: 1, borderColor: mobileTheme.border, borderRadius: 12, backgroundColor: mobileTheme.surface, fontSize: 13 },
  assistRow: { marginTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  source: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5 },
  sourceText: { flex: 1, fontSize: 10 },
  gpsButton: { minHeight: 36, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderWidth: 1, borderColor: mobileTheme.purple, borderRadius: 18, backgroundColor: mobileTheme.surface },
  gpsText: { color: mobileTheme.purple, fontSize: 10, fontWeight: '800' },
  mapButton: { minHeight: 70, marginTop: 10, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: mobileTheme.border, borderRadius: 12, backgroundColor: mobileTheme.surface },
  mapIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: mobileTheme.purpleSoft },
  mapCopy: { flex: 1 },
  mapTitle: { fontSize: 12, fontWeight: '800' },
  mapMeta: { marginTop: 3, fontSize: 9, lineHeight: 14 },
  helper: { marginTop: 7, fontSize: 10, lineHeight: 15 },
});
