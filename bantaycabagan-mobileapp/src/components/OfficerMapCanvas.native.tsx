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
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import {
  Camera,
  GeoJSONSource,
  Layer,
  Map as MapLibreMap,
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
import {
  CLUSTER_MAX_ZOOM,
  clusterPersonnel,
  confirmedFixFromMember,
  interpolatePosition,
  markerMotionForFixes,
  markerTone,
  markerToneColor,
  type ConfirmedGpsFix,
} from '../utils/officerMapMath';
import type {
  OfficerMapCanvasHandle,
  OfficerMapCanvasProps,
  OfficerMapPerson,
} from './OfficerMapCanvas';

const CABAGAN_CENTER: [number, number] = [121.7653, 17.4269];
const STREET_FOCUS_ZOOM = 16;
const SATELLITE_FOCUS_ZOOM = 15;
const ANIMATION_FRAME_INTERVAL = 1000 / 30;

type OfficerMotion = {
  durationMs: number;
  suppressJitter: boolean;
  target: [number, number];
};

const useInterpolatedPersonnel = (personnel: OfficerMapPerson[]) => {
  const [interpolated, setInterpolated] = useState(personnel);
  const currentPositions = useRef(new globalThis.Map<string, [number, number]>());
  const effectiveTargets = useRef(new globalThis.Map<string, [number, number]>());
  const previousConfirmedFixes = useRef(new globalThis.Map<string, ConfirmedGpsFix>());
  const motionByOfficer = useRef(new globalThis.Map<string, OfficerMotion>());
  const animationFrame = useRef<number | null>(null);

  useEffect(() => {
    if (animationFrame.current !== null) cancelAnimationFrame(animationFrame.current);
    const starts = new globalThis.Map<string, [number, number]>();
    const motions = new globalThis.Map<string, OfficerMotion>();
    const activeIds = new Set(personnel.map((member) => member.id));
    currentPositions.current.forEach((_, id) => {
      if (!activeIds.has(id)) currentPositions.current.delete(id);
    });
    effectiveTargets.current.forEach((_, id) => {
      if (!activeIds.has(id)) effectiveTargets.current.delete(id);
    });
    previousConfirmedFixes.current.forEach((_, id) => {
      if (!activeIds.has(id)) previousConfirmedFixes.current.delete(id);
    });

    personnel.forEach((member) => {
      const confirmedFix = confirmedFixFromMember(member);
      const rawTarget: [number, number] = [confirmedFix.longitude, confirmedFix.latitude];
      const start = currentPositions.current.get(member.id) || rawTarget;
      const motion = markerMotionForFixes(previousConfirmedFixes.current.get(member.id), confirmedFix);
      const target = motion.suppressJitter
        ? (effectiveTargets.current.get(member.id) || start)
        : rawTarget;
      starts.set(member.id, start);
      motions.set(member.id, {
        durationMs: start[0] === target[0] && start[1] === target[1] ? 0 : motion.durationMs,
        suppressJitter: motion.suppressJitter,
        target,
      });
      effectiveTargets.current.set(member.id, target);
      previousConfirmedFixes.current.set(member.id, confirmedFix);
    });
    motionByOfficer.current = motions;
    const startedAt = Date.now();
    let lastRenderedAt = 0;

    const tick = () => {
      const now = Date.now();
      const hasActiveMotion = personnel.some((member) => {
        const durationMs = motions.get(member.id)?.durationMs || 0;
        return now - startedAt < durationMs;
      });
      if (hasActiveMotion && now - lastRenderedAt < ANIMATION_FRAME_INTERVAL) {
        animationFrame.current = requestAnimationFrame(tick);
        return;
      }
      lastRenderedAt = now;
      const next = personnel.map((member) => {
        const start = starts.get(member.id)!;
        const motion = motions.get(member.id)!;
        const target = motion.target;
        const progress = motion.durationMs > 0
          ? Math.min((now - startedAt) / motion.durationMs, 1)
          : 1;
        const position = interpolatePosition(start, target, progress);
        currentPositions.current.set(member.id, position);
        return { ...member, longitude: position[0], latitude: position[1] };
      });
      setInterpolated(next);
      if (hasActiveMotion) animationFrame.current = requestAnimationFrame(tick);
      else animationFrame.current = null;
    };

    animationFrame.current = requestAnimationFrame(tick);
    return () => {
      if (animationFrame.current !== null) cancelAnimationFrame(animationFrame.current);
    };
  }, [personnel]);

  return { interpolated, motionByOfficer };
};

function PersonnelMarker({
  currentPersonnelId,
  emergencyPulse,
  followedOfficerId,
  member,
  onPress,
}: {
  currentPersonnelId: string;
  emergencyPulse: Animated.Value;
  followedOfficerId: string | null;
  member: OfficerMapPerson;
  onPress: () => void;
}) {
  const isCurrent = member.id === currentPersonnelId;
  const isFollowed = member.id === followedOfficerId;
  const tone = markerTone(member);
  const borderColor = markerToneColor(tone);
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
          {tone === 'critical' && (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.markerPulse,
                { opacity: pulseOpacity, transform: [{ scale: pulseScale }] },
              ]}
            />
          )}
          <View style={[
            styles.markerCurrentRing,
            isCurrent && styles.markerCurrentRingVisible,
            isFollowed && styles.markerFollowedRing,
          ]}>
            <Image
              source={{ uri: member.photoUrl }}
              cachePolicy="memory"
              style={[styles.markerPhoto, { borderColor }]}
            />
          </View>
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
  followedOfficerId,
  isDark,
  mapMode,
  personnel,
  onMapInteractionEnd,
  onMapInteractionStart,
  onOfficerPress,
}, ref) => {
  const mapRef = useRef<MapRef>(null);
  const cameraRef = useRef<CameraRef>(null);
  const initialFitDone = useRef(false);
  const userInteractionInProgress = useRef(false);
  const [mapStyle, setMapStyle] = useState<string | StyleSpecification | null>(null);
  const [mapStyleRevision, setMapStyleRevision] = useState(0);
  const [styleError, setStyleError] = useState<string | null>(null);
  const [styleLoading, setStyleLoading] = useState(false);
  const [mapZoom, setMapZoom] = useState(14.5);
  const { interpolated: interpolatedPersonnel, motionByOfficer } = useInterpolatedPersonnel(personnel);
  const followedPersonnel = useMemo(
    () => interpolatedPersonnel.find((member) => member.id === followedOfficerId) || null,
    [followedOfficerId, interpolatedPersonnel],
  );
  const clusteredPersonnel = useMemo(
    () => clusterPersonnel(
      interpolatedPersonnel.filter((member) => member.id !== followedOfficerId),
      mapZoom,
    ),
    [followedOfficerId, interpolatedPersonnel, mapZoom],
  );
  const clusterPulseOpacity = emergencyPulse.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] });
  const clusterPulseScale = emergencyPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.42] });

  const deploymentCenter = useMemo<[number, number]>(() => ([
    Number.isFinite(assignment?.longitude) ? Number(assignment?.longitude) : CABAGAN_CENTER[0],
    Number.isFinite(assignment?.latitude) ? Number(assignment?.latitude) : CABAGAN_CENTER[1],
  ]), [assignment?.latitude, assignment?.longitude]);

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

  const handleMapLoaded = useCallback(() => {
    setStyleLoading(false);
    const followed = personnel.find((member) => member.id === followedOfficerId);
    if (followed) {
      cameraRef.current?.flyTo({
        center: [Number(followed.longitude), Number(followed.latitude)],
        zoom: mapMode === 'satellite' ? SATELLITE_FOCUS_ZOOM : STREET_FOCUS_ZOOM,
        pitch: enable3D ? 52 : 0,
        duration: 500,
      });
      return;
    }
    initialFitDone.current = false;
    fitInitialPersonnel();
  }, [enable3D, fitInitialPersonnel, followedOfficerId, mapMode, personnel]);

  useImperativeHandle(ref, () => ({
    focusOfficer: (officerId: string) => {
      const member = personnel.find((item) => item.id === officerId);
      if (!member) return;
      cameraRef.current?.flyTo({
        center: [Number(member.longitude), Number(member.latitude)],
        // Global satellite imagery around Cabagan has less native detail than
        // vector streets. Avoid over-zooming its raster pixels when locating.
        zoom: mapMode === 'satellite' ? SATELLITE_FOCUS_ZOOM : STREET_FOCUS_ZOOM,
        pitch: enable3D ? 52 : 0,
        duration: 720,
      });
    },
  }), [enable3D, mapMode, personnel]);

  useEffect(() => {
    if (!followedOfficerId) return;
    const motion = motionByOfficer.current.get(followedOfficerId);
    if (!motion || motion.durationMs <= 0 || motion.suppressJitter) return;
    cameraRef.current?.easeTo({
      center: motion.target,
      pitch: enable3D ? 52 : 0,
      duration: motion.durationMs,
    });
  }, [enable3D, followedOfficerId, motionByOfficer, personnel]);

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
      .then((style) => {
        setMapStyle(style);
        setMapStyleRevision((revision) => revision + 1);
      })
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
      <MapLibreMap
        key={`map-style-${mapStyleRevision}`}
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
        compassPosition={{ top: 150, left: 12 }}
        attribution={false}
        logo={false}
        onWillStartLoadingMap={() => setStyleLoading(true)}
        onDidFinishLoadingStyle={() => setStyleLoading(false)}
        onDidFinishLoadingMap={handleMapLoaded}
        onRegionWillChange={(event) => {
          if (!event.nativeEvent.userInteraction || userInteractionInProgress.current) return;
          userInteractionInProgress.current = true;
          onMapInteractionStart?.();
        }}
        onRegionDidChange={(event) => {
          setMapZoom(event.nativeEvent.zoom);
          if (!userInteractionInProgress.current) return;
          userInteractionInProgress.current = false;
          onMapInteractionEnd?.();
        }}
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

        {followedPersonnel && (
          <PersonnelMarker
            member={followedPersonnel}
            currentPersonnelId={currentPersonnelId}
            emergencyPulse={emergencyPulse}
            followedOfficerId={followedOfficerId}
            onPress={() => onOfficerPress(followedPersonnel.id)}
          />
        )}

        {clusteredPersonnel.map((cluster) => cluster.members.length > 1 ? (
          <Marker
            key={`cluster-${cluster.id}`}
            id={`cluster-${cluster.id}`}
            lngLat={[cluster.longitude, cluster.latitude]}
            anchor="center"
            onPress={() => cameraRef.current?.flyTo({
              center: [cluster.longitude, cluster.latitude],
              zoom: Math.min(mapZoom + 2, CLUSTER_MAX_ZOOM),
              pitch: enable3D ? 52 : 0,
              duration: 650,
            })}
          >
            <View style={styles.clusterMarkerRoot}>
              {cluster.tone === 'critical' && (
                <Animated.View
                  pointerEvents="none"
                  style={[
                    styles.clusterMarkerPulse,
                    { opacity: clusterPulseOpacity, transform: [{ scale: clusterPulseScale }] },
                  ]}
                />
              )}
              <View style={[styles.clusterMarker, { backgroundColor: markerToneColor(cluster.tone) }]}>
                <Text style={styles.clusterMarkerText}>{cluster.members.length}</Text>
              </View>
            </View>
          </Marker>
        ) : (
          <PersonnelMarker
            key={cluster.members[0].id}
            member={cluster.members[0]}
            currentPersonnelId={currentPersonnelId}
            emergencyPulse={emergencyPulse}
            followedOfficerId={followedOfficerId}
            onPress={() => onOfficerPress(cluster.members[0].id)}
          />
        ))}
      </MapLibreMap>

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
  markerPhotoWrap: { width: 50, height: 50, alignItems: 'center', justifyContent: 'center' },
  markerCurrentRing: { padding: 2, borderWidth: 2, borderColor: 'transparent', borderRadius: 25 },
  markerCurrentRingVisible: { borderColor: '#FFFFFF' },
  markerFollowedRing: { borderColor: '#2563EB', backgroundColor: 'rgba(37,99,235,0.2)' },
  markerPhoto: { width: 42, height: 42, borderWidth: 3, borderRadius: 21, backgroundColor: '#ffffff' },
  markerPulse: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderWidth: 3,
    borderColor: '#DC2626',
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
  clusterMarker: {
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    borderRadius: 23,
    shadowColor: '#0F172A',
    shadowOpacity: 0.28,
    shadowRadius: 8,
    elevation: 7,
  },
  clusterMarkerRoot: { width: 54, height: 54, alignItems: 'center', justifyContent: 'center' },
  clusterMarkerPulse: {
    position: 'absolute',
    width: 48,
    height: 48,
    borderWidth: 3,
    borderColor: '#DC2626',
    borderRadius: 24,
  },
  clusterMarkerText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
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
