import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Alert,
  Animated,
  Easing,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons as Icon } from '@expo/vector-icons';
import OfficerMapCanvas, {
  type OfficerMapPerson,
} from '../components/OfficerMapCanvas';
import { mobileTheme } from '../constants/mobileTheme';
import { useOperationalContext } from '../context/OperationalContext';
import { useMobileTheme } from '../context/ThemeContext';
import type { LivePersonnel } from '../types/operations';
import { selectCurrentDeployment } from '../features/operations/operationalState';
import { WebMapFrame } from '../components/WebMapFrame';
import {
  createMapPersonnel,
  selectActiveBackupRequest,
  selectEmergencyPersonnelIds,
  selectOperationPersonnelIds,
  selectVisiblePersonnel,
} from '../features/maps/officerMapState';
import { createLeafletMapHtml } from '../features/maps/leafletMapHtml';
import { MapControls, type MapMode } from '../features/maps/MapControls';
import { OfficerDetailSheet } from '../features/maps/OfficerDetailSheet';
import { useMapSelectionController } from '../features/maps/useMapSelectionController';

const webSearchInputReset = Platform.OS === 'web'
  ? ({
      appearance: 'none',
      WebkitAppearance: 'none',
      WebkitTapHighlightColor: 'transparent',
      outline: 'none',
      boxShadow: 'none',
    } as object)
  : undefined;

type OfficerMapScreenProps = {
  headerContentHeight?: number;
  headerTopInset?: number;
  headerVisibility?: Animated.Value;
  onMapInteractionChange?: (isInteracting: boolean) => void;
};

const MAP_INTERACTION_IDLE_DELAY_MS = 520;
const AnimatedSafeAreaView = Animated.createAnimatedComponent(SafeAreaView);

export default function OfficerMapScreen({
  headerContentHeight = 0,
  headerTopInset = 0,
  headerVisibility,
  onMapInteractionChange,
}: OfficerMapScreenProps) {
  const { colors, isDark } = useMobileTheme();
  const {
    deployments,
    personnel,
    tasks,
    acknowledgeDeployment,
    cancelBackupRequest,
    createBackupRequest,
    currentOfficer,
    currentPersonnelId,
    isConnected,
  } = useOperationalContext();
  const emergencyPulse = useRef(new Animated.Value(0)).current;
  const mapControlsProgress = useRef(new Animated.Value(0)).current;
  const mapInteractionIdleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [backupActionPending, setBackupActionPending] = useState(false);
  const [mapControlsExpanded, setMapControlsExpanded] = useState(false);
  const [legendExpanded, setLegendExpanded] = useState(false);
  const [mapMode, setMapMode] = useState<MapMode>('street');
  const [threeDEnabled, setThreeDEnabled] = useState(false);
  const [assignmentAcknowledgementPending, setAssignmentAcknowledgementPending] = useState(false);
  const assignment = selectCurrentDeployment(deployments);
  const canRequestBackup = Boolean(assignment && currentOfficer.isOnDuty !== false);
  const hasCurrentGpsFix = currentOfficer.isLocationStale !== true
    && currentOfficer.isVisibleOnMap !== false;
  const deploymentPromptVisible = Boolean(assignment && !assignment.acknowledged);
  const overlayTranslateY = headerVisibility?.interpolate({
    inputRange: [0, 1],
    outputRange: [-headerContentHeight, 0],
  }) || 0;

  useEffect(() => {
    Animated.timing(mapControlsProgress, {
      toValue: mapControlsExpanded ? 1 : 0,
      duration: mapControlsExpanded ? 230 : 190,
      easing: mapControlsExpanded ? Easing.out(Easing.cubic) : Easing.inOut(Easing.quad),
      useNativeDriver: false,
    }).start();
  }, [mapControlsExpanded, mapControlsProgress]);

  const handleMapInteractionStart = useCallback(() => {
    if (mapInteractionIdleTimer.current) clearTimeout(mapInteractionIdleTimer.current);
    mapInteractionIdleTimer.current = null;
    onMapInteractionChange?.(true);
  }, [onMapInteractionChange]);

  const handleMapInteractionEnd = useCallback(() => {
    if (mapInteractionIdleTimer.current) clearTimeout(mapInteractionIdleTimer.current);
    mapInteractionIdleTimer.current = setTimeout(() => {
      mapInteractionIdleTimer.current = null;
      onMapInteractionChange?.(false);
    }, MAP_INTERACTION_IDLE_DELAY_MS);
  }, [onMapInteractionChange]);

  useFocusEffect(useCallback(() => {
    onMapInteractionChange?.(false);
    return () => {
      if (mapInteractionIdleTimer.current) clearTimeout(mapInteractionIdleTimer.current);
      mapInteractionIdleTimer.current = null;
      onMapInteractionChange?.(false);
    };
  }, [onMapInteractionChange]));

  const visiblePersonnel = useMemo<LivePersonnel[]>(() => (
    selectVisiblePersonnel(personnel, currentPersonnelId, currentOfficer)
  ), [currentOfficer, currentPersonnelId, personnel]);

  const emergencyPersonnelIds = useMemo(() => selectEmergencyPersonnelIds(tasks), [tasks]);

  const operationPersonnelIds = useMemo(() => selectOperationPersonnelIds(tasks), [tasks]);

  const activeOwnBackupRequest = useMemo(
    () => selectActiveBackupRequest(tasks, currentPersonnelId),
    [currentPersonnelId, tasks],
  );

  const mapPersonnel = useMemo<OfficerMapPerson[]>(() => (
    createMapPersonnel(visiblePersonnel, emergencyPersonnelIds, operationPersonnelIds)
  ), [emergencyPersonnelIds, operationPersonnelIds, visiblePersonnel]);

  const currentOfficerHasActiveBackup = emergencyPersonnelIds.has(currentPersonnelId);
  const hasCriticalPersonnel = mapPersonnel.some((member) => member.emergencyActive);
  const {
    activeFollowedOfficerId,
    followedOfficer,
    handleCloseOfficer,
    handleLocateOfficer,
    handleMapLoad,
    handleSearch,
    isFollowingSelectedOfficer,
    nativeMapRef,
    searchFocused,
    searchQuery,
    selectedOfficer,
    setSearchFocused,
    setSearchQuery,
    setSelectedOfficerId,
    stopFollowing: handleStopFollowing,
    webMapRef,
  } = useMapSelectionController({
    assignment,
    mapMode,
    mapPersonnel,
    onMapInteractionEnd: handleMapInteractionEnd,
    onMapInteractionStart: handleMapInteractionStart,
    visiblePersonnel,
  });
  const selectedOfficerHasActiveBackup = selectedOfficer
    ? emergencyPersonnelIds.has(selectedOfficer.id)
    : false;
  const personnelRosterKey = mapPersonnel.map((member) => member.id).join('|');

  useEffect(() => {
    if (!hasCriticalPersonnel) {
      emergencyPulse.stopAnimation();
      emergencyPulse.setValue(0);
      return undefined;
    }

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(emergencyPulse, {
          toValue: 1,
          duration: 750,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(emergencyPulse, {
          toValue: 0,
          duration: 750,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [emergencyPulse, hasCriticalPersonnel]);

  const mapHtml = useMemo(() => createLeafletMapHtml({
    latitude: assignment?.latitude,
    longitude: assignment?.longitude,
    currentPersonnelId,
    isDark,
    mapPersonnel,
  }), [assignment, currentPersonnelId, isDark, personnelRosterKey]);
  const handleConfirmAssignment = async () => {
    if (!assignment || assignmentAcknowledgementPending) return;
    setAssignmentAcknowledgementPending(true);
    try {
      await acknowledgeDeployment(assignment.id);
    } catch (error) {
      Alert.alert('Unable to confirm assignment', (error as Error).message);
    } finally {
      setAssignmentAcknowledgementPending(false);
    }
  };

  const handleBackupRequest = () => {
    if (!canRequestBackup) {
      Alert.alert(
        'Backup unavailable',
        'You can request backup only during an active deployment shift.',
      );
      return;
    }

    Alert.alert(
      'Request backup?',
      `Request up to 3 responders at ${assignment?.patrolArea || currentOfficer.locationName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Request',
          style: 'destructive',
          onPress: async () => {
            setBackupActionPending(true);
            try {
              await createBackupRequest();
              Alert.alert('Backup requested', 'The request is now visible in Tasks.');
            } catch (error) {
              Alert.alert('Request failed', (error as Error).message);
            } finally {
              setBackupActionPending(false);
            }
          },
        },
      ],
    );
  };

  const handleCancelBackupRequest = () => {
    if (!activeOwnBackupRequest) return;

    Alert.alert(
      'Cancel backup request?',
      'The request will close and responders will no longer see it as active.',
      [
        { text: 'Keep Request', style: 'cancel' },
        {
          text: 'Cancel Request',
          style: 'destructive',
          onPress: async () => {
            setBackupActionPending(true);
            try {
              await cancelBackupRequest(activeOwnBackupRequest.id);
              Alert.alert('Backup cancelled', 'The backup request has been closed.');
            } catch (error) {
              Alert.alert('Unable to cancel backup', (error as Error).message);
            } finally {
              setBackupActionPending(false);
            }
          },
        },
      ],
    );
  };

  const emergencyOverlayOpacity = emergencyPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.08, 0.18],
  });
  const profilePulseOpacity = emergencyPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.75, 0],
  });
  const profilePulseScale = emergencyPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.32],
  });

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]} edges={[]}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
      {Platform.OS === 'web' && React.createElement('style', {
        dangerouslySetInnerHTML: {
          __html: `
            input[placeholder="Search officer or location"],
            input[placeholder="Search officer or location"]:focus,
            input[placeholder="Search officer or location"]:focus-visible {
              appearance: none !important;
              -webkit-appearance: none !important;
              -webkit-tap-highlight-color: transparent !important;
              background: transparent !important;
              border: 0 !important;
              box-shadow: none !important;
              outline: 0 !important;
            }
          `,
        },
      })}
      <View style={styles.mapWrap}>
        {Platform.OS === 'web' ? (
          <WebMapFrame ref={webMapRef} html={mapHtml} onLoad={handleMapLoad} />
        ) : (
          <OfficerMapCanvas
            ref={nativeMapRef}
            assignment={assignment}
            currentPersonnelId={currentPersonnelId}
            emergencyPulse={emergencyPulse}
            enable3D={threeDEnabled}
            followedOfficerId={activeFollowedOfficerId}
            isDark={isDark}
            mapMode={mapMode}
            personnel={mapPersonnel}
            onMapInteractionEnd={handleMapInteractionEnd}
            onMapInteractionStart={handleMapInteractionStart}
            onOfficerPress={setSelectedOfficerId}
          />
        )}
      </View>

      {currentOfficerHasActiveBackup && (
        <Animated.View
          nativeID="emergency-overlay"
          testID="emergency-overlay"
          accessibilityLabel="Active backup alert"
          pointerEvents="none"
          style={[styles.emergencyOverlay, { opacity: emergencyOverlayOpacity }]}
        />
      )}

      <AnimatedSafeAreaView
        pointerEvents="box-none"
        style={[
          styles.overlay,
          {
            paddingTop: headerTopInset + headerContentHeight,
            transform: [{ translateY: overlayTranslateY }],
          },
        ]}
        edges={['left', 'right']}
      >
        <View
          style={[
            styles.searchContainer,
            { backgroundColor: colors.surface, borderColor: colors.border },
            searchFocused && { borderColor: colors.purple },
          ]}
        >
          <Icon name="search" size={24} color={colors.textMuted} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={handleSearch}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            placeholder="Search officer or location"
            placeholderTextColor={colors.textMuted}
            returnKeyType="search"
            style={[styles.searchInput, { color: colors.text }, webSearchInputReset]}
          />
          <View style={[styles.connectionDot, !isConnected && styles.connectionDotOffline]} />
        </View>

        <View style={styles.topUtilityRow}>
          {deploymentPromptVisible && (
            <View style={[
              styles.deploymentPill,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}>
              <Icon name="place" size={17} color={colors.blue} />
              <View style={styles.deploymentText}>
                <Text style={[styles.deploymentLabel, { color: colors.textMuted }]}>CURRENT DEPLOYMENT</Text>
                <Text style={[styles.deploymentArea, { color: colors.text }]} numberOfLines={1}>
                  {assignment?.patrolArea || 'No active assignment'}
                </Text>
              </View>
              <Text style={[
                styles.liveText,
                (!isConnected || !hasCurrentGpsFix) && styles.offlineText,
              ]}>
                {!isConnected ? 'OFFLINE' : (hasCurrentGpsFix ? 'LIVE' : 'GPS STALE')}
              </Text>
            </View>
          )}

          <MapControls
            colors={colors}
            expanded={mapControlsExpanded}
            legendExpanded={legendExpanded}
            mapMode={mapMode}
            progress={mapControlsProgress}
            setExpanded={setMapControlsExpanded}
            setLegendExpanded={setLegendExpanded}
            setMapMode={setMapMode}
            setThreeDEnabled={setThreeDEnabled}
            threeDEnabled={threeDEnabled}
          />
        </View>

      </AnimatedSafeAreaView>

      {followedOfficer && !selectedOfficer && (
        <View style={styles.followBanner}>
          <Icon name="near-me" size={17} color="#93c5fd" />
          <Text style={styles.followBannerText} numberOfLines={1}>
            Following <Text style={styles.followBannerName}>{followedOfficer.name}</Text>
          </Text>
          <TouchableOpacity
            accessibilityLabel={`Stop following ${followedOfficer.name}`}
            style={styles.followBannerStop}
            onPress={handleStopFollowing}
          >
            <Text style={styles.followBannerStopText}>Stop</Text>
          </TouchableOpacity>
        </View>
      )}

      {deploymentPromptVisible && !selectedOfficer && (
        <View style={[
          styles.assignmentCard,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}>
          <View style={[styles.assignmentIcon, { backgroundColor: colors.blueSoft }]}>
            <Icon name="place" size={23} color={colors.blue} />
          </View>
          <View style={styles.assignmentBody}>
            <Text style={[styles.assignmentTitle, { color: colors.text }]}>Assigned to {assignment?.patrolArea}</Text>
            <Text style={[styles.assignmentNotes, { color: colors.textMuted }]} numberOfLines={2}>
              {assignment?.notes || 'Maintain visibility within the assigned area.'}
            </Text>
          </View>
          <TouchableOpacity
            accessibilityLabel="Confirm deployment assignment"
            accessibilityState={{ disabled: assignmentAcknowledgementPending }}
            style={[
              styles.assignmentConfirmButton,
              assignmentAcknowledgementPending && styles.assignmentConfirmButtonPending,
            ]}
            onPress={handleConfirmAssignment}
            disabled={assignmentAcknowledgementPending}
          >
            <Icon name="check" size={22} color="#ffffff" />
          </TouchableOpacity>
        </View>
      )}

      {!selectedOfficer && (
        <TouchableOpacity
          accessibilityLabel={activeOwnBackupRequest ? 'Cancel backup request' : 'Request backup'}
          accessibilityState={{ disabled: backupActionPending }}
          style={[
            styles.backupButton,
            activeOwnBackupRequest && styles.backupButtonActive,
            backupActionPending && styles.backupButtonPending,
          ]}
          onPress={activeOwnBackupRequest ? handleCancelBackupRequest : handleBackupRequest}
          disabled={backupActionPending}
        >
          <Icon name={activeOwnBackupRequest ? 'close' : 'campaign'} size={24} color="#ffffff" />
        </TouchableOpacity>
      )}

      {selectedOfficer && (
        <OfficerDetailSheet
          currentPersonnelId={currentPersonnelId}
          emergencyActive={selectedOfficerHasActiveBackup}
          isFollowing={isFollowingSelectedOfficer}
          officer={selectedOfficer}
          onClose={handleCloseOfficer}
          onLocate={handleLocateOfficer}
          pulseOpacity={profilePulseOpacity}
          pulseScale={profilePulseScale}
        />
      )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#ffffff' },
  container: { flex: 1, backgroundColor: '#e2e8f0' },
  mapWrap: { ...StyleSheet.absoluteFill },
  map: { flex: 1, backgroundColor: '#e2e5e8' },
  emergencyOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#ef233c',
  },
  overlay: { ...StyleSheet.absoluteFill, paddingHorizontal: 20 },
  searchContainer: {
    height: 45,
    marginTop: 5,
    paddingHorizontal: 17,
    flexDirection: 'row',
    alignItems: 'center',
    borderColor: 'transparent',
    borderRadius: 15,
    backgroundColor: mobileTheme.surface,
    shadowColor: '#172554',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.2,
    shadowRadius: 9,
    elevation: 7,
  },
  searchContainerFocused: {
    borderColor: mobileTheme.purple,
  },
  searchInput: {
    flex: 1,
    height: 50,
    marginLeft: 10,
    borderWidth: 0,
    borderColor: 'transparent',
    color: mobileTheme.text,
    fontSize: 14,
    outlineWidth: 0,
    outlineColor: 'transparent',
  },
  connectionDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#2563eb' },
  connectionDotOffline: { backgroundColor: mobileTheme.danger },
  topUtilityRow: {
    minHeight: 44,
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'flex-start',
    gap: 8,
  },
  deploymentPill: {
    flex: 1,
    minHeight: 44,
    paddingHorizontal: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderWidth: 1,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.96)',
    shadowColor: '#172554',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 8,
    elevation: 5,
  },
  deploymentText: { flex: 1 },
  deploymentLabel: { color: mobileTheme.textMuted, fontSize: 9, fontWeight: '800' },
  deploymentArea: { marginTop: 2, color: mobileTheme.text, fontSize: 13, fontWeight: '800' },
  liveText: { color: mobileTheme.success, fontSize: 10, fontWeight: '800' },
  offlineText: { color: mobileTheme.danger },
  followBanner: {
    position: 'absolute',
    top: 142,
    left: 20,
    right: 78,
    minHeight: 42,
    paddingLeft: 12,
    paddingRight: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderWidth: 1,
    borderColor: 'rgba(147,197,253,0.45)',
    borderRadius: 21,
    backgroundColor: 'rgba(7,19,38,0.92)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 10,
  },
  followBannerText: { flex: 1, color: '#cbd5e1', fontSize: 12, fontWeight: '700' },
  followBannerName: { color: '#ffffff', fontWeight: '900' },
  followBannerStop: {
    minHeight: 32,
    paddingHorizontal: 13,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: mobileTheme.purple,
  },
  followBannerStopText: { color: '#ffffff', fontSize: 11, fontWeight: '900' },
  assignmentCard: {
    position: 'absolute',
    right: 20,
    bottom: 174,
    left: 20,
    minHeight: 78,
    padding: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 16,
    backgroundColor: mobileTheme.surface,
    shadowColor: '#172554',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.16,
    shadowRadius: 9,
    elevation: 7,
  },
  assignmentIcon: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: mobileTheme.purpleSoft,
  },
  assignmentBody: { flex: 1 },
  assignmentTitle: { color: mobileTheme.text, fontSize: 13, fontWeight: '800' },
  assignmentNotes: { marginTop: 4, color: mobileTheme.textMuted, fontSize: 11, lineHeight: 16 },
  assignmentConfirmButton: {
    width: 42,
    height: 42,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 21,
    backgroundColor: mobileTheme.success,
  },
  assignmentConfirmButtonPending: { opacity: 0.55 },
  backupButton: {
    position: 'absolute',
    right: 30,
    bottom: 108,
    width: 54,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#2a3a56',
    borderRadius: 27,
    backgroundColor: '#0b1528',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 7,
  },
  backupButtonActive: {
    borderColor: '#ef4444',
    backgroundColor: mobileTheme.danger,
  },
  backupButtonPending: { opacity: 0.6 },
});
