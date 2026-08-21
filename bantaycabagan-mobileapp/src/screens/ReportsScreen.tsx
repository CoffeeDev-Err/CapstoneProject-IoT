import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import * as ImagePicker from 'expo-image-picker';
import { Image as CachedImage } from 'expo-image';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  type StyleProp,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons as Icon } from '@expo/vector-icons';
import Animated, {
  FadeIn,
  FadeOut,
} from 'react-native-reanimated';
import { ReportLocationPickerModal } from '../components/ReportLocationPickerModal';
import {
  SheetScrollView,
  SwipeDismissSheet,
} from '../components/SwipeDismissSheet';
import {
  CABAGAN_BARANGAYS,
  findCabaganBarangay,
  isCabaganBarangay,
} from '../constants/cabaganBarangays';
import { mobileTheme } from '../constants/mobileTheme';
import { useOperationalContext } from '../context/OperationalContext';
import { useMobileTheme } from '../context/ThemeContext';
import { resolveApiAssetUrl } from '../services/operationsApi';
import { discardTemporaryEvidence } from '../services/offlineReportQueue';
import type {
  PoliceReport,
  ReportEvidenceInput,
  SubmitReportInput,
} from '../types/operations';

const reportTypes = ['incident', 'patrol', 'checkpoint', 'others'];
const reportFilters = ['all', 'incident', 'routine'] as const;
const SUBMIT_MODAL_TOP_OFFSET = 1;
const CARD_CONTENT_ENTER = FadeIn.duration(170);
const CARD_CONTENT_EXIT = FadeOut.duration(130);

type ReportForm = SubmitReportInput & {
  occurred_at: string;
  assigned_area: string;
  location_source: 'gps' | 'manual';
};

type SheetClose = (afterClose?: () => void) => void;

const emptyForm: ReportForm = {
  report_type: 'incident',
  title: '',
  description: '',
  location: '',
  barangay: '',
  severity: 2,
  occurred_at: '',
  assigned_area: '',
  location_source: 'manual',
  latitude: undefined as number | undefined,
  longitude: undefined as number | undefined,
};

const getBarangayFromArea = (area?: string) => {
  const value = (area || '').trim();
  if (!value) return '';
  const exactMatch = findCabaganBarangay(value);
  if (exactMatch) return exactMatch;

  const normalized = value
    .replace(/^barangay\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  return CABAGAN_BARANGAYS.find((barangay) => {
    const candidate = barangay.toLowerCase();
    return normalized === candidate
      || normalized.startsWith(`${candidate},`)
      || normalized.startsWith(`${candidate} `);
  }) || '';
};

export default function ReportsScreen() {
  const { colors, isDark } = useMobileTheme();
  const insets = useSafeAreaInsets();
  const {
    currentPersonnelId,
    reports,
    deployments,
    personnel,
    submitReport,
    resolveReport,
    refreshReports,
    loadMoreReports,
    reportsHasMore,
    isReportsLoading,
    isReportsLoadingMore,
  } = useOperationalContext();
  const [filter, setFilter] = useState<(typeof reportFilters)[number]>('all');
  const [formVisible, setFormVisible] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [barangayPickerVisible, setBarangayPickerVisible] = useState(false);
  const [locationPickerVisible, setLocationPickerVisible] = useState(false);
  const [selectedReport, setSelectedReport] = useState<PoliceReport | null>(null);
  const [resolveTarget, setResolveTarget] = useState<PoliceReport | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [evidencePhoto, setEvidencePhoto] = useState<ReportEvidenceInput | null>(null);
  const [expandedReportIds, setExpandedReportIds] = useState<Set<string>>(() => new Set());
  const toggleReport = useCallback((reportId: string) => {
    setExpandedReportIds((current) => {
      const next = new Set(current);
      if (next.has(reportId)) next.delete(reportId);
      else next.add(reportId);
      return next;
    });
  }, []);

  const selectFilter = useCallback((nextFilter: (typeof reportFilters)[number]) => {
    if (nextFilter === filter) return;
    setFilter(nextFilter);
  }, [filter]);

  useEffect(() => {
    refreshReports('all').catch(() => undefined);
  }, [refreshReports]);

  const filteredReports = useMemo(() => reports.filter((report) => {
    if (filter === 'incident') return report.is_incident;
    if (filter === 'routine') return !report.is_incident;
    return true;
  }), [filter, reports]);

  const currentDeployment = deployments.find(
    (deployment) => deployment.personnelId === currentPersonnelId,
  ) || deployments[0];

  const openSubmitForm = () => {
    const assignedArea = currentDeployment?.patrolArea || '';
    setForm({
      ...emptyForm,
      occurred_at: new Date().toISOString(),
      assigned_area: assignedArea,
      barangay: getBarangayFromArea(assignedArea),
    });
    setEvidencePhoto(null);
    setFormVisible(true);
  };

  const captureEvidencePhoto = async (cameraFacing: 'front' | 'back') => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Camera permission required',
        'Allow camera access in your phone settings to capture report evidence.',
      );
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      cameraType: cameraFacing === 'front'
        ? ImagePicker.CameraType.front
        : ImagePicker.CameraType.back,
      quality: 0.72,
      allowsEditing: false,
      exif: false,
    });

    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    const mimeType = asset.mimeType || 'image/jpeg';
    const extension = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
    const previousEvidenceUri = evidencePhoto?.uri;
    setEvidencePhoto({
      uri: asset.uri,
      name: asset.fileName || `report-evidence-${Date.now()}.${extension}`,
      type: mimeType,
      camera_facing: cameraFacing,
      captured_at: new Date().toISOString(),
    });
    if (previousEvidenceUri && previousEvidenceUri !== asset.uri) {
      discardTemporaryEvidence(previousEvidenceUri).catch(() => undefined);
    }
  };

  const chooseEvidenceCamera = () => {
    Alert.alert(
      evidencePhoto ? 'Retake photo evidence' : 'Capture photo evidence',
      'Choose which camera to use.',
      [
        { text: 'Back camera', onPress: () => captureEvidencePhoto('back') },
        { text: 'Front camera', onPress: () => captureEvidencePhoto('front') },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  };

  const updateForm = <Field extends keyof ReportForm>(
    field: Field,
    value: ReportForm[Field],
  ) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const selectBarangay = (barangay: string) => {
    setForm((current) => ({
      ...current,
      barangay,
      location_source: 'manual',
      latitude: undefined,
      longitude: undefined,
    }));
  };

  const updateManualLocation = (location: string) => {
    setForm((current) => ({
      ...current,
      location,
      location_source: 'manual',
      latitude: current.location_source === 'gps' ? undefined : current.latitude,
      longitude: current.location_source === 'gps' ? undefined : current.longitude,
    }));
  };

  const usePinnedLocation = (coordinates: { latitude: number; longitude: number }) => {
    setForm((current) => ({
      ...current,
      location_source: 'manual',
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
    }));
    setLocationPickerVisible(false);
  };

  const useCurrentGpsSuggestion = () => {
    const liveOfficer = personnel.find((member) => member.id === currentPersonnelId);
    const latitude = liveOfficer?.latitude;
    const longitude = liveOfficer?.longitude;
    const hasCurrentCoordinates = liveOfficer?.locationStatus === 'current'
      && liveOfficer.isLocationStale !== true
      && typeof latitude === 'number'
      && Number.isFinite(latitude)
      && typeof longitude === 'number'
      && Number.isFinite(longitude);
    if (!liveOfficer || !hasCurrentCoordinates) {
      Alert.alert(
        'GPS unavailable',
        'You can still submit the report manually. Select the Cabagan barangay and enter the exact incident place.',
      );
      return;
    }

    const detectedBarangay = getBarangayFromArea(liveOfficer.locationName);
    if (!detectedBarangay) {
      Alert.alert(
        'Current GPS is outside Cabagan',
        'The current position cannot be used as the incident barangay. Select the actual Cabagan barangay and enter the place manually.',
      );
      return;
    }

    setForm((current) => ({
      ...current,
      barangay: detectedBarangay,
      location: liveOfficer.locationName,
      location_source: 'gps',
      latitude,
      longitude,
    }));
  };

  const handleSubmit = async (close: SheetClose) => {
    if (
      !form.title.trim()
      || !form.description.trim()
      || !form.location.trim()
      || !isCabaganBarangay(form.barangay)
    ) {
      Alert.alert('Complete the report', 'Title, description, location, and barangay are required.');
      return;
    }

    setIsSaving(true);
    try {
      const submissionResult = await submitReport({
        ...form,
        ...(evidencePhoto && { evidence_photo: evidencePhoto }),
      });
      await discardTemporaryEvidence(evidencePhoto?.uri);
      setEvidencePhoto(null);
      setForm(emptyForm);
      close(() => {
        Alert.alert(
          submissionResult === 'queued' ? 'Report saved offline' : 'Report submitted',
          submissionResult === 'queued'
            ? 'The report and its evidence are secured on this device and will synchronize automatically.'
            : form.report_type === 'incident'
              ? 'The incident is open and can now be resolved from Report History.'
              : 'The activity report was saved to your history.',
        );
      });
    } catch (error) {
      Alert.alert('Submission failed', (error as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleResolve = async (close: SheetClose) => {
    if (!resolveTarget || !resolutionNotes.trim()) {
      Alert.alert('Resolution notes required', 'Describe the action taken before resolving the incident.');
      return;
    }

    setIsSaving(true);
    try {
      await resolveReport(resolveTarget.id, resolutionNotes.trim());
      close(() => {
        setResolutionNotes('');
        Alert.alert('Incident resolved', 'Web Reports and Analytics were updated automatically.');
      });
    } catch (error) {
      Alert.alert('Unable to resolve incident', (error as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  const renderReport = useCallback(({ item }: { item: PoliceReport }) => {
    const canResolve = item.is_incident && item.case_status !== 'resolved';
    const expanded = expandedReportIds.has(item.id);

    return (
      <View
        style={[
          styles.reportCard,
          isDark && themeStyles.surface,
          item.is_incident ? styles.reportCardIncident : styles.reportCardRoutine,
        ]}
      >
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          activeOpacity={0.76}
          onPress={() => toggleReport(item.id)}
        >
          <View style={styles.reportTopRow}>
            <View style={[styles.typeBadge, item.is_incident ? styles.incidentBadge : styles.routineBadge]}>
              <Text style={styles.typeBadgeText}>{item.report_type}</Text>
            </View>
            <View style={styles.reportTopActions}>
              {item.is_incident && (
                <View style={[styles.caseBadge, item.case_status === 'resolved' ? styles.resolvedBadge : styles.openBadge]}>
                  <Text style={styles.caseBadgeText}>{item.case_status}</Text>
                </View>
              )}
              <Icon name={expanded ? 'expand-less' : 'expand-more'} size={21} color={colors.textMuted} />
            </View>
          </View>

          <Text style={[styles.reportTitle, isDark && themeStyles.text]}>{item.title}</Text>
          <Text style={[styles.reportMeta, isDark && themeStyles.muted]}>
            {new Date(item.date_time).toLocaleString([], {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            })}
          </Text>
          <View style={styles.locationRow}>
            <Icon name="place" size={16} color={colors.textMuted} />
            <Text style={[styles.locationText, isDark && themeStyles.muted]} numberOfLines={1}>{item.location}</Text>
          </View>
        </TouchableOpacity>

        {expanded && (
          <Animated.View
            entering={CARD_CONTENT_ENTER}
            exiting={CARD_CONTENT_EXIT}
            style={[styles.reportExpanded, isDark && themeStyles.border]}
          >
            <Text style={[styles.reportDescription, isDark && themeStyles.muted]}>
              {item.description || 'No description provided.'}
            </Text>
            <View style={styles.reportActions}>
              {canResolve && (
                <TouchableOpacity style={styles.resolveButton} onPress={() => setResolveTarget(item)}>
                  <Icon name="check-circle" size={17} color="#ffffff" />
                  <Text style={styles.resolveButtonText}>Resolve Incident</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={[styles.viewButton, isDark && themeStyles.surfaceMuted]} onPress={() => setSelectedReport(item)}>
                <Icon name="visibility" size={17} color={mobileTheme.purple} />
                <Text style={styles.viewButtonText}>View</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        )}
      </View>
    );
  }, [
    colors.textMuted,
    expandedReportIds,
    isDark,
    toggleReport,
  ]);

  return (
    <SafeAreaView style={[styles.container, isDark && themeStyles.screen]} edges={[]}>
      <View style={styles.header}>
        <View>
          <Text style={[styles.title, isDark && themeStyles.text]}>Reports</Text>
          <Text style={[styles.subtitle, isDark && themeStyles.muted]}>Your submitted report history</Text>
        </View>
         <TouchableOpacity style={styles.submitButton} onPress={openSubmitForm}>
          <Icon name="add" size={19} color="#ffffff" />
        </TouchableOpacity>
      </View>

      <View style={styles.filters}>
        {reportFilters.map((item) => (
          <TouchableOpacity
            key={item}
            style={[
              styles.filterButton,
              isDark && themeStyles.filterButton,
              filter === item && styles.filterButtonActive,
              isDark && filter === item && themeStyles.filterButtonActive,
            ]}
            onPress={() => selectFilter(item)}
          >
            <Text style={[
              styles.filterText,
              isDark && themeStyles.muted,
              filter === item && styles.filterTextActive,
              isDark && filter === item && themeStyles.text,
            ]}>{item}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.listTransition}>
        <FlatList
          key={`reports-${filter}`}
          data={filteredReports}
          keyExtractor={(item) => item.id}
          renderItem={renderReport}
          style={styles.listViewport}
          contentContainerStyle={styles.list}
          initialNumToRender={6}
          maxToRenderPerBatch={6}
          windowSize={7}
          removeClippedSubviews={false}
          showsVerticalScrollIndicator={false}
          ListFooterComponent={reportsHasMore ? (
            <TouchableOpacity
              style={[styles.loadMoreButton, isDark && themeStyles.surfaceMuted]}
              onPress={() => loadMoreReports().catch(() => undefined)}
              disabled={isReportsLoadingMore}
            >
              {isReportsLoadingMore ? (
                <ActivityIndicator size="small" color={mobileTheme.blue} />
              ) : (
                <Icon name="expand-more" size={20} color={mobileTheme.blue} />
              )}
              <Text style={styles.loadMoreText}>
                {isReportsLoadingMore ? 'Loading...' : 'Load more'}
              </Text>
            </TouchableOpacity>
          ) : null}
          ListEmptyComponent={(
            <View style={styles.emptyState}>
              <Icon name="description" size={34} color={colors.textMuted} />
              <Text style={[styles.emptyTitle, isDark && themeStyles.text]}>
                {isReportsLoading ? 'Loading reports...' : 'No submitted reports'}
              </Text>
              <Text style={[styles.emptyText, isDark && themeStyles.muted]}>
                {isReportsLoading ? 'Getting your latest records.' : 'Reports you submit will appear here.'}
              </Text>
            </View>
          )}
        />
      </View>

      <SwipeDismissSheet
        visible={formVisible && !locationPickerVisible}
        topInset={insets.top + SUBMIT_MODAL_TOP_OFFSET}
        tapOutsideToClose={false}
        sheetStyle={[styles.modalScreen, isDark && themeStyles.screen]}
        onClose={() => {
          setBarangayPickerVisible(false);
          discardTemporaryEvidence(evidencePhoto?.uri).catch(() => undefined);
          setEvidencePhoto(null);
          setFormVisible(false);
        }}
      >
        {({ close }) => (
        <SafeAreaView
            style={[styles.modalScreen, isDark && themeStyles.screen]}
            edges={['bottom']}
          >
          <View style={[styles.modalHeader, isDark && themeStyles.border]}>
            <View>
              <Text style={[styles.modalTitle, isDark && themeStyles.text]}>Submit Report</Text>
              <Text style={[styles.modalSubtitle, isDark && themeStyles.muted]}>Record an incident or completed activity</Text>
            </View>
          </View>

          <SheetScrollView
            contentContainerStyle={styles.form}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={[styles.fieldLabel, isDark && themeStyles.muted]}>REPORT TYPE</Text>
            <View style={styles.typeOptions}>
              {reportTypes.map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[styles.typeOption, isDark && themeStyles.surfaceMuted, form.report_type === type && styles.typeOptionActive]}
                  onPress={() => updateForm('report_type', type)}
                >
                  <Text style={[styles.typeOptionText, form.report_type === type && styles.typeOptionTextActive]}>
                    {type}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.fieldLabel, isDark && themeStyles.muted]}>TITLE</Text>
            <TextInput style={[styles.input, isDark && themeStyles.input]} value={form.title} onChangeText={(value) => updateForm('title', value)} placeholder="Short report title" placeholderTextColor={colors.textMuted} />

            <Text style={[styles.fieldLabel, isDark && themeStyles.muted]}>TIME</Text>
            <View style={[styles.autoField, isDark && themeStyles.input]}>
              <Icon name="schedule" size={18} color={mobileTheme.purple} />
              <Text style={[styles.autoFieldText, isDark && themeStyles.text]}>
                {form.occurred_at
                  ? new Date(form.occurred_at).toLocaleString([], {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })
                  : 'Auto-filled on submit'}
              </Text>
            </View>

            <Text style={[styles.fieldLabel, isDark && themeStyles.muted]}>ASSIGNED AREA</Text>
            <View style={[styles.autoField, isDark && themeStyles.input]}>
              <Icon name="assignment-ind" size={18} color={mobileTheme.purple} />
              <Text style={[styles.autoFieldText, isDark && themeStyles.text]}>
                {form.assigned_area || 'No active deployment assigned'}
              </Text>
            </View>

            <Text style={[styles.fieldLabel, isDark && themeStyles.muted]}>BARANGAY</Text>
            <TouchableOpacity
              style={[styles.selectField, isDark && themeStyles.input]}
              onPress={() => setBarangayPickerVisible(true)}
            >
              <Icon name="map" size={18} color={mobileTheme.purple} />
              <Text style={[styles.autoFieldText, isDark && themeStyles.text, !form.barangay && styles.placeholderText]}>
                {form.barangay || 'Select a Cabagan barangay'}
              </Text>
              <Icon name="keyboard-arrow-down" size={21} color={colors.textMuted} />
            </TouchableOpacity>

            <Text style={[styles.fieldLabel, isDark && themeStyles.muted]}>EXACT INCIDENT PLACE / LANDMARK</Text>
            <TextInput
              style={[styles.input, isDark && themeStyles.input]}
              value={form.location}
              onChangeText={updateManualLocation}
              placeholder="Example: Anao Public Market entrance"
              placeholderTextColor={colors.textMuted}
            />
            <View style={styles.locationAssistRow}>
              <View style={styles.locationSource}>
                <Icon
                  name={form.location_source === 'gps' ? 'gps-fixed' : 'edit-location-alt'}
                  size={15}
                  color={colors.textMuted}
                />
                <Text style={[styles.locationSourceText, isDark && themeStyles.muted]}>
                  {form.location_source === 'gps' ? 'Current GPS suggestion' : 'Manual incident location'}
                </Text>
              </View>
              <TouchableOpacity style={[styles.gpsSuggestionButton, isDark && themeStyles.surfaceMuted]} onPress={useCurrentGpsSuggestion}>
                <Icon name="my-location" size={16} color={mobileTheme.purple} />
                <Text style={styles.gpsSuggestionText}>Use current GPS</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={[styles.mapPickerButton, isDark && themeStyles.input]}
              onPress={() => setLocationPickerVisible(true)}
            >
              <View style={styles.mapPickerIcon}>
                <Icon name="add-location-alt" size={20} color={mobileTheme.purple} />
              </View>
              <View style={styles.mapPickerCopy}>
                <Text style={[styles.mapPickerTitle, isDark && themeStyles.text]}>Pick the incident point on map</Text>
                <Text style={[styles.mapPickerMeta, isDark && themeStyles.muted]}>
                  {typeof form.latitude === 'number' && typeof form.longitude === 'number'
                    ? `${form.latitude.toFixed(6)}, ${form.longitude.toFixed(6)}`
                    : 'Recommended when the report is submitted after leaving the scene'}
                </Text>
              </View>
              <Icon name="chevron-right" size={22} color={colors.textMuted} />
            </TouchableOpacity>
            <Text style={[styles.locationHelper, isDark && themeStyles.muted]}>
              Verify the actual incident place. Your current position may be different if you submit later.
            </Text>

            <Text style={[styles.fieldLabel, isDark && themeStyles.muted]}>DESCRIPTION</Text>
            <TextInput
              style={[styles.input, styles.textArea, isDark && themeStyles.input]}
              value={form.description}
              onChangeText={(value) => updateForm('description', value)}
              placeholder="What happened and what action was taken?"
              placeholderTextColor={colors.textMuted}
              multiline
              textAlignVertical="top"
            />

            <Text style={[styles.fieldLabel, isDark && themeStyles.muted]}>PHOTO EVIDENCE (OPTIONAL)</Text>
            {evidencePhoto ? (
              <View style={[styles.evidencePreview, isDark && themeStyles.surfaceMuted]}>
                <Image source={{ uri: evidencePhoto.uri }} style={styles.evidencePreviewImage} />
                <View style={styles.evidencePreviewInfo}>
                  <View style={styles.evidencePreviewCopy}>
                    <Text style={[styles.evidencePreviewTitle, isDark && themeStyles.text]}>Photo ready</Text>
                    <Text style={[styles.evidencePreviewMeta, isDark && themeStyles.muted]}>
                      {evidencePhoto.camera_facing === 'front' ? 'Front camera' : 'Back camera'}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.evidenceIconButton, isDark && themeStyles.border]}
                    onPress={() => {
                      discardTemporaryEvidence(evidencePhoto.uri).catch(() => undefined);
                      setEvidencePhoto(null);
                    }}
                    accessibilityLabel="Remove photo evidence"
                  >
                    <Icon name="delete-outline" size={20} color={mobileTheme.danger} />
                  </TouchableOpacity>
                </View>
                <TouchableOpacity style={styles.retakeButton} onPress={chooseEvidenceCamera}>
                  <Icon name="cameraswitch" size={18} color={mobileTheme.purple} />
                  <Text style={styles.retakeButtonText}>Retake photo</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.captureButton, isDark && themeStyles.input]}
                onPress={chooseEvidenceCamera}
              >
                <View style={styles.captureButtonIcon}>
                  <Icon name="photo-camera" size={22} color={mobileTheme.purple} />
                </View>
                <View style={styles.captureButtonCopy}>
                  <Text style={[styles.captureButtonTitle, isDark && themeStyles.text]}>Capture evidence</Text>
                  <Text style={[styles.captureButtonMeta, isDark && themeStyles.muted]}>
                    Use the front or back camera. Maximum upload: 5 MB.
                  </Text>
                </View>
                <Icon name="chevron-right" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            )}

            {form.report_type === 'incident' && (
              <>
                <Text style={[styles.fieldLabel, isDark && themeStyles.muted]}>SEVERITY</Text>
                <View style={styles.severityOptions}>
                  {[1, 2, 3, 4, 5].map((severity) => (
                    <TouchableOpacity
                      key={severity}
                      style={[styles.severityButton, isDark && themeStyles.surfaceMuted, form.severity === severity && styles.severityButtonActive]}
                      onPress={() => updateForm('severity', severity)}
                    >
                      <Text style={[styles.severityText, form.severity === severity && styles.severityTextActive]}>
                        {severity}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            <TouchableOpacity style={styles.primaryButton} onPress={() => handleSubmit(close)} disabled={isSaving}>
              <Text style={styles.primaryButtonText}>{isSaving ? 'Submitting...' : 'Submit Report'}</Text>
            </TouchableOpacity>
          </SheetScrollView>
          </SafeAreaView>
        )}
      </SwipeDismissSheet>

      <ReportLocationPickerModal
        visible={locationPickerVisible}
        initialLatitude={form.latitude}
        initialLongitude={form.longitude}
        onClose={() => setLocationPickerVisible(false)}
        onConfirm={usePinnedLocation}
      />

      <CenteredDialog
        visible={barangayPickerVisible}
        onClose={() => setBarangayPickerVisible(false)}
        cardStyle={styles.pickerDialog}
      >
        <View style={[styles.modalHeader, isDark && themeStyles.border]}>
          <View>
            <Text style={[styles.modalTitle, isDark && themeStyles.text]}>Select Barangay</Text>
            <Text style={[styles.modalSubtitle, isDark && themeStyles.muted]}>Official barangays of Cabagan only</Text>
          </View>
        </View>
        <FlatList
          data={[...CABAGAN_BARANGAYS]}
          keyExtractor={(barangay) => barangay}
          style={styles.dialogListViewport}
          contentContainerStyle={styles.pickerList}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const isSelected = form.barangay === item;
            return (
              <TouchableOpacity
                style={[styles.pickerOption, isDark && themeStyles.border, isSelected && styles.pickerOptionSelected]}
                onPress={() => {
                  selectBarangay(item);
                  setBarangayPickerVisible(false);
                }}
              >
                <Text style={[
                  styles.pickerOptionText,
                  isDark && themeStyles.text,
                  isSelected && styles.pickerOptionTextSelected,
                ]}>
                  {item}
                </Text>
                {isSelected && (
                  <Icon name="check-circle" size={20} color={mobileTheme.purple} />
                )}
              </TouchableOpacity>
            );
          }}
        />
        <View style={[styles.dialogFooter, isDark && themeStyles.border]}>
          <TouchableOpacity
            style={[styles.dialogCloseButton, isDark && themeStyles.surfaceMuted]}
            onPress={() => setBarangayPickerVisible(false)}
          >
            <Text style={[styles.dialogCloseText, isDark && themeStyles.text]}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </CenteredDialog>

      <CenteredDialog
        visible={Boolean(selectedReport)}
        onClose={() => setSelectedReport(null)}
        cardStyle={styles.detailDialog}
      >
        <View style={[styles.modalHeader, isDark && themeStyles.border]}>
          <Text style={[styles.modalTitle, isDark && themeStyles.text]}>Report Details</Text>
        </View>
        {selectedReport && (
          <ScrollView
            style={styles.dialogListViewport}
            contentContainerStyle={styles.detailBody}
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
          >
            <Text style={[styles.detailEyebrow, isDark && themeStyles.muted]}>{selectedReport.id}</Text>
            <Text style={[styles.detailTitle, isDark && themeStyles.text]}>{selectedReport.title}</Text>
            <Detail label="Report type" value={selectedReport.report_type} />
            <Detail label="Case status" value={selectedReport.case_status} />
            <Detail label="Barangay" value={selectedReport.barangay} />
            <Detail label="Location" value={selectedReport.location} />
            <Detail
              label="Location source"
              value={selectedReport.location_source === 'gps'
                ? 'Current GPS suggestion'
                : 'Manually entered'}
            />
            <Detail label="Description" value={selectedReport.description} />
            {selectedReport.evidence_photo?.url && (
              <View style={[styles.detailEvidence, isDark && themeStyles.border]}>
                <Text style={[styles.detailLabel, isDark && themeStyles.muted]}>PHOTO EVIDENCE</Text>
                <CachedImage
                  source={{ uri: resolveApiAssetUrl(selectedReport.evidence_photo.url) }}
                  cachePolicy="memory"
                  style={styles.detailEvidenceImage}
                  contentFit="cover"
                />
                <Text style={[styles.detailEvidenceMeta, isDark && themeStyles.muted]}>
                  Captured with {selectedReport.evidence_photo.camera_facing === 'front' ? 'front' : 'back'} camera
                </Text>
              </View>
            )}
            {selectedReport.resolution_notes && (
              <Detail label="Resolution notes" value={selectedReport.resolution_notes} />
            )}
          </ScrollView>
        )}
        <View style={[styles.dialogFooter, isDark && themeStyles.border]}>
          <TouchableOpacity
            style={[styles.dialogCloseButton, styles.dialogPrimaryButton]}
            onPress={() => setSelectedReport(null)}
          >
            <Text style={[styles.dialogCloseText, styles.dialogPrimaryText]}>Close</Text>
          </TouchableOpacity>
        </View>
      </CenteredDialog>

      <SwipeDismissSheet
        visible={Boolean(resolveTarget)}
        onClose={() => setResolveTarget(null)}
        sheetStyle={[styles.resolveModal, isDark && themeStyles.surface]}
      >
        {({ close }) => (
          <View style={styles.resolveContent}>
            <Text style={[styles.modalTitle, isDark && themeStyles.text]}>Resolve Incident</Text>
            <Text style={[styles.resolveCopy, isDark && themeStyles.muted]}>
              Confirm that {resolveTarget?.title} has been handled. This will update the web dashboard.
            </Text>
            <Text style={[styles.fieldLabel, isDark && themeStyles.muted]}>RESOLUTION NOTES</Text>
            <TextInput
              style={[styles.input, styles.textArea, isDark && themeStyles.input]}
              value={resolutionNotes}
              onChangeText={setResolutionNotes}
              placeholder="Describe the action taken and outcome"
              placeholderTextColor={colors.textMuted}
              multiline
              textAlignVertical="top"
            />
            <View style={styles.resolveActions}>
              <TouchableOpacity style={[styles.cancelButton, isDark && themeStyles.border]} onPress={() => close()}>
                <Text style={[styles.cancelButtonText, isDark && themeStyles.text]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.primaryButtonCompact} onPress={() => handleResolve(close)} disabled={isSaving}>
                <Text style={styles.primaryButtonText}>{isSaving ? 'Saving...' : 'Confirm Resolve'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </SwipeDismissSheet>
    </SafeAreaView>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  const { isDark } = useMobileTheme();
  return (
    <View style={[styles.detailRow, isDark && themeStyles.border]}>
      <Text style={[styles.detailLabel, isDark && themeStyles.muted]}>{label}</Text>
      <Text style={[styles.detailValue, isDark && themeStyles.text]}>{value}</Text>
    </View>
  );
}

function CenteredDialog({
  cardStyle,
  children,
  onClose,
  visible,
}: {
  cardStyle?: StyleProp<ViewStyle>;
  children: React.ReactNode;
  onClose: () => void;
  visible: boolean;
}) {
  const { isDark } = useMobileTheme();

  return (
    <Modal
      animationType="fade"
      hardwareAccelerated
      onRequestClose={onClose}
      presentationStyle="overFullScreen"
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <View style={styles.dialogOverlay}>
        <Pressable
          accessibilityLabel="Close dialog"
          accessibilityRole="button"
          onPress={onClose}
          style={styles.dialogBackdropPressTarget}
        />
        <Animated.View
          accessibilityViewIsModal
          entering={FadeIn.duration(180)}
          style={[styles.dialogCard, isDark && themeStyles.surface, cardStyle]}
        >
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  header: {
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: { color: mobileTheme.navy, fontSize: 29, fontWeight: '800' },
  subtitle: { marginTop: 4, color: mobileTheme.textMuted, fontSize: 13 },
  submitButton: {
    minHeight: 44,
    paddingHorizontal: 15,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 50,
    backgroundColor: mobileTheme.purple,
    shadowColor: '#172554',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  submitButtonText: { color: '#ffffff', fontSize: 12, fontWeight: '800' },
  filters: {
    marginHorizontal: 22,
    marginBottom: 16,
    flexDirection: 'row',
    gap: 10,
  },
  listTransition: { flex: 1 },
  listViewport: { flex: 1 },
  filterButton: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: mobileTheme.border,
    borderRadius: 8,
    backgroundColor: mobileTheme.surface,
  },
  filterButtonActive: { borderColor: mobileTheme.blue, backgroundColor: '#edf4ff' },
  filterText: { color: mobileTheme.navy, fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  filterTextActive: { color: mobileTheme.blue },
  list: { paddingHorizontal: 22, paddingBottom: 112, gap: 9 },
  reportCard: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: mobileTheme.border,
    borderRadius: 8,
    backgroundColor: mobileTheme.surface,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  reportCardIncident: { borderLeftWidth: 3, borderLeftColor: mobileTheme.danger },
  reportCardRoutine: { borderLeftWidth: 3, borderLeftColor: mobileTheme.blue },
  reportTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  reportTopActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  incidentBadge: { backgroundColor: mobileTheme.dangerSoft },
  routineBadge: { backgroundColor: mobileTheme.blueSoft },
  typeBadgeText: { color: mobileTheme.text, fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  caseBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  openBadge: { backgroundColor: mobileTheme.warningSoft },
  resolvedBadge: { backgroundColor: mobileTheme.successSoft },
  caseBadgeText: { color: mobileTheme.text, fontSize: 10, fontWeight: '800', textTransform: 'capitalize' },
  reportTitle: { marginTop: 7, color: mobileTheme.text, fontSize: 15, fontWeight: '800' },
  reportMeta: { marginTop: 2, color: mobileTheme.textMuted, fontSize: 11 },
  locationRow: { marginTop: 5, flexDirection: 'row', alignItems: 'center', gap: 4 },
  locationText: { flex: 1, color: mobileTheme.textMuted, fontSize: 12 },
  reportExpanded: { marginTop: 8, paddingTop: 7, borderTopWidth: 1, borderTopColor: mobileTheme.border },
  reportDescription: { color: mobileTheme.textMuted, fontSize: 12, lineHeight: 17 },
  reportActions: { marginTop: 7, flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  resolveButton: { minHeight: 36, paddingHorizontal: 11, flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: 8, backgroundColor: mobileTheme.success },
  resolveButtonText: { color: '#ffffff', fontSize: 11, fontWeight: '800' },
  viewButton: { minHeight: 36, minWidth: 84, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderWidth: 1, borderColor: mobileTheme.blue, borderRadius: 8, backgroundColor: mobileTheme.surface },
  viewButtonText: { color: mobileTheme.purple, fontSize: 11, fontWeight: '800' },
  emptyState: { paddingTop: 80, alignItems: 'center' },
  emptyTitle: { marginTop: 10, color: mobileTheme.text, fontSize: 15, fontWeight: '800' },
  emptyText: { marginTop: 4, color: mobileTheme.textMuted, fontSize: 12 },
  loadMoreButton: {
    minHeight: 44,
    marginTop: 3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: mobileTheme.border,
    borderRadius: 8,
    backgroundColor: mobileTheme.surface,
  },
  loadMoreText: { color: mobileTheme.blue, fontSize: 12, fontWeight: '800' },
  submitModalRoot: { flex: 1 },
  modalScreen: {
    flex: 1,
    overflow: 'hidden',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    backgroundColor: mobileTheme.background,
  },
  modalHeader: { paddingHorizontal: 18, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: mobileTheme.border },
  modalTitle: { color: mobileTheme.text, fontSize: 19, fontWeight: '800' },
  modalSubtitle: { marginTop: 2, color: mobileTheme.textMuted, fontSize: 11 },
  form: { padding: 18, paddingBottom: 36 },
  fieldLabel: { marginTop: 14, marginBottom: 6, color: mobileTheme.textMuted, fontSize: 10, fontWeight: '800' },
  typeOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  typeOption: { minHeight: 38, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: mobileTheme.border, borderRadius: 19, backgroundColor: mobileTheme.surface },
  typeOptionActive: { borderColor: mobileTheme.purple, backgroundColor: mobileTheme.purpleSoft },
  typeOptionText: { color: mobileTheme.textMuted, fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  typeOptionTextActive: { color: mobileTheme.purple },
  input: { minHeight: 46, paddingHorizontal: 12, borderWidth: 1, borderColor: mobileTheme.border, borderRadius: 12, backgroundColor: mobileTheme.surface, color: mobileTheme.text, fontSize: 13 },
  autoField: { minHeight: 46, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: mobileTheme.border, borderRadius: 12, backgroundColor: mobileTheme.surface },
  autoFieldText: { flex: 1, color: mobileTheme.text, fontSize: 13, lineHeight: 18 },
  selectField: { minHeight: 46, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: mobileTheme.border, borderRadius: 12, backgroundColor: mobileTheme.surface },
  placeholderText: { color: mobileTheme.textMuted },
  locationAssistRow: { marginTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  locationSource: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5 },
  locationSourceText: { flex: 1, color: mobileTheme.textMuted, fontSize: 10 },
  gpsSuggestionButton: { minHeight: 36, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderWidth: 1, borderColor: mobileTheme.purple, borderRadius: 18, backgroundColor: mobileTheme.surface },
  gpsSuggestionText: { color: mobileTheme.purple, fontSize: 10, fontWeight: '800' },
  mapPickerButton: { minHeight: 70, marginTop: 10, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: mobileTheme.border, borderRadius: 12, backgroundColor: mobileTheme.surface },
  mapPickerIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: mobileTheme.purpleSoft },
  mapPickerCopy: { flex: 1 },
  mapPickerTitle: { color: mobileTheme.text, fontSize: 12, fontWeight: '800' },
  mapPickerMeta: { marginTop: 3, color: mobileTheme.textMuted, fontSize: 9, lineHeight: 14 },
  locationHelper: { marginTop: 7, color: mobileTheme.textMuted, fontSize: 10, lineHeight: 15 },
  textArea: { minHeight: 110, paddingTop: 12 },
  captureButton: { minHeight: 82, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: mobileTheme.border, borderRadius: 12, backgroundColor: mobileTheme.surface },
  captureButtonIcon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: mobileTheme.purpleSoft },
  captureButtonCopy: { flex: 1 },
  captureButtonTitle: { color: mobileTheme.text, fontSize: 13, fontWeight: '800' },
  captureButtonMeta: { marginTop: 3, color: mobileTheme.textMuted, fontSize: 10, lineHeight: 15 },
  evidencePreview: { overflow: 'hidden', borderWidth: 1, borderColor: mobileTheme.border, borderRadius: 12, backgroundColor: mobileTheme.surface },
  evidencePreviewImage: { width: '100%', aspectRatio: 4 / 3, backgroundColor: mobileTheme.background },
  evidencePreviewInfo: { padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  evidencePreviewCopy: { flex: 1 },
  evidencePreviewTitle: { color: mobileTheme.text, fontSize: 13, fontWeight: '800' },
  evidencePreviewMeta: { marginTop: 2, color: mobileTheme.textMuted, fontSize: 10 },
  evidenceIconButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: mobileTheme.border, borderRadius: 8 },
  retakeButton: { minHeight: 42, marginHorizontal: 12, marginBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: mobileTheme.purple, borderRadius: 8 },
  retakeButtonText: { color: mobileTheme.purple, fontSize: 11, fontWeight: '800' },
  severityOptions: { flexDirection: 'row', gap: 8 },
  severityButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: mobileTheme.border, borderRadius: 21, backgroundColor: mobileTheme.surface },
  severityButtonActive: { borderColor: mobileTheme.purple, backgroundColor: mobileTheme.purple },
  severityText: { color: mobileTheme.textMuted, fontWeight: '800' },
  severityTextActive: { color: '#ffffff' },
  primaryButton: { minHeight: 48, marginTop: 22, alignItems: 'center', justifyContent: 'center', borderRadius: 24, backgroundColor: mobileTheme.purple },
  primaryButtonCompact: { minHeight: 44, paddingHorizontal: 15, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: mobileTheme.success },
  primaryButtonText: { color: '#ffffff', fontSize: 13, fontWeight: '800' },
  dialogOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 44,
    backgroundColor: 'rgba(2, 6, 23, 0.58)',
  },
  dialogBackdropPressTarget: { ...StyleSheet.absoluteFill },
  dialogCard: {
    width: '100%',
    maxWidth: 430,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: mobileTheme.border,
    borderRadius: 22,
    backgroundColor: mobileTheme.surface,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.24,
    shadowRadius: 22,
    elevation: 18,
  },
  pickerDialog: { height: '68%', maxHeight: 590 },
  detailDialog: { maxHeight: '78%' },
  dialogListViewport: { flexShrink: 1 },
  dialogFooter: {
    padding: 12,
    alignItems: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: mobileTheme.border,
  },
  dialogCloseButton: {
    minWidth: 92,
    minHeight: 42,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: mobileTheme.border,
    borderRadius: 21,
    backgroundColor: mobileTheme.surface,
  },
  dialogPrimaryButton: { borderColor: mobileTheme.purple, backgroundColor: mobileTheme.purple },
  dialogCloseText: { color: mobileTheme.text, fontSize: 12, fontWeight: '800' },
  dialogPrimaryText: { color: '#ffffff' },
  pickerList: { padding: 10 },
  pickerOption: { minHeight: 46, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: mobileTheme.border },
  pickerOptionSelected: { borderRadius: 10, borderBottomColor: 'transparent', backgroundColor: mobileTheme.purpleSoft },
  pickerOptionText: { color: mobileTheme.text, fontSize: 13, fontWeight: '700' },
  pickerOptionTextSelected: { color: mobileTheme.purple },
  detailBody: { padding: 18 },
  detailEyebrow: { color: mobileTheme.textMuted, fontSize: 10, fontWeight: '800' },
  detailTitle: { marginTop: 5, marginBottom: 12, color: mobileTheme.text, fontSize: 18, fontWeight: '800' },
  detailRow: { paddingVertical: 10, borderTopWidth: 1, borderTopColor: mobileTheme.border },
  detailLabel: { color: mobileTheme.textMuted, fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  detailValue: { marginTop: 4, color: mobileTheme.text, fontSize: 13, lineHeight: 19, textTransform: 'capitalize' },
  detailEvidence: { paddingVertical: 10, borderTopWidth: 1, borderTopColor: mobileTheme.border },
  detailEvidenceImage: { width: '100%', marginTop: 8, aspectRatio: 4 / 3, borderRadius: 10, backgroundColor: mobileTheme.background },
  detailEvidenceMeta: { marginTop: 7, color: mobileTheme.textMuted, fontSize: 10 },
  resolveModal: { backgroundColor: mobileTheme.surface },
  resolveContent: { padding: 18, paddingTop: 4 },
  resolveCopy: { marginTop: 7, color: mobileTheme.textMuted, fontSize: 12, lineHeight: 18 },
  resolveActions: { marginTop: 16, flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  cancelButton: { minHeight: 44, paddingHorizontal: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: mobileTheme.border, borderRadius: 22 },
  cancelButtonText: { color: mobileTheme.text, fontSize: 13, fontWeight: '800' },
});

const themeStyles = StyleSheet.create({
  screen: { backgroundColor: '#050b18' },
  surface: { borderColor: '#22314a', backgroundColor: '#0b1528' },
  surfaceMuted: { borderColor: '#2a3a56', backgroundColor: '#0e1a30' },
  text: { color: '#f8fafc' },
  muted: { color: '#9eabc0' },
  border: { borderColor: '#22314a' },
  input: { borderColor: '#2a3a56', backgroundColor: '#0e1a30', color: '#f8fafc' },
  filterButton: { borderColor: '#2a3a56', backgroundColor: '#0e1a30' },
  filterButtonActive: { borderColor: mobileTheme.blue, backgroundColor: '#132442' },
});
