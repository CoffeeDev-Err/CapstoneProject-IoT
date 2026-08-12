import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
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
  Marker,
  type CameraRef,
  type MapRef,
  type StyleSpecification,
} from '@maplibre/maplibre-react-native';
import { SvgUri } from 'react-native-svg';
import { CABAGAN_BOUNDARY_FEATURE } from '../constants/cabaganGeofence';
import {
  hasMapTilerApiKey,
  loadMapTilerStyle,
} from '../services/mapTilerConfig';
import type {
  OfficerMapCanvasHandle,
  OfficerMapCanvasProps,
  OfficerMapPerson,
} from './OfficerMapCanvas';

const CABAGAN_CENTER: [number, number] = [121.7653, 17.4269];
const PATROL_RADIUS_METERS = 320;

const createCircleFeature = (longitude: number, latitude: number, radiusMeters: number) => {
  const coordinates: [number, number][] = [];
  const latitudeRadius = radiusMeters / 111_320;
  const longitudeRadius = radiusMeters / (111_320 * Math.cos(latitude * Math.PI / 180));

  for (let index = 0; index <= 64; index += 1) {
    const angle = index / 64 * Math.PI * 2;
    coordinates.push([
      longitude + Math.cos(angle) * longitudeRadius,
      latitude + Math.sin(angle) * latitudeRadius,
    ]);
  }

  return {
    type: 'Feature' as const,
    properties: {},
    geometry: {
      type: 'Polygon' as const,
      coordinates: [coordinates],
    },
  };
};

function PersonnelMarker({
  currentPersonnelId,
  emergencyPulse,
  member,
  onPress,
}: {
  currentPersonnelId: string;
  emergencyPulse: Animated.Value;
  member: OfficerMapPerson;
  onPress: () => void;
}) {
  const isCurrent = member.id === currentPersonnelId;
  const borderColor = member.emergencyActive ? '#ff2f3d' : (isCurrent ? '#27c93f' : '#6b28f1');
  const pulseOpacity = emergencyPulse.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] });
  const pulseScale = emergencyPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.42] });

  return (
    <Marker
      id={`officer-${member.id}`}
      lngLat={[Number(member.longitude), Number(member.latitude)]}
      anchor="bottom"
      onPress={onPress}
    >
      <View style={styles.markerRoot}>
        <View style={styles.markerPhotoWrap}>
          {member.emergencyActive && (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.markerPulse,
                { opacity: pulseOpacity, transform: [{ scale: pulseScale }] },
              ]}
            />
          )}
          <Image
            source={{ uri: member.photoUrl }}
            style={[styles.markerPhoto, { borderColor }]}
          />
        </View>
        <View style={[styles.markerArrow, { borderTopColor: borderColor }]} />
      </View>
    </Marker>
  );
}

const OfficerMapCanvas = forwardRef<OfficerMapCanvasHandle, OfficerMapCanvasProps>(({
  assignment,
  currentPersonnelId,
  emergencyPulse,
  enable3D,
  isDark,
  mapMode,
  personnel,
  onOfficerPress,
}, ref) => {
  const mapRef = useRef<MapRef>(null);
  const cameraRef = useRef<CameraRef>(null);
  const initialFitDone = useRef(false);
  const [mapStyle, setMapStyle] = useState<string | StyleSpecification | null>(null);
  const [styleError, setStyleError] = useState<string | null>(null);
  const [styleLoading, setStyleLoading] = useState(false);

  const deploymentCenter = useMemo<[number, number]>(() => ([
    Number.isFinite(assignment?.longitude) ? Number(assignment?.longitude) : CABAGAN_CENTER[0],
    Number.isFinite(assignment?.latitude) ? Number(assignment?.latitude) : CABAGAN_CENTER[1],
  ]), [assignment?.latitude, assignment?.longitude]);

  const patrolArea = useMemo(() => (
    createCircleFeature(deploymentCenter[0], deploymentCenter[1], PATROL_RADIUS_METERS)
  ), [deploymentCenter]);

  const fitInitialPersonnel = useCallback(() => {
    if (initialFitDone.current) return;
    initialFitDone.current = true;

    const points = [
      deploymentCenter,
      ...personnel.map((member) => [Number(member.longitude), Number(member.latitude)] as [number, number]),
    ];

    if (points.length === 1) return;
    const longitudes = points.map(([longitude]) => longitude);
    const latitudes = points.map(([, latitude]) => latitude);
    cameraRef.current?.fitBounds(
      [Math.min(...longitudes), Math.min(...latitudes), Math.max(...longitudes), Math.max(...latitudes)],
      {
        padding: { top: 165, right: 35, bottom: 245, left: 35 },
        duration: 700,
        easing: 'ease',
      },
    );
  }, [deploymentCenter, personnel]);

  useImperativeHandle(ref, () => ({
    focusOfficer: (officerId: string) => {
      const member = personnel.find((item) => item.id === officerId);
      if (!member) return;
      cameraRef.current?.flyTo({
        center: [Number(member.longitude), Number(member.latitude)],
        zoom: 18,
        pitch: enable3D ? 52 : 0,
        duration: 720,
      });
    },
  }), [enable3D, personnel]);

  useEffect(() => {
    if (!hasMapTilerApiKey) {
      setMapStyle(null);
      setStyleError('Add EXPO_PUBLIC_MAPTILER_API_KEY to enable the cloud map.');
      return undefined;
    }

    const controller = new AbortController();
    setStyleLoading(true);
    setStyleError(null);
    loadMapTilerStyle(mapMode, isDark, enable3D, controller.signal)
      .then(setMapStyle)
      .catch((error) => {
        if ((error as Error).name !== 'AbortError') {
          setStyleError((error as Error).message || 'Unable to load the map style.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setStyleLoading(false);
      });
    return () => controller.abort();
  }, [enable3D, isDark, mapMode]);

  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.getCenter()
      .then((center) => cameraRef.current?.easeTo({
        center,
        pitch: enable3D ? 52 : 0,
        duration: 620,
      }))
      .catch(() => undefined);
  }, [enable3D]);

  if (!mapStyle) {
    return (
      <View style={[styles.mapFallback, isDark && styles.mapFallbackDark]}>
        {styleLoading ? <ActivityIndicator size="large" color="#246BFD" /> : null}
        <Text style={[styles.mapFallbackTitle, isDark && styles.mapFallbackTitleDark]}>
          {styleLoading ? 'Loading secure map' : 'Map configuration needed'}
        </Text>
        <Text style={[styles.mapFallbackText, isDark && styles.mapFallbackTextDark]}>
          {styleError || 'The MapTiler style is not available.'}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.mapRoot}>
      <Map
        ref={mapRef}
        style={styles.map}
        mapStyle={mapStyle}
        androidView="surface"
        preferredFramesPerSecond={60}
        dragPan
        touchZoom
        doubleTapZoom
        doubleTapHoldZoom
        touchRotate
        touchPitch
        compass
        compassHiddenFacingNorth
        compassPosition={{ top: 150, right: 12 }}
        attribution={false}
        logo={false}
        onDidFinishLoadingMap={fitInitialPersonnel}
      >
        <Camera
          ref={cameraRef}
          minZoom={10}
          maxZoom={20}
          initialViewState={{
            center: deploymentCenter,
            zoom: 14.5,
            pitch: enable3D ? 52 : 0,
          }}
        />

        <GeoJSONSource id="geosentri-patrol-area" data={patrolArea}>
          <Layer
            id="geosentri-patrol-fill"
            type="fill"
            source="geosentri-patrol-area"
            paint={{ 'fill-color': '#6b28f1', 'fill-opacity': 0.08 }}
          />
          <Layer
            id="geosentri-patrol-line"
            type="line"
            source="geosentri-patrol-area"
            paint={{
              'line-color': '#6b28f1',
              'line-width': 2,
              'line-dasharray': [3, 2.5],
            }}
          />
        </GeoJSONSource>

        <GeoJSONSource id="geosentri-cabagan-boundary" data={CABAGAN_BOUNDARY_FEATURE}>
          <Layer
            id="geosentri-cabagan-fill"
            type="fill"
            source="geosentri-cabagan-boundary"
            paint={{ 'fill-color': '#ef4444', 'fill-opacity': 0.025 }}
          />
          <Layer
            id="geosentri-cabagan-line"
            type="line"
            source="geosentri-cabagan-boundary"
            paint={{
              'line-color': '#ef4444',
              'line-width': 2.1,
              'line-opacity': 0.88,
              'line-dasharray': [3, 2],
            }}
          />
        </GeoJSONSource>

        {personnel.map((member) => (
          <PersonnelMarker
            key={member.id}
            member={member}
            currentPersonnelId={currentPersonnelId}
            emergencyPulse={emergencyPulse}
            onPress={() => onOfficerPress(member.id)}
          />
        ))}
      </Map>

      {styleLoading && (
        <View pointerEvents="none" style={styles.styleLoader}>
          <ActivityIndicator size="small" color="#246BFD" />
        </View>
      )}

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
});

OfficerMapCanvas.displayName = 'OfficerMapCanvas';

export default OfficerMapCanvas;

const styles = StyleSheet.create({
  mapRoot: { flex: 1, backgroundColor: '#dce5ef' },
  map: { flex: 1 },
  mapFallback: {
    flex: 1,
    paddingHorizontal: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e9eff7',
  },
  mapFallbackDark: { backgroundColor: '#071326' },
  mapFallbackTitle: { marginTop: 12, color: '#17213a', fontSize: 17, fontWeight: '800' },
  mapFallbackTitleDark: { color: '#f8fafc' },
  mapFallbackText: { marginTop: 6, color: '#64748b', fontSize: 12, lineHeight: 18, textAlign: 'center' },
  mapFallbackTextDark: { color: '#9eabc0' },
  markerRoot: { width: 54, height: 63, alignItems: 'center', justifyContent: 'flex-start' },
  markerPhotoWrap: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center' },
  markerPhoto: { width: 42, height: 42, borderWidth: 3, borderRadius: 21, backgroundColor: '#ffffff' },
  markerPulse: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderWidth: 3,
    borderColor: '#ff2f3d',
    borderRadius: 22,
  },
  markerArrow: {
    width: 0,
    height: 0,
    marginTop: -2,
    borderLeftWidth: 9,
    borderRightWidth: 9,
    borderTopWidth: 14,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  styleLoader: {
    position: 'absolute',
    top: 202,
    right: 15,
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  attribution: {
    position: 'absolute',
    left: 6,
    bottom: 5,
    paddingHorizontal: 6,
    paddingVertical: 3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.88)',
  },
  attributionText: { color: '#334155', fontSize: 8, fontWeight: '700' },
});
