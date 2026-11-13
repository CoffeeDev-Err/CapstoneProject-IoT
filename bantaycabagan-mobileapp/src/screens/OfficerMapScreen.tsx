import { requestErrorMessage } from '../utils/requestFeedback';
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
  AppState,
  Easing,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons as Icon } from '@expo/vector-icons';
import OfficerMapCanvas, {
  type OfficerMapPerson,
} from '../components/OfficerMapCanvas';
import { mobileTheme } from '../constants/mobileTheme';
import { useOperationalContext } from '../context/OperationalContext';
import { useMobileTheme } from '../context/ThemeContext';
import type { LivePersonnel } from '../types/operations';
import { useCurrentDeployment } from '../features/maps/useCurrentDeployment';
import { usePatrolSchedule } from '../features/maps/usePatrolSchedule';
import { useAuth } from '../context/AuthContext';
import { WebMapFrame } from '../components/WebMapFrame';
import {
  createMapPersonnel,
  selectActiveBackupRequest,
  selectEmergencyPersonnelIds,
  selectOperationPersonnelIds,
  selectVisiblePersonnel,
  isSamePersonnelId,
} from '../features/maps/officerMapState';
import { createLeafletMapHtml } from '../features/maps/leafletMapHtml';
import { resolveDeploymentMapTarget } from '../features/maps/deploymentMapTarget';
import {
  getMapTopControlPosition,
  MapControls,
  MapLegendControl,
  type MapMode,
} from '../features/maps/MapControls';
import { OfficerDetailSheet } from '../features/maps/OfficerDetailSheet';
import { DeploymentDetailSheet } from '../features/maps/DeploymentDetailSheet';
import { useDeploymentPresentation } from '../features/maps/useDeploymentPresentation';

const BACKUP_EMERGENCY_OVERLAY_MS = 2 * 60 * 1000;
import { GpsReadingAge } from '../features/maps/GpsReadingAge';
import { useMapSelectionController } from '../features/maps/useMapSelectionController';
import { useDevelopmentMapPersonnel } from '../features/maps/useDevelopmentMapPersonnel';
import { MapPreviewToggle } from '../features/maps/MapPreviewToggle';
import { GpsTrackingReminder } from '../features/maps/GpsTrackingReminder';

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
  deploymentNotificationId?: string;
  deploymentNotificationRequestId?: number;
  headerContentHeight?: number;
  headerTopInset?: number;
  headerVisibility?: Animated.Value;
  onMapInteractionChange?: (isInteracting: boolean) => void;
};

const MAP_INTERACTION_IDLE_DELAY_MS = 520;
const AnimatedSafeAreaView = Animated.createAnimatedComponent(SafeAreaView);

export default function OfficerMapScreen({
  deploymentNotificationId,
  deploymentNotificationRequestId,
  headerContentHeight = 0,
  headerTopInset = 0,
  headerVisibility,
  onMapInteractionChange,
}: OfficerMapScreenProps) {
  const { colors, isDark } = useMobileTheme();
  const isFocused = useIsFocused();
  const preview = useDevelopmentMapPersonnel(isFocused);
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
    refreshOperations,
  } = useOperationalContext();
  const emergencyPulse = useRef(new Animated.Value(0)).current;
  const mapControlsProgress = useRef(new Animated.Value(0)).current;
  const mapInteractionIdleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSelfFocus = useRef(false);
  const [backupActionPending, setBackupActionPending] = useState(false);
  const [backupRequestModalVisible, setBackupRequestModalVisible] = useState(false);
  const [requiredRespondersText, setRequiredRespondersText] = useState('3');
  const [showOwnEmergencyOverlay, setShowOwnEmergencyOverlay] = useState(false);
  const [headerVisibilityValue, setHeaderVisibilityValue] = useState(1);
  const [mapControlsExpanded, setMapControlsExpanded] = useState(false);
  const [legendExpanded, setLegendExpanded] = useState(false);
  const [mapMode, setMapMode] = useState<MapMode>('street');
  const [threeDEnabled, setThreeDEnabled] = useState(false);
  const [assignmentAcknowledgementPending, setAssignmentAcknowledgementPending] = useState(false);
  const { assignment: baseAssignment, refreshClock } = useCurrentDeployment(deployments, currentPersonnelId);
  const { token } = useAuth();
  const patrol = usePatrolSchedule(baseAssignment, currentOfficer, token);
  const { assignment, mapAssignment } = patrol;
  const deploymentStyleLabel = assignment?.deploymentType === 'point'
    ? `Fixed post${assignment.deploymentPointLabel ? ` · ${assignment.deploymentPointLabel}` : ''}`
    : assignment?.deploymentType === 'route'
      ? `Route patrol${assignment.patrolMode ? ` · ${{ walk: 'Walk', car: 'Car', motorcycle: 'Motorcycle' }[assignment.patrolMode]}` : ''}` : 'Area patrol';
  const canRequestBackup = Boolean(assignment);
  const deploymentPromptVisible = Boolean(assignment && !assignment.acknowledged);
  const overlayTranslateY = headerVisibility?.interpolate({
    inputRange: [0, 1],
    outputRange: [-headerContentHeight, 0],
  }) || 0;
  const compassTop = getMapTopControlPosition(
    headerTopInset,
    headerContentHeight,
    headerVisibilityValue,
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void refreshOperations();
      }
    });
    return () => subscription.remove();
  }, [refreshOperations]);

  useEffect(() => {
    if (!headerVisibility) {
      setHeaderVisibilityValue(1);
      return undefined;
    }

    const listenerId = headerVisibility.addListener(({ value }) => {
      setHeaderVisibilityValue((current) => (
        Math.abs(current - value) < 0.01 ? current : value
      ));
    });

    return () => headerVisibility.removeListener(listenerId);
  }, [headerVisibility]);

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
    refreshClock();
    onMapInteractionChange?.(false);
    void refreshOperations();
    return () => {
      if (mapInteractionIdleTimer.current) clearTimeout(mapInteractionIdleTimer.current);
      mapInteractionIdleTimer.current = null;
      onMapInteractionChange?.(false);
    };
  }, [onMapInteractionChange, refreshClock, refreshOperations]));

  const visiblePersonnel = useMemo<LivePersonnel[]>(() => (
    assignment ? selectVisiblePersonnel(personnel, currentPersonnelId, currentOfficer) : []
  ), [assignment, currentOfficer, currentPersonnelId, personnel]);

  const emergencyPersonnelIds = useMemo(() => selectEmergencyPersonnelIds(tasks), [tasks]);

  const operationPersonnelIds = useMemo(() => selectOperationPersonnelIds(tasks), [tasks]);

  const activeOwnBackupRequest = useMemo(
    () => selectActiveBackupRequest(tasks, currentPersonnelId),
    [currentPersonnelId, tasks],
  );
  useEffect(() => {
    if (!activeOwnBackupRequest) {
      setShowOwnEmergencyOverlay(false);
      return undefined;
    }
    const parsedCreatedAt = new Date(activeOwnBackupRequest.created_at).getTime();
    const createdAt = Number.isFinite(parsedCreatedAt) ? parsedCreatedAt : Date.now();
    const remainingMs = Math.max(0, createdAt + BACKUP_EMERGENCY_OVERLAY_MS - Date.now());
    setShowOwnEmergencyOverlay(remainingMs > 0);
    if (remainingMs <= 0) return undefined;
    const timer = setTimeout(() => setShowOwnEmergencyOverlay(false), remainingMs);
    return () => clearTimeout(timer);
  }, [activeOwnBackupRequest]);

  const mapPersonnel = useMemo<OfficerMapPerson[]>(() => (
    [...createMapPersonnel(visiblePersonnel, emergencyPersonnelIds, operationPersonnelIds), ...preview.personnel]
  ), [emergencyPersonnelIds, operationPersonnelIds, visiblePersonnel, preview.personnel]);
  const selectablePersonnel = useMemo(() => [...visiblePersonnel, ...preview.personnel], [visiblePersonnel, preview.personnel]);
  const backupZones = useMemo(() => tasks
    .filter((task) => task.type === 'backup' && (task.status === 'open' || task.status === 'full'))
    .map((task) => {
      const requester = personnel.find((member) => isSamePersonnelId(member.id, task.requested_by))
        || (isSamePersonnelId(currentOfficer.id, task.requested_by) ? currentOfficer : undefined);
      if (!requester
        || !Number.isFinite(requester.latitude)
        || !Number.isFinite(requester.longitude)) return null;
      return {
        id: task.id,
        latitude: Number(requester.latitude),
        longitude: Number(requester.longitude),
        showArrivalRadius: Boolean(task.responders?.some((responder) => responder.arrived_at)),
      };
    })
    .filter((zone): zone is NonNullable<typeof zone> => Boolean(zone)), [currentOfficer, personnel, tasks]);

  const currentOfficerHasActiveBackup = emergencyPersonnelIds.has(currentPersonnelId);
  const hasCriticalPersonnel = mapPersonnel.some((member) => member.emergencyActive);
  const {
    activeFollowedOfficerId,
    followedOfficer,
    focusCurrentOfficer,
    focusDeployment,
    handleCloseOfficer,
    handleLocateOfficer,
    handleMapLoad: handleBaseMapLoad,
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
    assignment: mapAssignment,
    currentPersonnelId,
    mapMode,
    mapPersonnel,
    onMapInteractionEnd: handleMapInteractionEnd,
    onMapInteractionStart: handleMapInteractionStart,
    visiblePersonnel: selectablePersonnel,
  });

  const { detailsOpen: deploymentDetailsOpen, setDetailsOpen: setDeploymentDetailsOpen } = useDeploymentPresentation({
    assignment,
    notificationId: deploymentNotificationId,
    notificationRequestId: deploymentNotificationRequestId,
    closeOfficer: handleCloseOfficer,
    refreshOperations,
  });
  const handleMapLoad = useCallback(() => {
    handleBaseMapLoad();
    webMapRef.current?.contentWindow?.postMessage({ source: 'bantay-map-command', command: { type: 'patrol-coverage', features: patrol.features } }, '*');
    if (!pendingSelfFocus.current) return;
    pendingSelfFocus.current = false;
    setTimeout(() => focusCurrentOfficer(), 120);
  }, [focusCurrentOfficer, handleBaseMapLoad, webMapRef, patrol.features]);
  const handleOfficerMarkerPress = useCallback((officerId: string) => {
    setDeploymentDetailsOpen(false);
    setSelectedOfficerId(officerId);
  }, [setSelectedOfficerId]);
  useEffect(() => {
    if (preview.enabled) nativeMapRef.current?.fitPersonnel();
  }, [preview.enabled, nativeMapRef]);
  const selectedOfficerHasActiveBackup = selectedOfficer
    ? mapPersonnel.some((member) => member.id === selectedOfficer.id && member.emergencyActive)
    : false;
  const personnelRosterKey = mapPersonnel.map((member) => member.id).join('|');
  const deploymentTarget = useMemo(() => resolveDeploymentMapTarget(mapAssignment), [mapAssignment]);
  useEffect(() => {
    if (Platform.OS === 'web') webMapRef.current?.contentWindow?.postMessage({ source: 'bantay-map-command',
      command: { type: 'patrol-coverage', features: patrol.features } }, '*');
  }, [patrol.features, webMapRef]);
  const coverageSelectionKey = baseAssignment ? `${baseAssignment.id}:${patrol.index}:${patrol.previewIndex ?? 'current'}` : '';
  const previousCoverageSelection = useRef(coverageSelectionKey);
  useEffect(() => {
    if (previousCoverageSelection.current === coverageSelectionKey) return;
    previousCoverageSelection.current = coverageSelectionKey;
    if (!coverageSelectionKey) return;
    const timer = setTimeout(focusDeployment, 160);
    return () => clearTimeout(timer);
  }, [coverageSelectionKey, focusDeployment]);
  const canLocateCurrentOfficer = visiblePersonnel.some((member) => (
    isSamePersonnelId(member.id, currentPersonnelId)
    && member.isVisibleOnMap !== false
    && Number.isFinite(member.latitude)
    && Number.isFinite(member.longitude)
  ));
  const isFollowingCurrentOfficer = Boolean(
    followedOfficer && isSamePersonnelId(followedOfficer.id, currentPersonnelId),
  );

  useEffect(() => {
    if (selectedOfficer) setLegendExpanded(false);
  }, [selectedOfficer]);

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
    latitude: deploymentTarget.latitude,
    longitude: deploymentTarget.longitude,
    deploymentPointLabel: mapAssignment?.deploymentPointLabel,
    deploymentType: mapAssignment?.deploymentType,
    hasDeploymentPoint: deploymentTarget.hasExactPoint,
    deploymentFocusZoom: deploymentTarget.zoom,
    currentPersonnelId,
    isDark,
    mapPersonnel,
    backupZones,
    patrolCoverage: patrol.features,
  }), [mapAssignment, backupZones, currentPersonnelId, deploymentTarget, isDark, personnelRosterKey]);
  const handleConfirmAssignment = async () => {
    if (!assignment || assignmentAcknowledgementPending) return;
    setAssignmentAcknowledgementPending(true);
    try {
      await acknowledgeDeployment(assignment.id);
      setDeploymentDetailsOpen(false);
      pendingSelfFocus.current = Platform.OS === 'web';
      setTimeout(() => focusCurrentOfficer(), 80);
    } catch (error) {
      Alert.alert('Unable to confirm assignment', requestErrorMessage(error, { action: 'confirm your deployment', write: true }));
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

    setRequiredRespondersText('3');
    setBackupRequestModalVisible(true);
  };

  const submitBackupRequest = async () => {
    const requiredResponders = Number(requiredRespondersText);
    if (!Number.isInteger(requiredResponders) || requiredResponders < 1) {
      Alert.alert('Enter a valid number', 'The number of responders must be a positive whole number.');
      return;
    }
    setBackupActionPending(true);
    try {
      await createBackupRequest(requiredResponders);
      setBackupRequestModalVisible(false);
      Alert.alert('Backup requested', `The request is open for ${requiredResponders} responder${requiredResponders === 1 ? '' : 's'}.`);
    } catch (error) {
      Alert.alert('Backup request needs attention', requestErrorMessage(error, { action: 'request backup', write: true }));
    } finally {
      setBackupActionPending(false);
    }
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
              Alert.alert('Unable to cancel backup', requestErrorMessage(error, { action: 'cancel the backup request', write: true }));
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
            assignment={mapAssignment}
            patrolCoverage={patrol.features}
            backupZones={backupZones}
            compassTop={compassTop}
            currentPersonnelId={currentPersonnelId}
            emergencyPulse={emergencyPulse}
            enable3D={threeDEnabled}
            followedOfficerId={activeFollowedOfficerId}
            isDark={isDark}
            mapMode={mapMode}
            personnel={mapPersonnel}
            onMapInteractionEnd={handleMapInteractionEnd}
            onMapInteractionStart={handleMapInteractionStart}
            onOfficerPress={handleOfficerMarkerPress}
          />
        )}
      </View>

      <Modal
        animationType="fade"
        transparent
        visible={backupRequestModalVisible}
        onRequestClose={() => !backupActionPending && setBackupRequestModalVisible(false)}
      >
        <View style={styles.backupModalBackdrop}>
          <View style={[styles.backupModalCard, { backgroundColor: colors.surface }]}>
            <View style={styles.backupModalHeader}>
              <View style={[styles.backupModalIcon, { backgroundColor: colors.dangerSoft }]}>
                <Icon name="campaign" size={24} color={colors.danger} />
              </View>
              <View style={styles.backupModalHeading}>
                <Text style={[styles.backupModalTitle, { color: colors.text }]}>Request backup</Text>
                <Text style={[styles.backupModalSubtitle, { color: colors.textMuted }]}>
                  Choose how many responders are needed.
                </Text>
              </View>
            </View>
            <Text style={[styles.backupModalLabel, { color: colors.textMuted }]}>RESPONDERS NEEDED</Text>
            <View style={styles.responderSelector}>
              <TouchableOpacity
                accessibilityLabel="Decrease responders"
                disabled={backupActionPending || Number(requiredRespondersText) <= 1}
                style={[styles.responderStepButton, { backgroundColor: colors.surfaceMuted }]}
                onPress={() => setRequiredRespondersText(String(Math.max(1, (Number(requiredRespondersText) || 1) - 1)))}
              >
                <Icon name="remove" size={24} color={colors.text} />
              </TouchableOpacity>
              <TextInput
                accessibilityLabel="Number of responders needed"
                editable={!backupActionPending}
                keyboardType="number-pad"
                selectTextOnFocus
                value={requiredRespondersText}
                onChangeText={(value) => setRequiredRespondersText(value.replace(/[^0-9]/g, ''))}
                style={[styles.responderNumberInput, { color: colors.text, borderColor: colors.border }]}
              />
              <TouchableOpacity
                accessibilityLabel="Increase responders"
                disabled={backupActionPending}
                style={[styles.responderStepButton, { backgroundColor: colors.surfaceMuted }]}
                onPress={() => setRequiredRespondersText(String((Number(requiredRespondersText) || 0) + 1))}
              >
                <Icon name="add" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.backupModalHint, { color: colors.textMuted }]}>Nearby on-duty officers within 1 km will be notified first.</Text>
            <View style={styles.backupModalActions}>
              <TouchableOpacity
                disabled={backupActionPending}
                style={[styles.backupModalAction, { backgroundColor: colors.surfaceMuted }]}
                onPress={() => setBackupRequestModalVisible(false)}
              >
                <Text style={[styles.backupModalActionText, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                disabled={backupActionPending}
                style={[styles.backupModalAction, { backgroundColor: colors.danger }]}
                onPress={() => void submitBackupRequest()}
              >
                <Text style={[styles.backupModalActionText, { color: '#ffffff' }]}>{backupActionPending ? 'Requesting...' : 'Send Request'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {currentOfficerHasActiveBackup && showOwnEmergencyOverlay && (
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

        {preview.enabled && (
          <View style={styles.previewNotice}>
            <Text style={styles.previewNoticeText}>TEST MODE · {preview.personnel.length} simulated markers</Text>
          </View>
        )}

        <View style={styles.topUtilityRow} pointerEvents="box-none">
          <View style={styles.mapStatusStack} pointerEvents="box-none">
            <GpsTrackingReminder
              assignment={assignment}
              isConnected={isConnected}
              officer={currentOfficer}
              onRefresh={refreshOperations}
            />
            {followedOfficer && !isFollowingCurrentOfficer && !selectedOfficer && (
              <View style={styles.followBanner}>
                <Icon name="near-me" size={17} color="#93c5fd" />
                <View style={styles.followBannerContent}>
                  <Text style={styles.followBannerText} numberOfLines={1}>
                    Following <Text style={styles.followBannerName}>{followedOfficer.name}</Text>
                  </Text>
                  <GpsReadingAge recordedAt={followedOfficer.locationRecordedAt} />
                </View>
                <TouchableOpacity
                  accessibilityLabel={`Stop following ${followedOfficer.name}`}
                  style={styles.followBannerStop}
                  onPress={handleStopFollowing}
                >
                  <Text style={styles.followBannerStopText}>Stop</Text>
                </TouchableOpacity>
              </View>
            )}
            {assignment && (!followedOfficer || isFollowingCurrentOfficer) && !selectedOfficer && (
              <TouchableOpacity
                accessibilityLabel={`View current deployment details for ${assignment.patrolArea}`}
                activeOpacity={0.82}
                onPress={() => setDeploymentDetailsOpen(true)}
                style={[
                styles.deploymentPill,
                { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
              >
                <View style={[styles.deploymentIcon, { backgroundColor: colors.blueSoft }]}>
                  <Icon name="location-on" size={18} color={colors.blue} />
                </View>
                <View style={styles.deploymentText}>
                  <Text style={[styles.deploymentLabel, { color: colors.textMuted }]}>CURRENT DEPLOYMENT</Text>
                  <Text style={[styles.deploymentArea, { color: colors.text }]} numberOfLines={1}>
                    {assignment?.patrolArea || 'No active assignment'}
                  </Text>
                  <Text style={[styles.deploymentType, { color: colors.blue }]} numberOfLines={1}>
                    {deploymentStyleLabel}
                  </Text>
                </View>
                <Icon name="chevron-right" size={19} color={colors.textMuted} />
              </TouchableOpacity>
            )}
            {!!baseAssignment?.scheduleBlocks?.length && !selectedOfficer && <View style={{ gap: 5, alignSelf: 'flex-start', maxWidth: '100%', padding: 7, borderRadius: 10, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }}>
              <Text style={{ color: colors.textMuted, fontSize: 11 }}>My patrol schedule · {patrol.previewBlock ? 'Preview' : 'Current coverage'}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                {baseAssignment.scheduleBlocks.map((block, index) => {
                  const selected = (patrol.previewIndex ?? patrol.index) === index;
                  return <TouchableOpacity key={`${index}-${block.label}`} accessibilityRole="button"
                    accessibilityLabel={`View my ${baseAssignment.deploymentType === 'route' ? 'route' : 'area'} ${index + 1}: ${block.label}`}
                    accessibilityState={{ selected }} onPress={() => { void patrol.viewBlock(index); }}
                    style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: selected ? colors.blue : colors.surface, borderColor: selected ? colors.blue : colors.border, borderWidth: 1 }}>
                    <Text style={{ fontWeight: '700', color: selected ? '#fff' : colors.text }}>{index + 1}</Text>
                  </TouchableOpacity>;
                })}
              </ScrollView>
            </View>}
          </View>

          <View style={styles.mapControlStack}>
            <MapControls
              colors={colors}
              expanded={mapControlsExpanded}
              mapMode={mapMode}
              progress={mapControlsProgress}
              setExpanded={setMapControlsExpanded}
              setMapMode={setMapMode}
              setThreeDEnabled={setThreeDEnabled}
              threeDEnabled={threeDEnabled}
            />
            {!selectedOfficer && (
              <MapLegendControl
                colors={colors}
                expanded={legendExpanded}
                setExpanded={setLegendExpanded}
              />
            )}
            <TouchableOpacity
              accessibilityLabel={canLocateCurrentOfficer
                ? 'Locate my current position'
                : 'Waiting for a fresh GPS fix'}
              accessibilityState={{
                disabled: !canLocateCurrentOfficer,
                selected: isFollowingCurrentOfficer,
              }}
              activeOpacity={0.8}
              disabled={!canLocateCurrentOfficer}
              onPress={focusCurrentOfficer}
              style={[
                styles.locateMeButton,
                { backgroundColor: colors.surface, borderColor: colors.border },
                isFollowingCurrentOfficer && { backgroundColor: colors.blueSoft, borderColor: colors.blue },
                !canLocateCurrentOfficer && styles.locateMeButtonDisabled,
              ]}
            >
              <Icon
                name={canLocateCurrentOfficer ? 'my-location' : 'location-disabled'}
                size={22}
                color={canLocateCurrentOfficer ? colors.blue : colors.textMuted}
              />
            </TouchableOpacity>
            {preview.available && <MapPreviewToggle enabled={preview.enabled} onPress={() => {
              handleCloseOfficer();
              handleStopFollowing();
              preview.toggle();
            }} />}
          </View>
        </View>

      </AnimatedSafeAreaView>

      {deploymentPromptVisible && !selectedOfficer && !deploymentDetailsOpen && (
        <View style={[
          styles.assignmentCard,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}>
          <View style={[styles.assignmentIcon, { backgroundColor: colors.blueSoft }]}>
            <Icon name="place" size={23} color={colors.blue} />
          </View>
          <View style={styles.assignmentBody}>
            <Text style={[styles.assignmentTitle, { color: colors.text }]}>Assigned to {assignment?.patrolArea}</Text>
            <Text style={[styles.assignmentNotes, { color: colors.blue }]} numberOfLines={1}>
              {deploymentStyleLabel}
            </Text>
            <Text style={[styles.assignmentNotes, { color: colors.textMuted }]} numberOfLines={2}>
              {assignment?.notes || 'Maintain visibility within the assigned area.'}
            </Text>
          </View>
          <TouchableOpacity
            accessibilityLabel="Start deployment"
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

      {!selectedOfficer && !deploymentDetailsOpen && (
        <TouchableOpacity
          accessibilityLabel={activeOwnBackupRequest ? 'Cancel backup request' : 'Request backup'}
          accessibilityState={{
            busy: backupActionPending,
            disabled: backupActionPending,
            selected: Boolean(activeOwnBackupRequest),
          }}
          style={[
            styles.backupButton,
            { backgroundColor: colors.surface, borderColor: colors.border },
            activeOwnBackupRequest && { backgroundColor: colors.danger, borderColor: colors.danger },
            backupActionPending && !activeOwnBackupRequest && {
              backgroundColor: colors.warningSoft,
              borderColor: colors.warning,
            },
            backupActionPending && styles.backupButtonPending,
          ]}
          onPress={activeOwnBackupRequest ? handleCancelBackupRequest : handleBackupRequest}
          disabled={backupActionPending}
        >
          <Icon
            name={activeOwnBackupRequest ? 'close' : 'campaign'}
            size={24}
            color={activeOwnBackupRequest
              ? '#ffffff'
              : (backupActionPending ? colors.warning : colors.text)}
          />
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
      {assignment && deploymentDetailsOpen && !selectedOfficer && (
        <DeploymentDetailSheet
          assignment={assignment}
          currentBlock={patrol.block}
          nextBlock={patrol.next}
          minutesLeft={patrol.minutesLeft}
          guidance={patrol.guidance}
          onViewNext={() => { void patrol.viewNext(); setDeploymentDetailsOpen(false); }}
          onViewBlock={index => { void patrol.viewBlock(index); setDeploymentDetailsOpen(false); }}
          currentIndex={patrol.index}
          onClose={() => setDeploymentDetailsOpen(false)}
          onViewMap={focusDeployment}
        />
      )}
      {patrol.previewNext && !selectedOfficer && !deploymentDetailsOpen && <View style={{ position: 'absolute', bottom: 100, left: 16, right: 16, padding: 14, gap: 8, borderRadius: 12, backgroundColor: colors.surface }}>
        <Text style={{ color: colors.text, fontWeight: '700' }}>Preview {Number(patrol.previewIndex) + 1}: {patrol.previewBlock?.label}</Text>
        <Text style={{ color: colors.textMuted }}>{patrol.guidance}</Text>
        <TouchableOpacity accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center' }} onPress={() => { if (patrol.previewIndex !== null) void patrol.viewBlock(patrol.previewIndex); }}><Text style={{ color: colors.blue }}>Refresh directions</Text></TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center' }} onPress={patrol.closePreview}><Text style={{ color: colors.blue }}>Back to current coverage</Text></TouchableOpacity>
      </View>}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  previewNotice: { alignSelf: 'flex-start', marginTop: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: '#fef3c7' },
  previewNoticeText: { color: '#78350f', fontSize: 11, fontWeight: '800' },
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
    marginTop: 12,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'flex-start',
    gap: 12,
  },
  mapStatusStack: { flex: 1, minWidth: 0, gap: 8 },
  mapControlStack: {
    width: 46,
    alignItems: 'flex-end',
    gap: 8,
  },
  deploymentPill: {
    height: 46,
    paddingHorizontal: 8,
    paddingVertical: 3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.96)',
    shadowColor: '#172554',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 8,
    elevation: 5,
  },
  locateMeButton: {
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 14,
    shadowColor: '#172554',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 7,
    elevation: 6,
  },
  locateMeButtonDisabled: { opacity: 0.52 },
  deploymentIcon: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  deploymentText: { flex: 1 },
  deploymentLabel: { color: mobileTheme.textMuted, fontSize: 8, lineHeight: 9, fontWeight: '800' },
  deploymentArea: { color: mobileTheme.text, fontSize: 11, lineHeight: 13, fontWeight: '800' },
  deploymentType: { color: mobileTheme.blue, fontSize: 8, lineHeight: 9, fontWeight: '800' },
  gpsStatusBadge: { alignSelf: 'flex-start', paddingHorizontal: 7, paddingVertical: 4, borderRadius: 7 },
  gpsStatusText: { fontSize: 9, fontWeight: '800' },
  followBanner: {
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
  followBannerContent: { flex: 1, paddingVertical: 5 },
  followBannerText: { color: '#cbd5e1', fontSize: 12, fontWeight: '700' },
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
    borderRadius: 27,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 7,
    zIndex: 11,
  },
  backupButtonPending: { opacity: 0.72 },
  backupModalBackdrop: {
    flex: 1,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(2, 6, 23, 0.62)',
  },
  backupModalCard: {
    width: '100%',
    maxWidth: 390,
    padding: 20,
    borderRadius: 22,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.28,
    shadowRadius: 22,
    elevation: 14,
  },
  backupModalHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  backupModalIcon: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 23 },
  backupModalHeading: { flex: 1 },
  backupModalTitle: { fontSize: 19, fontWeight: '900' },
  backupModalSubtitle: { marginTop: 3, fontSize: 12, lineHeight: 17 },
  backupModalLabel: { marginTop: 22, fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  responderSelector: { marginTop: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  responderStepButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 16 },
  responderNumberInput: { width: 92, height: 52, borderWidth: 1, borderRadius: 16, fontSize: 22, fontWeight: '900', textAlign: 'center' },
  backupModalHint: { marginTop: 14, fontSize: 11, lineHeight: 16, textAlign: 'center' },
  backupModalActions: { marginTop: 20, flexDirection: 'row', gap: 10 },
  backupModalAction: { minHeight: 46, flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 14 },
  backupModalActionText: { fontSize: 13, fontWeight: '900' },
});
