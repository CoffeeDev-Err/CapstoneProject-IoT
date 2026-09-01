import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialIcons as Icon } from '@expo/vector-icons';
import { mobileTheme } from '../../constants/mobileTheme';

export type MapMode = 'street' | 'satellite';

export const MAP_TOP_CONTROLS_OFFSET = 58;

export function getMapTopControlPosition(
  headerTopInset: number,
  headerContentHeight: number,
  headerVisibility: number,
) {
  const visibleFraction = Math.max(0, Math.min(1, headerVisibility));
  return Math.round(
    headerTopInset + MAP_TOP_CONTROLS_OFFSET + (headerContentHeight * visibleFraction),
  );
}

type MapControlsProps = {
  colors: { border: string; surface: string; text: string; textMuted: string };
  expanded: boolean;
  mapMode: MapMode;
  progress: Animated.Value;
  setExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  setMapMode: React.Dispatch<React.SetStateAction<MapMode>>;
  setThreeDEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  threeDEnabled: boolean;
};

type MapLegendControlProps = {
  colors: { border: string; surface: string; text: string; textMuted: string };
  expanded: boolean;
  setExpanded: React.Dispatch<React.SetStateAction<boolean>>;
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
  mapMode,
  progress,
  setExpanded,
  setMapMode,
  setThreeDEnabled,
  threeDEnabled,
}: MapControlsProps) {
  return (
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
  );
}

export function MapLegendControl({ colors, expanded, setExpanded }: MapLegendControlProps) {
  const revealProgress = useRef(new Animated.Value(expanded ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(revealProgress, {
      toValue: expanded ? 1 : 0,
      duration: expanded ? 220 : 170,
      easing: expanded ? Easing.out(Easing.cubic) : Easing.inOut(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [expanded, revealProgress]);

  return (
    <View style={styles.legendRoot}>
      <Animated.View
        accessibilityElementsHidden={!expanded}
        importantForAccessibility={expanded ? 'yes' : 'no-hide-descendants'}
        pointerEvents={expanded ? 'auto' : 'none'}
        style={[
          styles.legendPopover,
          { backgroundColor: colors.surface, borderColor: colors.border },
          {
            opacity: revealProgress,
            transform: [
              {
                translateX: revealProgress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [10, 0],
                }),
              },
              {
                scale: revealProgress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.96, 1],
                }),
              },
            ],
          },
        ]}>
          <View style={styles.legendHeader}>
            <Text style={[styles.legendTitle, { color: colors.text }]}>Map legend</Text>
            <TouchableOpacity
              accessibilityLabel="Hide map legend"
              hitSlop={8}
              style={styles.legendClose}
              onPress={() => setExpanded(false)}
            >
              <Icon name="close" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
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
                <Text style={[styles.legendLabel, { color: colors.text }]} numberOfLines={2}>{item.label}</Text>
              </View>
            ))}
          </View>
      </Animated.View>
      <TouchableOpacity
        accessibilityLabel={expanded ? 'Hide map legend' : 'Show map legend'}
        accessibilityState={{ expanded }}
        activeOpacity={0.78}
        style={[
          styles.legendToggle,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
        onPress={() => setExpanded((current) => !current)}
      >
        <Icon name="format-list-bulleted" size={23} color={expanded ? mobileTheme.blue : colors.text} />
      </TouchableOpacity>
    </View>
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
  legendRoot: { position: 'relative', width: 46, height: 46, alignItems: 'flex-end' },
  legendPopover: { position: 'absolute', top: 0, right: 54, width: 224, overflow: 'hidden', borderWidth: 1, borderRadius: 16, shadowColor: '#172554', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.16, shadowRadius: 9, elevation: 10 },
  legendHeader: { minHeight: 42, paddingLeft: 13, paddingRight: 7, flexDirection: 'row', alignItems: 'center' },
  legendTitle: { flex: 1, fontSize: 12, fontWeight: '900' },
  legendClose: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  legendItems: { padding: 8, paddingTop: 7, flexDirection: 'row', flexWrap: 'wrap', borderTopWidth: 1 },
  legendItem: { width: '50%', minHeight: 38, paddingRight: 5, flexDirection: 'row', alignItems: 'center', gap: 7 },
  legendMarker: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFFFFF', borderRadius: 11 },
  legendMarkerDiamond: { borderRadius: 4, transform: [{ rotate: '45deg' }] },
  legendMarkerSquare: { borderRadius: 5 },
  legendCue: { color: '#FFFFFF', fontSize: 7, fontWeight: '900' },
  legendCueDiamond: { transform: [{ rotate: '-45deg' }], fontSize: 10 },
  legendLabel: { flex: 1, fontSize: 10, fontWeight: '700', lineHeight: 12 },
  legendToggle: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 14, shadowColor: '#172554', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.16, shadowRadius: 8, elevation: 8 },
});
