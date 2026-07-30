import React, { useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons as Icon } from '@expo/vector-icons';
import {
  CABAGAN_BARANGAYS,
  findCabaganBarangay,
  isCabaganBarangay,
} from '../constants/cabaganBarangays';
import { mobileTheme } from '../constants/mobileTheme';
import { useOperationalContext } from '../context/OperationalContext';
import type { PoliceReport, SubmitReportInput } from '../types/operations';

const reportTypes = ['incident', 'patrol', 'checkpoint', 'others'];

type ReportForm = SubmitReportInput & {
  occurred_at: string;
  assigned_area: string;
  location_source: 'gps' | 'manual';
};

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
  const {
    currentPersonnelId,
    reports,
    deployments,
    personnel,
    submitReport,
    resolveReport,
  } = useOperationalContext();
  const [filter, setFilter] = useState<'all' | 'incident' | 'routine'>('all');
  const [formVisible, setFormVisible] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [barangayPickerVisible, setBarangayPickerVisible] = useState(false);
  const [selectedReport, setSelectedReport] = useState<PoliceReport | null>(null);
  const [resolveTarget, setResolveTarget] = useState<PoliceReport | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);

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
    setFormVisible(true);
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
    setBarangayPickerVisible(false);
  };

  const updateManualLocation = (location: string) => {
    setForm((current) => ({
      ...current,
      location,
      location_source: 'manual',
      latitude: undefined,
      longitude: undefined,
    }));
  };

  const useCurrentGpsSuggestion = () => {
    const liveOfficer = personnel.find((member) => member.id === currentPersonnelId);
    const hasCoordinates = liveOfficer
      && Number.isFinite(liveOfficer.latitude)
      && Number.isFinite(liveOfficer.longitude);
    if (!liveOfficer || !hasCoordinates) {
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
      latitude: liveOfficer.latitude,
      longitude: liveOfficer.longitude,
    }));
  };

  const handleSubmit = async () => {
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
      await submitReport(form);
      setForm(emptyForm);
      setBarangayPickerVisible(false);
      setFormVisible(false);
      Alert.alert('Report submitted', form.report_type === 'incident'
        ? 'The incident is open and can now be resolved from Report History.'
        : 'The activity report was saved to your history.');
    } catch (error) {
      Alert.alert('Submission failed', (error as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleResolve = async () => {
    if (!resolveTarget || !resolutionNotes.trim()) {
      Alert.alert('Resolution notes required', 'Describe the action taken before resolving the incident.');
      return;
    }

    setIsSaving(true);
    try {
      await resolveReport(resolveTarget.id, resolutionNotes.trim());
      setResolveTarget(null);
      setResolutionNotes('');
      Alert.alert('Incident resolved', 'Web Reports and Analytics were updated automatically.');
    } catch (error) {
      Alert.alert('Unable to resolve incident', (error as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  const renderReport = ({ item }: { item: PoliceReport }) => {
    const canResolve = item.is_incident && item.case_status !== 'resolved';

    return (
      <View style={[
        styles.reportCard,
        item.is_incident ? styles.reportCardIncident : styles.reportCardRoutine,
      ]}>
        <View style={styles.reportTopRow}>
          <View style={[styles.typeBadge, item.is_incident ? styles.incidentBadge : styles.routineBadge]}>
            <Text style={styles.typeBadgeText}>{item.report_type}</Text>
          </View>
          {item.is_incident && (
            <View style={[styles.caseBadge, item.case_status === 'resolved' ? styles.resolvedBadge : styles.openBadge]}>
              <Text style={styles.caseBadgeText}>{item.case_status}</Text>
            </View>
          )}
        </View>

        <Text style={styles.reportTitle}>{item.title}</Text>
        <Text style={styles.reportMeta}>
          {new Date(item.date_time).toLocaleString([], {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          })}
        </Text>
        <View style={styles.locationRow}>
          <Icon name="place" size={16} color={mobileTheme.textMuted} />
          <Text style={styles.locationText} numberOfLines={1}>{item.location}</Text>
        </View>

        <View style={styles.reportActions}>
          {canResolve && (
            <TouchableOpacity style={styles.resolveButton} onPress={() => setResolveTarget(item)}>
              <Icon name="check-circle" size={17} color="#ffffff" />
              <Text style={styles.resolveButtonText}>Resolve Incident</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.viewButton} onPress={() => setSelectedReport(item)}>
            <Icon name="visibility" size={17} color={mobileTheme.purple} />
            <Text style={styles.viewButtonText}>View</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Reports</Text>
          <Text style={styles.subtitle}>Your submitted report history</Text>
        </View>
        <TouchableOpacity style={styles.submitButton} onPress={openSubmitForm}>
          <Icon name="add" size={19} color="#ffffff" />
          <Text style={styles.submitButtonText}>Submit</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.filters}>
        {(['all', 'incident', 'routine'] as const).map((item) => (
          <TouchableOpacity
            key={item}
            style={[styles.filterButton, filter === item && styles.filterButtonActive]}
            onPress={() => setFilter(item)}
          >
            <Text style={[styles.filterText, filter === item && styles.filterTextActive]}>{item}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filteredReports}
        keyExtractor={(item) => item.id}
        renderItem={renderReport}
        contentContainerStyle={styles.list}
        ListEmptyComponent={(
          <View style={styles.emptyState}>
            <Icon name="description" size={34} color={mobileTheme.textMuted} />
            <Text style={styles.emptyTitle}>No submitted reports</Text>
            <Text style={styles.emptyText}>Reports you submit will appear here.</Text>
          </View>
        )}
      />

      <Modal visible={formVisible} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modalScreen}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalTitle}>Submit Report</Text>
              <Text style={styles.modalSubtitle}>Record an incident or completed activity</Text>
            </View>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => {
                setBarangayPickerVisible(false);
                setFormVisible(false);
              }}
            >
              <Icon name="close" size={22} color={mobileTheme.text} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.form}>
            <Text style={styles.fieldLabel}>REPORT TYPE</Text>
            <View style={styles.typeOptions}>
              {reportTypes.map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[styles.typeOption, form.report_type === type && styles.typeOptionActive]}
                  onPress={() => updateForm('report_type', type)}
                >
                  <Text style={[styles.typeOptionText, form.report_type === type && styles.typeOptionTextActive]}>
                    {type}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>TITLE</Text>
            <TextInput style={styles.input} value={form.title} onChangeText={(value) => updateForm('title', value)} placeholder="Short report title" />

            <Text style={styles.fieldLabel}>TIME</Text>
            <View style={styles.autoField}>
              <Icon name="schedule" size={18} color={mobileTheme.purple} />
              <Text style={styles.autoFieldText}>
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

            <Text style={styles.fieldLabel}>ASSIGNED AREA</Text>
            <View style={styles.autoField}>
              <Icon name="assignment-ind" size={18} color={mobileTheme.purple} />
              <Text style={styles.autoFieldText}>
                {form.assigned_area || 'No active deployment assigned'}
              </Text>
            </View>

            <Text style={styles.fieldLabel}>BARANGAY</Text>
            <TouchableOpacity
              style={styles.selectField}
              onPress={() => setBarangayPickerVisible(true)}
            >
              <Icon name="map" size={18} color={mobileTheme.purple} />
              <Text style={[styles.autoFieldText, !form.barangay && styles.placeholderText]}>
                {form.barangay || 'Select a Cabagan barangay'}
              </Text>
              <Icon name="keyboard-arrow-down" size={21} color={mobileTheme.textMuted} />
            </TouchableOpacity>

            <Text style={styles.fieldLabel}>EXACT INCIDENT PLACE / LANDMARK</Text>
            <TextInput
              style={styles.input}
              value={form.location}
              onChangeText={updateManualLocation}
              placeholder="Example: Anao Public Market entrance"
            />
            <View style={styles.locationAssistRow}>
              <View style={styles.locationSource}>
                <Icon
                  name={form.location_source === 'gps' ? 'gps-fixed' : 'edit-location-alt'}
                  size={15}
                  color={mobileTheme.textMuted}
                />
                <Text style={styles.locationSourceText}>
                  {form.location_source === 'gps' ? 'Current GPS suggestion' : 'Manual incident location'}
                </Text>
              </View>
              <TouchableOpacity style={styles.gpsSuggestionButton} onPress={useCurrentGpsSuggestion}>
                <Icon name="my-location" size={16} color={mobileTheme.purple} />
                <Text style={styles.gpsSuggestionText}>Use current GPS</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.locationHelper}>
              Verify the actual incident place. Your current position may be different if you submit later.
            </Text>

            <Text style={styles.fieldLabel}>DESCRIPTION</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={form.description}
              onChangeText={(value) => updateForm('description', value)}
              placeholder="What happened and what action was taken?"
              multiline
              textAlignVertical="top"
            />

            {form.report_type === 'incident' && (
              <>
                <Text style={styles.fieldLabel}>SEVERITY</Text>
                <View style={styles.severityOptions}>
                  {[1, 2, 3, 4, 5].map((severity) => (
                    <TouchableOpacity
                      key={severity}
                      style={[styles.severityButton, form.severity === severity && styles.severityButtonActive]}
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

            <TouchableOpacity style={styles.primaryButton} onPress={handleSubmit} disabled={isSaving}>
              <Text style={styles.primaryButtonText}>{isSaving ? 'Submitting...' : 'Submit Report'}</Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <Modal visible={barangayPickerVisible} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.pickerModal}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Select Barangay</Text>
                <Text style={styles.modalSubtitle}>Official barangays of Cabagan only</Text>
              </View>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setBarangayPickerVisible(false)}
              >
                <Icon name="close" size={22} color={mobileTheme.text} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={[...CABAGAN_BARANGAYS]}
              keyExtractor={(barangay) => barangay}
              contentContainerStyle={styles.pickerList}
              renderItem={({ item }) => {
                const isSelected = form.barangay === item;
                return (
                  <TouchableOpacity
                    style={[styles.pickerOption, isSelected && styles.pickerOptionSelected]}
                    onPress={() => selectBarangay(item)}
                  >
                    <Text style={[
                      styles.pickerOptionText,
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
          </View>
        </View>
      </Modal>

      <Modal visible={Boolean(selectedReport)} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.detailModal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Report Details</Text>
              <TouchableOpacity style={styles.closeButton} onPress={() => setSelectedReport(null)}>
                <Icon name="close" size={22} color={mobileTheme.text} />
              </TouchableOpacity>
            </View>
            {selectedReport && (
              <ScrollView contentContainerStyle={styles.detailBody}>
                <Text style={styles.detailEyebrow}>{selectedReport.id}</Text>
                <Text style={styles.detailTitle}>{selectedReport.title}</Text>
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
                {selectedReport.resolution_notes && (
                  <Detail label="Resolution notes" value={selectedReport.resolution_notes} />
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={Boolean(resolveTarget)} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.resolveModal}>
            <Text style={styles.modalTitle}>Resolve Incident</Text>
            <Text style={styles.resolveCopy}>
              Confirm that {resolveTarget?.title} has been handled. This will update the web dashboard.
            </Text>
            <Text style={styles.fieldLabel}>RESOLUTION NOTES</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={resolutionNotes}
              onChangeText={setResolutionNotes}
              placeholder="Describe the action taken and outcome"
              multiline
              textAlignVertical="top"
            />
            <View style={styles.resolveActions}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setResolveTarget(null)}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.primaryButtonCompact} onPress={handleResolve} disabled={isSaving}>
                <Text style={styles.primaryButtonText}>{isSaving ? 'Saving...' : 'Confirm Resolve'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: mobileTheme.background },
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
    borderRadius: 22,
    backgroundColor: mobileTheme.purple,
    shadowColor: '#1c1c4d',
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
  filterButton: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: mobileTheme.purple,
    borderRadius: 22,
    backgroundColor: '#d9d7e2',
    shadowColor: '#1c1c4d',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 3,
  },
  filterButtonActive: { borderColor: mobileTheme.navy, backgroundColor: mobileTheme.surface },
  filterText: { color: mobileTheme.navy, fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  filterTextActive: { color: mobileTheme.navy },
  list: { paddingHorizontal: 22, paddingBottom: 112, gap: 13 },
  reportCard: {
    padding: 16,
    borderWidth: 2,
    borderRadius: 16,
    backgroundColor: mobileTheme.surface,
  },
  reportCardIncident: { borderColor: mobileTheme.danger },
  reportCardRoutine: { borderColor: mobileTheme.purple },
  reportTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  typeBadge: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 10 },
  incidentBadge: { backgroundColor: mobileTheme.dangerSoft },
  routineBadge: { backgroundColor: mobileTheme.blueSoft },
  typeBadgeText: { color: mobileTheme.text, fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  caseBadge: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 10 },
  openBadge: { backgroundColor: mobileTheme.warningSoft },
  resolvedBadge: { backgroundColor: mobileTheme.successSoft },
  caseBadgeText: { color: mobileTheme.text, fontSize: 10, fontWeight: '800', textTransform: 'capitalize' },
  reportTitle: { marginTop: 13, color: mobileTheme.text, fontSize: 16, fontWeight: '800' },
  reportMeta: { marginTop: 4, color: mobileTheme.textMuted, fontSize: 11 },
  locationRow: { marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 4 },
  locationText: { flex: 1, color: mobileTheme.textMuted, fontSize: 12 },
  reportActions: { marginTop: 14, flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  resolveButton: { minHeight: 42, paddingHorizontal: 11, flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: 21, backgroundColor: mobileTheme.success },
  resolveButtonText: { color: '#ffffff', fontSize: 11, fontWeight: '800' },
  viewButton: { minHeight: 42, minWidth: 90, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderWidth: 1.5, borderColor: mobileTheme.purple, borderRadius: 21, backgroundColor: mobileTheme.surface },
  viewButtonText: { color: mobileTheme.purple, fontSize: 11, fontWeight: '800' },
  emptyState: { paddingTop: 80, alignItems: 'center' },
  emptyTitle: { marginTop: 10, color: mobileTheme.text, fontSize: 15, fontWeight: '800' },
  emptyText: { marginTop: 4, color: mobileTheme.textMuted, fontSize: 12 },
  modalScreen: { flex: 1, backgroundColor: mobileTheme.background },
  modalHeader: { paddingHorizontal: 18, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: mobileTheme.border },
  modalTitle: { color: mobileTheme.text, fontSize: 19, fontWeight: '800' },
  modalSubtitle: { marginTop: 2, color: mobileTheme.textMuted, fontSize: 11 },
  closeButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: mobileTheme.border, borderRadius: 19, backgroundColor: mobileTheme.surface },
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
  locationHelper: { marginTop: 7, color: mobileTheme.textMuted, fontSize: 10, lineHeight: 15 },
  textArea: { minHeight: 110, paddingTop: 12 },
  severityOptions: { flexDirection: 'row', gap: 8 },
  severityButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: mobileTheme.border, borderRadius: 21, backgroundColor: mobileTheme.surface },
  severityButtonActive: { borderColor: mobileTheme.purple, backgroundColor: mobileTheme.purple },
  severityText: { color: mobileTheme.textMuted, fontWeight: '800' },
  severityTextActive: { color: '#ffffff' },
  primaryButton: { minHeight: 48, marginTop: 22, alignItems: 'center', justifyContent: 'center', borderRadius: 24, backgroundColor: mobileTheme.purple },
  primaryButtonCompact: { minHeight: 44, paddingHorizontal: 15, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: mobileTheme.success },
  primaryButtonText: { color: '#ffffff', fontSize: 13, fontWeight: '800' },
  overlay: { flex: 1, padding: 18, justifyContent: 'center', backgroundColor: 'rgba(15,23,42,0.55)' },
  pickerModal: { maxHeight: '82%', borderRadius: 20, backgroundColor: mobileTheme.surface, overflow: 'hidden' },
  pickerList: { padding: 10 },
  pickerOption: { minHeight: 46, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: mobileTheme.border },
  pickerOptionSelected: { borderRadius: 10, borderBottomColor: 'transparent', backgroundColor: mobileTheme.purpleSoft },
  pickerOptionText: { color: mobileTheme.text, fontSize: 13, fontWeight: '700' },
  pickerOptionTextSelected: { color: mobileTheme.purple },
  detailModal: { maxHeight: '82%', borderRadius: 20, backgroundColor: mobileTheme.surface, overflow: 'hidden' },
  detailBody: { padding: 18 },
  detailEyebrow: { color: mobileTheme.textMuted, fontSize: 10, fontWeight: '800' },
  detailTitle: { marginTop: 5, marginBottom: 12, color: mobileTheme.text, fontSize: 18, fontWeight: '800' },
  detailRow: { paddingVertical: 10, borderTopWidth: 1, borderTopColor: mobileTheme.border },
  detailLabel: { color: mobileTheme.textMuted, fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  detailValue: { marginTop: 4, color: mobileTheme.text, fontSize: 13, lineHeight: 19, textTransform: 'capitalize' },
  resolveModal: { padding: 18, borderRadius: 20, backgroundColor: mobileTheme.surface },
  resolveCopy: { marginTop: 7, color: mobileTheme.textMuted, fontSize: 12, lineHeight: 18 },
  resolveActions: { marginTop: 16, flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  cancelButton: { minHeight: 44, paddingHorizontal: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: mobileTheme.border, borderRadius: 22 },
  cancelButtonText: { color: mobileTheme.text, fontSize: 13, fontWeight: '800' },
});
