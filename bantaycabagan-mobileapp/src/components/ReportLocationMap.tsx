import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export type ReportMapCoordinates = {
  latitude: number;
  longitude: number;
};

export type ReportLocationMapProps = {
  initialCoordinates: ReportMapCoordinates;
  isDark: boolean;
  selectedCoordinates: ReportMapCoordinates | null;
  onSelect: (coordinates: ReportMapCoordinates) => void;
};

/**
 * Browser-preview placeholder. Officers pin incident locations on MapLibre in
 * ReportLocationMap.native.tsx; react-native-webview has no web implementation,
 * so this variant states that plainly instead of embedding a remote map bundle.
 * The prop and coordinate types above are shared with the native picker.
 */
export default function ReportLocationMap({ isDark, selectedCoordinates }: ReportLocationMapProps) {
  return (
    <View style={[styles.fallback, isDark && styles.fallbackDark]}>
      <Text style={[styles.fallbackTitle, isDark && styles.fallbackTitleDark]}>
        Location picking is mobile-only
      </Text>
      <Text style={[styles.fallbackText, isDark && styles.fallbackTextDark]}>
        Open GeoSentri on the officer device to pin the incident scene on the map.
      </Text>
      {selectedCoordinates && (
        <Text style={[styles.fallbackCoordinates, isDark && styles.fallbackTextDark]}>
          {`${selectedCoordinates.latitude.toFixed(6)}, ${selectedCoordinates.longitude.toFixed(6)}`}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: { flex: 1, paddingHorizontal: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: '#e9eff7' },
  fallbackDark: { backgroundColor: '#071326' },
  fallbackTitle: { color: '#17213a', fontSize: 16, fontWeight: '800', textAlign: 'center' },
  fallbackTitleDark: { color: '#f8fafc' },
  fallbackText: { marginTop: 6, color: '#64748b', fontSize: 12, lineHeight: 18, textAlign: 'center' },
  fallbackTextDark: { color: '#9eabc0' },
  fallbackCoordinates: { marginTop: 12, color: '#334155', fontSize: 12, fontWeight: '700' },
});
