import React, {
  useCallback,
  useState,
} from 'react';
import { Image as CachedImage } from 'expo-image';
import {
  ActivityIndicator,
  FlatList,
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
import Animated, { FadeIn } from 'react-native-reanimated';
import { ReportLocationPickerModal } from '../components/ReportLocationPickerModal';
import {
  SheetScrollView,
  SwipeDismissSheet,
} from '../components/SwipeDismissSheet';
import { CABAGAN_BARANGAYS } from '../constants/cabaganBarangays';
import { mobileTheme } from '../constants/mobileTheme';
import { useOperationalContext } from '../context/OperationalContext';
import { useMobileTheme } from '../context/ThemeContext';
import { resolveApiAssetUrl } from '../services/operationsApi';
import { discardTemporaryEvidence } from '../services/offlineReportQueue';
import type { PoliceReport } from '../types/operations';
import {
  REPORT_FILTERS,
  REPORT_TYPES,
} from '../features/reports/reportForm';
import { ReportCard } from '../features/reports/ReportCard';
import { ReportEvidenceField } from '../features/reports/ReportEvidenceField';
import { ReportResolutionSheet } from '../features/reports/ReportResolutionSheet';
import { ReportLocationFields } from '../features/reports/ReportLocationFields';
import { useReportFormController } from '../features/reports/useReportFormController';

const reportTypes = REPORT_TYPES;
const reportFilters = REPORT_FILTERS;
const SUBMIT_MODAL_TOP_OFFSET = 1;
type ReportDatePreset = 'all' | 'today' | '7days' | '30days';

const datePresetLabels: Record<ReportDatePreset, string> = {
  all: 'All dates',
  today: 'Today',
  '7days': '7 days',
  '30days': '30 days',
};

const dateRangeFor = (preset: ReportDatePreset) => {
  if (preset === 'all') return {};
  const to = new Date();
  const from = new Date(to);
  if (preset === 'today') from.setHours(0, 0, 0, 0);
  if (preset === '7days') from.setDate(from.getDate() - 7);
  if (preset === '30days') from.setDate(from.getDate() - 30);
  return { from: from.toISOString(), to: to.toISOString() };
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
    reportsError,
    isReportsLoading,
    isReportsLoadingMore,
  } = useOperationalContext();
  const {
    barangayPickerVisible,
    chooseEvidenceCamera,
    evidencePhoto,
    form,
    formVisible,
    handleResolve,
    handleSubmit,
    isSaving,
    locationPickerVisible,
    openSubmitForm,
    resolutionNotes,
    resolveTarget,
    selectBarangay,
    selectedReport,
    setBarangayPickerVisible,
    setEvidencePhoto,
    setFormVisible,
    setLocationPickerVisible,
    setResolutionNotes,
    setResolveTarget,
    setSelectedReport,
    updateForm,
    updateManualLocation,
    useCurrentGpsSuggestion,
    usePinnedLocation,
  } = useReportFormController({
    currentPersonnelId,
    deployments,
    personnel,
    resolveReport,
    submitReport,
  });
  const [filter, setFilter] = useState<(typeof reportFilters)[number]>('all');
  const [datePreset, setDatePreset] = useState<ReportDatePreset>('all');
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
    refreshReports(nextFilter, dateRangeFor(datePreset)).catch(() => undefined);
  }, [datePreset, filter, refreshReports]);

  const selectDatePreset = useCallback((nextPreset: ReportDatePreset) => {
    if (nextPreset === datePreset) return;
    setDatePreset(nextPreset);
    refreshReports(filter, dateRangeFor(nextPreset)).catch(() => undefined);
  }, [datePreset, filter, refreshReports]);

  const renderReport = useCallback(({ item }: { item: PoliceReport }) => (
    <ReportCard
      expanded={expandedReportIds.has(item.id)}
      onResolve={setResolveTarget}
      onToggle={toggleReport}
      onView={setSelectedReport}
      report={item}
    />
  ), [expandedReportIds, toggleReport]);

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

      <View style={styles.dateFilterRow}>
        <ScrollView
          horizontal
          contentContainerStyle={styles.dateFilterChips}
          showsHorizontalScrollIndicator={false}
        >
          {(Object.keys(datePresetLabels) as ReportDatePreset[]).map((preset) => {
            const selected = datePreset === preset;
            return (
              <TouchableOpacity
                key={preset}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                style={[
                  styles.datePresetChip,
                  isDark && themeStyles.filterButton,
                  selected && styles.datePresetChipActive,
                  isDark && selected && themeStyles.filterButtonActive,
                ]}
                onPress={() => selectDatePreset(preset)}
              >
                {preset === 'all' && (
                  <Icon
                    name="calendar-today"
                    size={15}
                    color={selected ? mobileTheme.blue : colors.textMuted}
                  />
                )}
                <Text style={[
                  styles.datePresetChipText,
                  isDark && themeStyles.muted,
                  selected && styles.datePresetChipTextActive,
                  isDark && selected && themeStyles.text,
                ]}>
                  {datePresetLabels[preset]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <View style={styles.listTransition}>
        <FlatList
          key={`reports-${filter}`}
          data={reports}
          keyExtractor={(item) => item.id}
          renderItem={renderReport}
          style={styles.listViewport}
          contentContainerStyle={styles.list}
          initialNumToRender={6}
          maxToRenderPerBatch={6}
          windowSize={7}
          removeClippedSubviews={false}
          showsVerticalScrollIndicator={false}
          ListFooterComponent={reports.length > 0 && (reportsHasMore || reportsError) ? (
            <View style={styles.listFooter}>
              {reportsError ? (
                <Text style={styles.listFooterError}>{reportsError}</Text>
              ) : null}
              <TouchableOpacity
                style={[styles.loadMoreButton, isDark && themeStyles.surfaceMuted]}
                onPress={() => loadMoreReports().catch(() => undefined)}
                disabled={isReportsLoadingMore}
              >
                {isReportsLoadingMore ? (
                  <ActivityIndicator size="small" color={mobileTheme.blue} />
                ) : (
                  <Icon name={reportsError ? 'refresh' : 'expand-more'} size={20} color={mobileTheme.blue} />
                )}
                <Text style={styles.loadMoreText}>
                  {isReportsLoadingMore
                    ? 'Loading...'
                    : reportsError ? 'Try again' : 'See previous reports'}
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}
          ListEmptyComponent={(
            <View style={styles.emptyState}>
              <Icon
                name={reportsError ? 'cloud-off' : 'description'}
                size={34}
                color={reportsError ? mobileTheme.danger : colors.textMuted}
              />
              <Text style={[styles.emptyTitle, isDark && themeStyles.text]}>
                {isReportsLoading
                  ? 'Loading reports...'
                  : reportsError ? 'Reports could not be loaded' : 'No matching reports'}
              </Text>
              <Text style={[styles.emptyText, isDark && themeStyles.muted]}>
                {isReportsLoading
                  ? 'Getting your latest records.'
                  : reportsError || 'Try another report type or date filter.'}
              </Text>
              {!isReportsLoading && reportsError ? (
                <TouchableOpacity
                  style={styles.retryButton}
                  onPress={() => refreshReports(filter, dateRangeFor(datePreset)).catch(() => undefined)}
                >
                  <Icon name="refresh" size={17} color="#ffffff" />
                  <Text style={styles.retryButtonText}>Try again</Text>
                </TouchableOpacity>
              ) : null}
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

            <ReportLocationFields
              form={form}
              onEditLocation={updateManualLocation}
              onOpenBarangays={() => setBarangayPickerVisible(true)}
              onOpenMap={() => setLocationPickerVisible(true)}
              onUseCurrentGps={useCurrentGpsSuggestion}
            />

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
            <ReportEvidenceField
              evidence={evidencePhoto}
              onCapture={chooseEvidenceCamera}
              onRemove={() => {
                discardTemporaryEvidence(evidencePhoto?.uri).catch(() => undefined);
                setEvidencePhoto(null);
              }}
            />

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

      <ReportResolutionSheet
        notes={resolutionNotes}
        onChangeNotes={setResolutionNotes}
        onClose={() => setResolveTarget(null)}
        onResolve={handleResolve}
        saving={isSaving}
        target={resolveTarget}
      />
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
  dateFilterRow: { marginTop: -7, marginBottom: 12 },
  dateFilterChips: {
    paddingHorizontal: 22,
    gap: 8,
  },
  datePresetChip: {
    minHeight: 40,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderWidth: 1,
    borderColor: mobileTheme.border,
    borderRadius: 10,
    backgroundColor: mobileTheme.surface,
  },
  datePresetChipActive: { borderColor: mobileTheme.blue, backgroundColor: '#edf4ff' },
  datePresetChipText: { color: mobileTheme.textMuted, fontSize: 11, fontWeight: '700' },
  datePresetChipTextActive: { color: mobileTheme.blue, fontWeight: '800' },
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
  emptyText: { marginTop: 4, paddingHorizontal: 24, color: mobileTheme.textMuted, fontSize: 12, textAlign: 'center' },
  retryButton: { marginTop: 14, minHeight: 42, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 8, backgroundColor: mobileTheme.blue },
  retryButtonText: { color: '#ffffff', fontSize: 12, fontWeight: '800' },
  listFooter: { marginTop: 3 },
  listFooterError: { marginBottom: 8, paddingHorizontal: 16, color: mobileTheme.danger, fontSize: 11, lineHeight: 16, textAlign: 'center' },
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
