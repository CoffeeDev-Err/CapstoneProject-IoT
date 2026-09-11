import { act, renderHook, waitFor } from '@testing-library/react-native';

import { loadReportDraft } from '../../services/offlineReportQueue';
import { useReportDraftReminder } from './useReportDraftReminder';

jest.mock('../../services/offlineReportQueue', () => ({ loadReportDraft: jest.fn() }));

beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(loadReportDraft).mockResolvedValue(null);
});

it('shows a reminder when the signed-in officer has an unfinished report', async () => {
  jest.mocked(loadReportDraft).mockResolvedValueOnce({
    form: {
      report_type: 'incident',
      title: 'Unfinished incident',
      description: 'Draft details',
      location: 'Cabagan',
      barangay: 'Catabayungan',
      severity: 2,
    },
    evidencePhoto: null,
    updatedAt: '2026-09-11T08:00:00.000Z',
  });

  const { result } = await renderHook(() => useReportDraftReminder('officer-one'));
  await waitFor(() => expect(result.current.visible).toBe(true));
  expect(loadReportDraft).toHaveBeenCalledWith('officer-one');

  await act(() => result.current.dismiss());
  expect(result.current.visible).toBe(false);
});

it('does not interrupt startup when no unfinished report exists', async () => {
  const { result } = await renderHook(() => useReportDraftReminder('officer-one'));
  await waitFor(() => expect(loadReportDraft).toHaveBeenCalledWith('officer-one'));
  expect(result.current.visible).toBe(false);
});
