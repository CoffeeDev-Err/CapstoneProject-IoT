import { useState } from 'react';
import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { isCabaganBarangay } from '../../constants/cabaganBarangays';
import type {
  DeploymentAssignment,
  LivePersonnel,
  PoliceReport,
  ReportEvidenceInput,
  SubmitReportInput,
} from '../../types/operations';
import { discardTemporaryEvidence } from '../../services/offlineReportQueue';
import { selectPersonnelDeployment } from '../operations/operationalState';
import {
  createEmptyReportForm,
  getBarangayFromArea,
  type ReportForm,
} from './reportForm';

type SheetClose = (afterClose?: () => void) => void;

type Options = {
  currentPersonnelId: string;
  deployments: DeploymentAssignment[];
  personnel: LivePersonnel[];
  resolveReport: (reportId: string, resolutionNotes: string) => Promise<void>;
  submitReport: (input: SubmitReportInput) => Promise<'submitted' | 'queued'>;
};

export function useReportFormController({
  currentPersonnelId,
  deployments,
  personnel,
  resolveReport,
  submitReport,
}: Options) {
  const [formVisible, setFormVisible] = useState(false);
  const [form, setForm] = useState(createEmptyReportForm);
  const [barangayPickerVisible, setBarangayPickerVisible] = useState(false);
  const [locationPickerVisible, setLocationPickerVisible] = useState(false);
  const [selectedReport, setSelectedReport] = useState<PoliceReport | null>(null);
  const [resolveTarget, setResolveTarget] = useState<PoliceReport | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [evidencePhoto, setEvidencePhoto] = useState<ReportEvidenceInput | null>(null);

  const openSubmitForm = () => {
    const assignedArea = selectPersonnelDeployment(deployments, currentPersonnelId)?.patrolArea || '';
    setForm({
      ...createEmptyReportForm(),
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

  const updateForm = <Field extends keyof ReportForm>(field: Field, value: ReportForm[Field]) => {
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
      const result = await submitReport({
        ...form,
        ...(evidencePhoto && { evidence_photo: evidencePhoto }),
      });
      await discardTemporaryEvidence(evidencePhoto?.uri);
      setEvidencePhoto(null);
      setForm(createEmptyReportForm());
      close(() => Alert.alert(
        result === 'queued' ? 'Report saved offline' : 'Report submitted',
        result === 'queued'
          ? 'The report and its evidence are secured on this device and will synchronize automatically.'
          : form.report_type === 'incident'
            ? 'The incident is open and can now be resolved from Report History.'
            : 'The activity report was saved to your history.',
      ));
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

  return {
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
  };
}
