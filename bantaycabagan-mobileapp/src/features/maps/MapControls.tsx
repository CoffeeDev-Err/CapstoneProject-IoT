import React from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialIcons as Icon } from '@expo/vector-icons';
import { mobileTheme } from '../../constants/mobileTheme';

export type MapMode = 'street' | 'satellite';

type MapControlsProps = {
  colors: { border: string; surface: string; text: string; textMuted: string };
  expanded: boolean;
  legendExpanded: boolean;
  mapMode: MapMode;
  progress: Animated.Value;
  setExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  setLegendExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  setMapMode: React.Dispatch<React.SetStateAction<MapMode>>;
  setThreeDEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  threeDEnabled: boolean;
};

const OPTIONS_EXPANDED_HEIGHT = 144;
const legendItems = [
  { tone: mobileTheme.mapBackup, cue: 'SOS', label: 'Backup request', shape: 'circle' },
  { tone: mobileTheme.mapBoundary, cue: '!', label: 'Outside Cabagan', shape: 'diamond' },
  { tone: mobileTheme.mapOperation, cue: 'OP', label: 'On operation', shape: 'square' },
  { tone: mobileTheme.mapDuty, cue: '✓', label: 'On duty', shape: 'circle' },
] as const;

export function MapControls({
  colors,
  expanded,
  legendExpanded,
  mapMode,
  progress,
  setExpanded,
  setLegendExpanded,
  setMapMode,
  setThreeDEnabled,
  threeDEnabled,
}: MapControlsProps) {
  return (
    <>
      <View style={[styles.modeControl, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <TouchableOpacity
          accessibilityLabel={expanded ? 'Hide map options' : 'Show map options'}
          accessibilityState={{ expanded }}
          style={[styles.modeButton, styles.menuButton]}
          onPress={() => setExpanded((current) => !current)}
        >
          <Icon name={expanded ? 'close' : 'layers'} size={20} color={colors.text} />
        </TouchableOpacity>
        <Animated.View
          pointerEvents={expanded ? 'auto' : 'none'}
          style={[
            styles.optionsClip,
            {
              height: progress.interpolate({ inputRange: [0, 1], outputRange: [0, OPTIONS_EXPANDED_HEIGHT] }),
              opacity: progress.interpolate({ inputRange: [0, 0.22, 1], outputRange: [0, 0, 1] }),
            },
          ]}
        >
          <View style={styles.optionsContent}>
            <TouchableOpacity
              accessibilityLabel="Use normal map"
              accessibilityState={{ selected: mapMode === 'street' }}
              style={[styles.modeButton, styles.optionButton, mapMode === 'street' && styles.activeButton]}
              onPress={() => setMapMode('street')}
            >
              <Icon name="map" size={17} color={mapMode === 'street' ? '#ffffff' : colors.textMuted} />
              <Text style={[styles.buttonLabel, { color: mapMode === 'street' ? '#ffffff' : colors.textMuted }]}>Map</Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityLabel="Use satellite map"
              accessibilityState={{ selected: mapMode === 'satellite' }}
              style={[styles.modeButton, styles.optionButton, mapMode === 'satellite' && styles.activeButton]}
              onPress={() => setMapMode('satellite')}
            >
              <Icon name="satellite-alt" size={17} color={mapMode === 'satellite' ? '#ffffff' : colors.textMuted} />
              <Text style={[styles.buttonLabel, { color: mapMode === 'satellite' ? '#ffffff' : colors.textMuted }]}>Satellite</Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityLabel={threeDEnabled ? 'Disable terrain view' : 'Enable terrain view'}
              accessibilityState={{ selected: threeDEnabled }}
              style={[styles.modeButton, styles.optionButton, threeDEnabled && styles.activeButton]}
              onPress={() => setThreeDEnabled((enabled) => !enabled)}
            >
              <Icon name="3d-rotation" size={17} color={threeDEnabled ? '#ffffff' : colors.textMuted} />
              <Text style={[styles.buttonLabel, { color: threeDEnabled ? '#ffffff' : colors.textMuted }]}>Terrain</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>

      <View style={[
        styles.legend,
        legendExpanded && styles.legendExpanded,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}>
        <TouchableOpacity
          accessibilityLabel={legendExpanded ? 'Hide map legend' : 'Show map legend'}
          accessibilityState={{ expanded: legendExpanded }}
          style={styles.legendToggle}
          onPress={() => setLegendExpanded((current) => !current)}
        >
          <Icon name="format-list-bulleted" size={19} color={colors.text} />
          {legendExpanded && <Text style={[styles.legendTitle, { color: colors.text }]}>Map legend</Text>}
          {legendExpanded && <Icon name="expand-less" size={18} color={colors.textMuted} />}
        </TouchableOpacity>
        {legendExpanded && (
          <View style={[styles.legendItems, { borderTopColor: colors.border }]}>
            {legendItems.map((item) => (
              <View key={item.label} style={styles.legendItem}>
                <View style={[
                  styles.legendMarker,
                  item.shape === 'diamond' && styles.legendMarkerDiamond,
                  item.shape === 'square' && styles.legendMarkerSquare,
                  { backgroundColor: item.tone },
                ]}>
                  <Text style={[styles.legendCue, item.shape === 'diamond' && styles.legendCueDiamond]}>{item.cue}</Text>
                </View>
                <Text style={[styles.legendLabel, { color: colors.text }]}>{item.label}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  modeControl: { width: 46, padding: 3, flexDirection: 'column', borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.96)', shadowColor: '#172554', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.14, shadowRadius: 8, elevation: 5 },
  optionsClip: { width: 40, overflow: 'hidden' },
  optionsContent: { paddingTop: 4, gap: 4 },
  modeButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 11 },
  menuButton: { backgroundColor: 'rgba(148,163,184,0.14)' },
  optionButton: { width: 40, height: 44, flexDirection: 'column', gap: 1, paddingHorizontal: 0 },
  buttonLabel: { fontSize: 8, fontWeight: '800', lineHeight: 9, letterSpacing: -0.25 },
  activeButton: { backgroundColor: mobileTheme.purple },
  legend: { width: 46, marginTop: 8, overflow: 'hidden', alignSelf: 'flex-start', borderWidth: 1, borderRadius: 14, shadowColor: '#172554', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.14, shadowRadius: 8, elevation: 8 },
  legendExpanded: { width: 186 },
  legendToggle: { height: 42, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendTitle: { flex: 1, fontSize: 12, fontWeight: '900' },
  legendItems: { padding: 8, paddingTop: 5, borderTopWidth: 1 },
  legendItem: { minHeight: 30, flexDirection: 'row', alignItems: 'center', gap: 9 },
  legendMarker: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFFFFF', borderRadius: 11 },
  legendMarkerDiamond: { borderRadius: 4, transform: [{ rotate: '45deg' }] },
  legendMarkerSquare: { borderRadius: 5 },
  legendCue: { color: '#FFFFFF', fontSize: 7, fontWeight: '900' },
  legendCueDiamond: { transform: [{ rotate: '-45deg' }], fontSize: 10 },
  legendLabel: { fontSize: 11, fontWeight: '700' },
});
