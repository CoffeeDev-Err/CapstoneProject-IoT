import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  Camera,
  GeoJSONSource,
  Layer,
  Map,
  ViewAnnotation,
  type StyleSpecification,
} from '@maplibre/maplibre-react-native';
import { SvgUri } from 'react-native-svg';
import { CABAGAN_BOUNDARY_FEATURE } from '../constants/cabaganGeofence';
import {
  hasMapTilerApiKey,
  loadMapTilerStyle,
} from '../services/mapTilerConfig';
import type {
  ReportLocationMapProps,
  ReportMapCoordinates,
} from './ReportLocationMap';

export default function ReportLocationMap({
  initialCoordinates,
  isDark,
  selectedCoordinates,
  onSelect,
}: ReportLocationMapProps) {
  const [mapStyle, setMapStyle] = useState<string | StyleSpecification | null>(null);
  const [styleError, setStyleError] = useState<string | null>(null);

  useEffect(() => {
    if (!hasMapTilerApiKey) {
      setStyleError('Add EXPO_PUBLIC_MAPTILER_API_KEY to enable location selection.');
      return undefined;
    }
    const controller = new AbortController();
    setStyleError(null);
    loadMapTilerStyle('street', isDark, false, controller.signal)
      .then(setMapStyle)
      .catch((error) => {
        if ((error as Error).name !== 'AbortError') {
          setStyleError((error as Error).message || 'Unable to load the location map.');
        }
      });
    return () => controller.abort();
  }, [isDark]);

  const selectLngLat = ([longitude, latitude]: [number, number]) => {
    const coordinates: ReportMapCoordinates = { latitude, longitude };
    onSelect(coordinates);
  };

  if (!mapStyle) {
    return (
      <View style={[styles.fallback, isDark && styles.fallbackDark]}>
        {!styleError && <ActivityIndicator size="large" color="#246BFD" />}
        <Text style={[styles.fallbackTitle, isDark && styles.fallbackTitleDark]}>
          {styleError ? 'Map configuration needed' : 'Loading location map'}
        </Text>
        {styleError && (
          <Text style={[styles.fallbackText, isDark && styles.fallbackTextDark]}>{styleError}</Text>
        )}
      </View>
    );
  }

  return (
    <View style={styles.mapRoot}>
      <Map
        style={styles.map}
        mapStyle={mapStyle}
        preferredFramesPerSecond={60}
        dragPan
        touchZoom
        doubleTapZoom
        doubleTapHoldZoom
        touchRotate
        touchPitch
        compass
        compassPosition={{ top: 12, right: 12 }}
        attribution={false}
        logo={false}
        onPress={(event) => selectLngLat(event.nativeEvent.lngLat)}
      >
        <Camera
          minZoom={10}
          maxZoom={20}
          initialViewState={{
            center: [initialCoordinates.longitude, initialCoordinates.latitude],
            zoom: selectedCoordinates ? 17 : 14,
          }}
        />

        <GeoJSONSource id="report-cabagan-boundary" data={CABAGAN_BOUNDARY_FEATURE}>
          <Layer
            id="report-cabagan-fill"
            type="fill"
            source="report-cabagan-boundary"
            paint={{ 'fill-color': '#ef4444', 'fill-opacity': 0.025 }}
          />
          <Layer
            id="report-cabagan-line"
            type="line"
            source="report-cabagan-boundary"
            paint={{
              'line-color': '#ef4444',
              'line-width': 2,
              'line-opacity': 0.88,
              'line-dasharray': [3, 2],
            }}
          />
        </GeoJSONSource>

        {selectedCoordinates && (
          <ViewAnnotation
            id="incident-location"
            lngLat={[selectedCoordinates.longitude, selectedCoordinates.latitude]}
            anchor="bottom"
            draggable
            onDragEnd={(event) => selectLngLat(event.nativeEvent.lngLat)}
          >
            <View style={styles.pinWrap}>
              <View style={styles.pin} />
            </View>
          </ViewAnnotation>
        )}
      </Map>

      <Pressable
        accessibilityRole="link"
        accessibilityLabel="Map data attribution"
        style={styles.attribution}
        onPress={() => Linking.openURL('https://www.maptiler.com/copyright/').catch(() => undefined)}
      >
        <SvgUri width={54} height={16} uri="https://api.maptiler.com/resources/logo.svg" />
        <Text style={styles.attributionText}>© OpenStreetMap</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  mapRoot: { flex: 1, backgroundColor: '#dce5ef' },
  map: { flex: 1 },
  fallback: { flex: 1, paddingHorizontal: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: '#e9eff7' },
  fallbackDark: { backgroundColor: '#071326' },
  fallbackTitle: { marginTop: 12, color: '#17213a', fontSize: 16, fontWeight: '800' },
  fallbackTitleDark: { color: '#f8fafc' },
  fallbackText: { marginTop: 6, color: '#64748b', fontSize: 12, lineHeight: 18, textAlign: 'center' },
  fallbackTextDark: { color: '#9eabc0' },
  pinWrap: { width: 34, height: 43, alignItems: 'center', justifyContent: 'flex-start' },
  pin: {
    width: 27,
    height: 27,
    borderWidth: 4,
    borderColor: '#ffffff',
    borderRadius: 14,
    backgroundColor: '#ef4444',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 5,
    elevation: 5,
  },
  attribution: { position: 'absolute', left: 6, bottom: 5, paddingHorizontal: 6, paddingVertical: 3, flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.88)' },
  attributionText: { color: '#334155', fontSize: 8, fontWeight: '700' },
});
