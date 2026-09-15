import type { DeploymentAssignment, LivePersonnel } from '../../types/operations';
import {
  GPS_TRACKING_REMINDER_GRACE_MS,
  getGpsTrackingReminderState,
} from './gpsTrackingReminderState';

const shiftStartedAt = Date.parse('2026-09-15T00:00:00.000Z');
const assignment = {
  id: 'DEP-001', status: 'active', isCurrentShift: true,
  shiftStart: new Date(shiftStartedAt).toISOString(),
} as DeploymentAssignment;
const officer = {
  latitude: null, longitude: null, locationStatus: 'unavailable', isLocationStale: true,
} as LivePersonnel;

describe('GPS tracking reminder state', () => {
  it('waits for the two-minute deployment grace period', () => {
    expect(getGpsTrackingReminderState({
      assignment,
      officer,
      now: shiftStartedAt + GPS_TRACKING_REMINDER_GRACE_MS - 1,
    })).toBeNull();

    expect(getGpsTrackingReminderState({
      assignment,
      officer,
      now: shiftStartedAt + GPS_TRACKING_REMINDER_GRACE_MS,
    })).toEqual({
      kind: 'unavailable',
      statusText: 'No GPS location has been received for this active shift.',
    });
  });

  it('hides after a fresh GPS reading and identifies an old reading as stale', () => {
    const now = shiftStartedAt + GPS_TRACKING_REMINDER_GRACE_MS;
    const currentOfficer = {
      ...officer,
      latitude: 17.42,
      longitude: 121.77,
      locationRecordedAt: new Date(now - 30_000).toISOString(),
      locationStatus: 'current',
      isLocationStale: false,
      locationStaleAfterSeconds: 120,
    } as LivePersonnel;
    expect(getGpsTrackingReminderState({ assignment, officer: currentOfficer, now })).toBeNull();

    expect(getGpsTrackingReminderState({
      assignment,
      officer: {
        ...currentOfficer,
        locationRecordedAt: new Date(now - 121_000).toISOString(),
      },
      now,
    })).toEqual({ kind: 'stale', statusText: 'The last GPS update was 2m 1s ago.' });
  });
});
