import { act, renderHook } from '@testing-library/react-native';
import { Alert, AppState } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useReportFormController } from './useReportFormController';
import type { DeploymentAssignment, LivePersonnel, OperationalTask, PoliceReport } from '../../types/operations';
import {
  clearReportDraft,
	discardTemporaryEvidence,
  loadReportDraft,
  saveReportDraft,
} from '../../services/offlineReportQueue';
jest.mock('expo-image-picker', () => ({ requestCameraPermissionsAsync: jest.fn(), launchCameraAsync: jest.fn(), CameraType: { back: 'back', front: 'front' } }));
jest.mock('../../services/offlineReportQueue', () => ({
  clearReportDraft: jest.fn(async () => {}),
  discardTemporaryEvidence: jest.fn(async () => {}),
  loadReportDraft: jest.fn(async () => null),
  saveReportDraft: jest.fn(async (_personnelId, form, evidencePhoto) => ({
    form,
    evidencePhoto,
    updatedAt: new Date().toISOString(),
  })),
}));
const options = { currentPersonnelId: 'one', deployments: [], personnel: [], resolveReport: jest.fn(), submitReport: jest.fn() };
beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.mocked(ImagePicker.requestCameraPermissionsAsync).mockResolvedValue({ granted: true } as Awaited<ReturnType<typeof ImagePicker.requestCameraPermissionsAsync>>);
  jest.mocked(loadReportDraft).mockResolvedValue(null);
  jest.mocked(saveReportDraft).mockImplementation(async (_personnelId, form, evidencePhoto) => ({
    form,
    evidencePhoto,
    updatedAt: new Date().toISOString(),
  }));
  jest.mocked(clearReportDraft).mockResolvedValue(undefined);
});
afterEach(() => jest.restoreAllMocks());
it('reports a camera launch failure without losing the report form', async () => {
  jest.mocked(ImagePicker.launchCameraAsync).mockRejectedValueOnce(new Error('Camera busy'));
  const { result } = await renderHook(() => useReportFormController(options));
  await act(async () => { result.current.updateForm('title', 'Incident draft'); result.current.chooseEvidenceCamera(); });
  const button = jest.mocked(Alert.alert).mock.calls[0][2]?.[0];
  await act(async () => { await button?.onPress?.(); });
  expect(Alert.alert).toHaveBeenLastCalledWith('Camera unavailable', expect.stringMatching(/try again/));
  expect(result.current.form.title).toBe('Incident draft');
  expect(result.current.evidencePhoto).toBeNull();
});
it('keeps cancelling the camera silent', async () => {
  jest.mocked(ImagePicker.launchCameraAsync).mockResolvedValueOnce({ canceled: true, assets: null });
  const { result } = await renderHook(() => useReportFormController(options));
  await act(async () => { result.current.chooseEvidenceCamera(); });
  const button = jest.mocked(Alert.alert).mock.calls[0][2]?.[0];
  await act(async () => { await button?.onPress?.(); });
  expect(Alert.alert).toHaveBeenCalledTimes(1);
});

it('secures captured evidence in the draft immediately', async () => {
  jest.mocked(ImagePicker.launchCameraAsync).mockResolvedValueOnce({
    canceled: false,
    assets: [{ uri: 'file:///cache/ImagePicker/evidence.jpg', mimeType: 'image/jpeg', fileName: 'evidence.jpg' }],
  } as Awaited<ReturnType<typeof ImagePicker.launchCameraAsync>>);
  const { result } = await renderHook(() => useReportFormController(options));
  await act(async () => { await result.current.openSubmitForm(); });
  await act(() => result.current.chooseEvidenceCamera());
  const backCameraButton = jest.mocked(Alert.alert).mock.calls[0][2]?.[0];

  await act(async () => { await backCameraButton?.onPress?.(); });

  expect(saveReportDraft).toHaveBeenCalledWith(
    'one',
    expect.any(Object),
    expect.objectContaining({ uri: 'file:///cache/ImagePicker/evidence.jpg', camera_facing: 'back' }),
  );
});

const liveOfficer = { id: 'one', latitude: 17.4305, longitude: 121.765, locationName: 'Eastern, Catabayungan, Cabagan', status: 'On Duty', isOnDuty: true, locationStatus: 'current', isLocationStale: false, locationRecordedAt: new Date().toISOString() } as LivePersonnel;
it('uses valid inside-Cabagan GPS even when the barangay follows a locality prefix', async () => {
  const { result } = await renderHook(() => useReportFormController({ ...options, personnel: [liveOfficer] }));
  await act(() => result.current.useCurrentGpsSuggestion());
  expect(result.current.form).toMatchObject({ barangay: 'Catabayungan', location_source: 'gps', latitude: 17.4305, longitude: 121.765 });
  expect(Alert.alert).not.toHaveBeenCalled();
});
it('keeps valid coordinates when the address is unknown and the officer selects a barangay', async () => {
  const { result } = await renderHook(() => useReportFormController({ ...options, personnel: [{ ...liveOfficer, locationName: 'GPS 17.43050, 121.76500' }] }));
  await act(() => result.current.useCurrentGpsSuggestion());
  expect(result.current.barangayPickerVisible).toBe(true);
  expect(Alert.alert).toHaveBeenCalledWith(
    'Barangay confirmation needed',
    expect.stringContaining('Current GPS coordinates were added'),
  );
  await act(() => { result.current.selectBarangay('Catabayungan'); result.current.updateManualLocation('ISU entrance'); });
  expect(result.current.form).toMatchObject({ barangay: 'Catabayungan', location_source: 'gps', latitude: 17.4305, longitude: 121.765 });
});
it('uses an inside-Cabagan map pin and identifies it as a manual map selection', async () => {
  const { result } = await renderHook(() => useReportFormController(options));
  await act(() => result.current.setLocationPickerVisible(true));
  await act(() => result.current.usePinnedLocation({ latitude: 17.4305, longitude: 121.765 }));
  expect(result.current.form).toMatchObject({ location_source: 'manual', latitude: 17.4305, longitude: 121.765 });
  expect(result.current.locationPickerVisible).toBe(false);
  expect(Alert.alert).not.toHaveBeenCalled();
});
it('keeps the map picker open when the selected incident point is outside Cabagan', async () => {
  const { result } = await renderHook(() => useReportFormController(options));
  await act(() => result.current.setLocationPickerVisible(true));
  await act(() => result.current.usePinnedLocation({ latitude: 14.6, longitude: 121 }));
  expect(result.current.form.latitude).toBeUndefined();
  expect(result.current.locationPickerVisible).toBe(true);
  expect(Alert.alert).toHaveBeenLastCalledWith(
    'Selected point is outside Cabagan',
    'Place the pin on the actual incident location within Cabagan.',
  );
});
it('explains when no GPS reading is available for the current account', async () => {
  const { result } = await renderHook(() => useReportFormController(options));
  await act(() => result.current.useCurrentGpsSuggestion());
  expect(result.current.form.latitude).toBeUndefined();
  expect(Alert.alert).toHaveBeenLastCalledWith(
    'Current GPS unavailable',
    expect.stringContaining('No GPS reading is available for your account'),
  );
});
it('explains that current GPS is inactive when an off-duty officer creates a report', async () => {
  const offDutyOfficer = {
    ...liveOfficer,
    status: 'Off Duty',
    isOnDuty: false,
    locationStatus: 'unavailable' as const,
    isLocationStale: true,
  };
  const { result } = await renderHook(() => useReportFormController({ ...options, personnel: [offDutyOfficer] }));
  await act(() => result.current.useCurrentGpsSuggestion());
  expect(result.current.form.latitude).toBeUndefined();
  expect(Alert.alert).toHaveBeenLastCalledWith(
    'GPS tracking is not active',
    expect.stringContaining('because you are off duty and tracking is inactive'),
  );
});
it('explains the age of a stale GPS reading and keeps it out of the report', async () => {
  jest.spyOn(Date, 'now').mockReturnValue(new Date('2026-09-12T10:00:35.000Z').getTime());
  const member = {
    ...liveOfficer,
    locationRecordedAt: '2026-09-12T10:00:00.000Z',
    locationStaleAfterSeconds: 30,
  };
  const { result } = await renderHook(() => useReportFormController({ ...options, personnel: [member] }));
  await act(() => result.current.useCurrentGpsSuggestion());
  expect(result.current.form.latitude).toBeUndefined();
  expect(Alert.alert).toHaveBeenLastCalledWith(
    'GPS reading is outdated',
    expect.stringContaining('It was recorded 35 seconds ago'),
  );
});
it('explains why a current position outside Cabagan cannot be used', async () => {
  const { result } = await renderHook(() => useReportFormController({ ...options, personnel: [{ ...liveOfficer, latitude: 14.6, longitude: 121 }] }));
  await act(() => result.current.useCurrentGpsSuggestion());
  expect(result.current.form.latitude).toBeUndefined();
  expect(Alert.alert).toHaveBeenLastCalledWith(
    'Current GPS is outside Cabagan',
    expect.stringContaining('outside the Cabagan service area'),
  );
});
it('rejects GPS coordinates that have no trustworthy reading time', async () => {
  const { result } = await renderHook(() => useReportFormController({ ...options, personnel: [{ ...liveOfficer, locationRecordedAt: 'invalid' }] }));
  await act(() => result.current.useCurrentGpsSuggestion());
  expect(result.current.form.latitude).toBeUndefined();
  expect(Alert.alert).toHaveBeenLastCalledWith(
    'GPS reading is invalid',
    expect.stringContaining('valid reading time'),
  );
});
it('submits corrections to the edit endpoint with original revision, without a new/offline submission', async () => {
  const editReport = jest.fn(async (_id: string, _input: Record<string, unknown>) => ({} as PoliceReport));
  const report = { id: 'RPT-ONE', title: 'Title', description: 'Description', location: 'ISU', barangay: 'Catabayungan', severity: 2,
    report_type: 'incident', occurred_at: new Date().toISOString(), assigned_area: 'Original area', revision: 4, validation_status: 'validated' } as PoliceReport;
  const { result } = await renderHook(() => useReportFormController({ ...options, editReport }));
  await act(() => { result.current.openEditForm(report); });
  await act(() => { result.current.updateForm('description', 'Corrected'); result.current.setEditReason('Typo'); });
  await act(async () => { await result.current.handleSubmit(jest.fn()); });
  expect(editReport).toHaveBeenCalledWith('RPT-ONE', expect.objectContaining({ revision: 4, description: 'Corrected', reason: 'Typo' }));
  expect(editReport.mock.calls[0][1]).not.toHaveProperty('assigned_area');
  expect(options.submitReport).not.toHaveBeenCalled();
});
it('uploads a new correction photo and cleans its temporary file after success', async () => {
  const editReport = jest.fn(async (_id: string, _input: Record<string, unknown>) => ({} as PoliceReport));
  const report = { id: 'RPT-PHOTO', title: 'Title', description: 'Description', location: 'ISU', barangay: 'Catabayungan', severity: 2,
    report_type: 'incident', occurred_at: new Date().toISOString(), assigned_area: 'Original area', revision: 2, validation_status: 'validated',
    evidence_photo: { url: '/original.jpg', mime_type: 'image/jpeg', size: 100, camera_facing: 'back', captured_at: new Date().toISOString() } } as PoliceReport;
  const correctionPhoto = { uri: 'file:///cache/corrected.jpg', name: 'corrected.jpg', type: 'image/jpeg', camera_facing: 'back' as const, captured_at: new Date().toISOString() };
  const { result } = await renderHook(() => useReportFormController({ ...options, editReport }));
  await act(() => { result.current.openEditForm(report); });
  await act(() => { result.current.setEvidencePhoto(correctionPhoto); result.current.setEditReason('The original photo showed the wrong entrance'); });
  await act(async () => { await result.current.handleSubmit(jest.fn()); });
  expect(editReport).toHaveBeenCalledWith('RPT-PHOTO', expect.objectContaining({
    revision: 2,
    evidence_photo: correctionPhoto,
  }));
  expect(discardTemporaryEvidence).toHaveBeenCalledWith(correctionPhoto.uri);
});
it('keeps an incomplete report open and explains which required fields are missing', async () => {
  const submitReport = jest.fn();
  const close = jest.fn();
  const { result } = await renderHook(() => useReportFormController({ ...options, submitReport }));
  await act(async () => { await result.current.openSubmitForm(); });
  await act(() => result.current.updateForm('title', 'Draft title'));
  await act(async () => { await result.current.handleSubmit(close); });
  expect(Alert.alert).toHaveBeenLastCalledWith(
    'Complete the report',
    'Title, description, location, and barangay are required.',
  );
  expect(result.current.form.title).toBe('Draft title');
  expect(submitReport).not.toHaveBeenCalled();
  expect(close).not.toHaveBeenCalled();
});
it('prevents two simultaneous form submissions from creating duplicate reports', async () => {
  let finishUpload: ((value: 'submitted') => void) | undefined;
  const submitReport = jest.fn(() => new Promise<'submitted'>((resolve) => { finishUpload = resolve; }));
  const { result } = await renderHook(() => useReportFormController({ ...options, submitReport }));
  await act(async () => {
    await result.current.openSubmitForm();
    result.current.updateForm('title', 'Patrol observation');
    result.current.updateForm('description', 'Observed during patrol.');
    result.current.updateForm('location', 'ISU Cabagan entrance');
    result.current.updateForm('barangay', 'Catabayungan');
  });
  const close = jest.fn();
  let first: Promise<void>;
  await act(async () => {
    first = result.current.handleSubmit(close);
    await result.current.handleSubmit(close);
    expect(submitReport).toHaveBeenCalledTimes(1);
    finishUpload?.('submitted');
    await first;
  });
  expect(submitReport).toHaveBeenCalledTimes(1);
});

it('restores the officer report draft after the form is reopened', async () => {
  jest.mocked(loadReportDraft).mockResolvedValueOnce({
    form: {
      report_type: 'patrol',
      title: 'Recovered patrol draft',
      description: 'Last typed description',
      location: 'ISU Cabagan gate',
      barangay: 'Catabayungan',
      severity: 2,
      occurred_at: '2026-09-11T08:00:00.000Z',
      assigned_area: 'Catabayungan',
      location_source: 'manual',
    },
    evidencePhoto: null,
    updatedAt: '2026-09-11T08:01:00.000Z',
  });
  const { result } = await renderHook(() => useReportFormController(options));

  await act(async () => { await result.current.openSubmitForm(); });

  expect(result.current.form).toMatchObject({
    report_type: 'patrol',
    title: 'Recovered patrol draft',
    description: 'Last typed description',
    location: 'ISU Cabagan gate',
    barangay: 'Catabayungan',
  });
});

it('keeps the assigned area locked to the officer deployment', async () => {
  const deployment: DeploymentAssignment = {
    id: 'DEP-CURRENT',
    groupId: 'GROUP-ONE',
    personnelId: 'one',
    personnelName: 'Officer One',
    rank: 'Police Corporal',
    patrolArea: 'Catabayungan Patrol Area',
    assignedAt: '2026-09-22T00:00:00.000Z',
    latitude: 17.4305,
    longitude: 121.765,
    status: 'active',
    isCurrentShift: true,
    acknowledged: true,
  };
  jest.mocked(loadReportDraft).mockResolvedValueOnce({
    form: {
      report_type: 'patrol',
      title: 'Patrol observation',
      description: 'Routine patrol completed.',
      location: 'Public market entrance',
      barangay: 'Catabayungan',
      severity: 2,
      occurred_at: new Date(Date.now() - 60_000).toISOString(),
      assigned_area: 'Old deployment area',
      location_source: 'manual',
    },
    evidencePhoto: null,
    updatedAt: '2026-09-22T01:05:00.000Z',
  });
  const submitReport = jest.fn(async () => 'submitted' as const);
  const { result } = await renderHook(() => useReportFormController({
    ...options,
    deployments: [deployment],
    submitReport,
  }));

  await act(async () => { await result.current.openSubmitForm(); });
  expect(result.current.form.assigned_area).toBe('Catabayungan Patrol Area');

  await act(() => result.current.updateForm('assigned_area', 'Manually changed area'));
  expect(result.current.form.assigned_area).toBe('Catabayungan Patrol Area');

  await act(async () => { await result.current.handleSubmit(jest.fn()); });
  expect(submitReport).toHaveBeenCalledWith(expect.objectContaining({
    assigned_area: 'Catabayungan Patrol Area',
  }));
});

const completedBackupTask: OperationalTask = {
  id: 'TSK-2026-BACKUP1',
  type: 'backup',
  title: 'Immediate assistance needed',
  description: 'Backup requested during patrol.',
  location: 'Catabayungan Public Market',
  latitude: 17.4305,
  longitude: 121.765,
  requested_by: 'one',
  requester_name: 'Officer One',
  assigned_area: 'Catabayungan',
  required_responders: 3,
  accepted_by: ['two'],
  responders: [{
    personnel_id: 'two', name: 'Responder Two', rank: 'Police Corporal',
    badge_number: '12002', accepted_at: '2026-09-11T08:02:00.000Z',
  }],
  status: 'completed',
  created_at: '2026-09-11T08:00:00.000Z',
  completed_at: '2026-09-11T08:10:00.000Z',
};

it('prefills a completed backup report from its immutable task context', async () => {
  const { result } = await renderHook(() => useReportFormController(options));

  await act(async () => { await result.current.openSubmitForm(completedBackupTask); });

  expect(result.current.form).toMatchObject({
    backup_task_id: completedBackupTask.id,
    report_type: 'incident',
    barangay: 'Catabayungan',
    location: 'Catabayungan Public Market',
    location_source: 'backup_request',
    latitude: 17.4305,
    longitude: 121.765,
  });
  expect(result.current.form.backup_context?.responders[0].name).toBe('Responder Two');
});

it('does not attach an unrelated saved draft to the selected backup task', async () => {
  jest.mocked(loadReportDraft).mockResolvedValueOnce({
    form: {
      report_type: 'patrol', title: 'Existing patrol draft', description: 'Unfinished patrol.',
      location: 'ISU gate', barangay: 'Catabayungan', severity: 2,
      occurred_at: '2026-09-11T07:00:00.000Z', assigned_area: 'Catabayungan', location_source: 'manual',
    },
    evidencePhoto: null,
    updatedAt: '2026-09-11T07:05:00.000Z',
  });
  const { result } = await renderHook(() => useReportFormController(options));

  await act(async () => { await result.current.openSubmitForm(completedBackupTask); });

  expect(result.current.form.title).toBe('Existing patrol draft');
  expect(result.current.form.backup_task_id).toBeUndefined();
  expect(result.current.form.backup_context).toBeUndefined();
  expect(Alert.alert).toHaveBeenCalledWith('Unfinished report opened', expect.stringContaining('Task History'));
});

it('saves the latest unfinished fields immediately when the report sheet closes', async () => {
  const { result } = await renderHook(() => useReportFormController(options));
  await act(async () => { await result.current.openSubmitForm(); });
  await act(() => {
    result.current.updateForm('title', 'Power interruption draft');
    result.current.updateForm('description', 'Preserve this text');
  });

  await act(async () => {
    result.current.closeReportForm();
    await Promise.resolve();
  });

  expect(saveReportDraft).toHaveBeenCalledWith(
    'one',
    expect.objectContaining({
      title: 'Power interruption draft',
      description: 'Preserve this text',
    }),
    null,
  );
});

it('permanently removes a new report draft only after explicit discard confirmation', async () => {
  const close = jest.fn();
  const { result } = await renderHook(() => useReportFormController(options));
  await act(async () => { await result.current.openSubmitForm(); });
  await act(() => result.current.updateForm('title', 'Report to discard'));

  await act(() => result.current.confirmCancelReportForm(close));
  const buttons = jest.mocked(Alert.alert).mock.calls.at(-1)?.[2];
  const discardButton = buttons?.find((button) => button.text === 'Discard Report');
  expect(close).not.toHaveBeenCalled();

  await act(async () => { await discardButton?.onPress?.(); });

  expect(clearReportDraft).toHaveBeenCalledWith('one');
  expect(result.current.form.title).toBe('');
  expect(close).toHaveBeenCalledTimes(1);
});

it('discards correction edits while leaving the original report unchanged', async () => {
  const editReport = jest.fn(async (_id: string, _input: Record<string, unknown>) => ({} as PoliceReport));
  const close = jest.fn();
  const report = { id: 'RPT-ONE', title: 'Original title', description: 'Description', location: 'ISU', barangay: 'Catabayungan', severity: 2,
    report_type: 'incident', occurred_at: new Date().toISOString(), assigned_area: 'Original area', revision: 4, validation_status: 'validated' } as PoliceReport;
  const { result } = await renderHook(() => useReportFormController({ ...options, editReport }));
  await act(() => result.current.openEditForm(report));
  await act(() => result.current.updateForm('title', 'Unsaved correction'));

  await act(() => result.current.confirmCancelReportForm(close));
  const buttons = jest.mocked(Alert.alert).mock.calls.at(-1)?.[2];
  const discardButton = buttons?.find((button) => button.text === 'Discard Changes');
  await act(async () => { await discardButton?.onPress?.(); });

  expect(result.current.editTarget).toBeNull();
  expect(result.current.form.title).toBe('');
  expect(editReport).not.toHaveBeenCalled();
  expect(clearReportDraft).not.toHaveBeenCalled();
  expect(close).toHaveBeenCalledTimes(1);
});

it('flushes the unfinished report when Android moves the app to the background', async () => {
  let onAppStateChange: ((state: 'background') => void) | undefined;
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_event, listener) => {
    onAppStateChange = listener as (state: 'background') => void;
    return { remove: jest.fn() };
  }) as typeof AppState.addEventListener);
  const { result } = await renderHook(() => useReportFormController(options));
  await act(async () => { await result.current.openSubmitForm(); });
  await act(() => result.current.updateForm('description', 'Save before power interruption'));

  await act(async () => {
    onAppStateChange?.('background');
    await Promise.resolve();
  });

  expect(saveReportDraft).toHaveBeenCalledWith(
    'one',
    expect.objectContaining({ description: 'Save before power interruption' }),
    null,
  );
});
