import { act, renderHook } from '@testing-library/react-native';
import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useReportFormController } from './useReportFormController';
import type { LivePersonnel, PoliceReport } from '../../types/operations';
jest.mock('expo-image-picker', () => ({ requestCameraPermissionsAsync: jest.fn(), launchCameraAsync: jest.fn(), CameraType: { back: 'back', front: 'front' } }));
jest.mock('../../services/offlineReportQueue', () => ({ discardTemporaryEvidence: jest.fn(async () => {}) }));
const options = { currentPersonnelId: 'one', deployments: [], personnel: [], resolveReport: jest.fn(), submitReport: jest.fn() };
beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.mocked(ImagePicker.requestCameraPermissionsAsync).mockResolvedValue({ granted: true } as Awaited<ReturnType<typeof ImagePicker.requestCameraPermissionsAsync>>);
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

const liveOfficer = { id: 'one', latitude: 17.4305, longitude: 121.765, locationName: 'Eastern, Catabayungan, Cabagan', locationStatus: 'current', isLocationStale: false, locationRecordedAt: new Date().toISOString() } as LivePersonnel;
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
  expect(Alert.alert).toHaveBeenCalledWith('Select the incident barangay', expect.any(String));
  await act(() => { result.current.selectBarangay('Catabayungan'); result.current.updateManualLocation('ISU entrance'); });
  expect(result.current.form).toMatchObject({ barangay: 'Catabayungan', latitude: 17.4305, longitude: 121.765 });
});
it('blocks stale GPS and rejects outside coordinates even with a Cabagan address label', async () => {
  for (const member of [{ ...liveOfficer, isLocationStale: true }, { ...liveOfficer, latitude: 14.6, longitude: 121 },
    { ...liveOfficer, locationRecordedAt: new Date(Date.now() - 35_000).toISOString(), locationStaleAfterSeconds: 30 }]) {
    const { result, unmount } = await renderHook(() => useReportFormController({ ...options, personnel: [member] }));
    await act(() => result.current.useCurrentGpsSuggestion());
    expect(result.current.form.latitude).toBeUndefined();
    await unmount();
  }
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
it('keeps an incomplete report open and explains which required fields are missing', async () => {
  const submitReport = jest.fn();
  const close = jest.fn();
  const { result } = await renderHook(() => useReportFormController({ ...options, submitReport }));
  await act(() => result.current.openSubmitForm());
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
  await act(() => {
    result.current.openSubmitForm();
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
