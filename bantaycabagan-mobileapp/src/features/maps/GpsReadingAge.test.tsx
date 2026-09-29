import React from 'react';
import { act, cleanup, render } from '@testing-library/react-native';
import { GpsReadingAge } from './GpsReadingAge';
import { getGpsReadingStatus } from '../../utils/gpsReading';

const fix = '2026-09-07T00:00:00.000Z';

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-09-07T00:00:29.000Z'));
});
afterEach(async () => {
  await cleanup();
  jest.restoreAllMocks();
  jest.useRealTimers();
});

it('ages without socket updates, flags delay at 30s, and clears it on a fresh fix', async () => {
  const intervals = jest.spyOn(globalThis, 'setInterval');
  const clearIntervalSpy = jest.spyOn(globalThis, 'clearInterval');
  const view = await render(<GpsReadingAge recordedAt={fix} />);
  const ageTimer = intervals.mock.results[intervals.mock.calls.findIndex((call) => call[1] === 1000)].value;
  expect(view.getByText('GPS reading: 29s ago')).toBeTruthy();
  await act(() => jest.advanceTimersByTime(1000));
  expect(view.getByText('GPS reading: 30s ago · Delayed')).toBeTruthy();
  await view.rerender(<GpsReadingAge recordedAt={fix} />);
  expect(view.getByText('GPS reading: 30s ago · Delayed')).toBeTruthy();
  await view.rerender(<GpsReadingAge recordedAt="2026-09-07T00:00:30.000Z" />);
  expect(view.getByText('GPS reading: 0s ago')).toBeTruthy();
  await view.unmount();
  expect(clearIntervalSpy).toHaveBeenCalledWith(ageTimer);
});

it('does not label missing or invalid GPS timestamps as fresh', () => {
  for (const value of [undefined, '', 'invalid', '2026-09-08T00:00:00.000Z']) {
    expect(getGpsReadingStatus(value).label).toBe('GPS reading: unavailable');
  }
  expect(getGpsReadingStatus(fix, new Date(fix).getTime() + 125_000).label)
    .toBe('GPS reading: 2m 5s ago · Delayed');
});

it('resets the compact deployment reading for a new shift', async () => {
  const view = await render(<GpsReadingAge
    recordedAt={fix}
    shiftStart="2026-09-07T00:01:00.000Z"
    compact
  />);
  expect(view.getByText('Awaiting GPS fix')).toBeTruthy();
  await view.rerender(<GpsReadingAge
    recordedAt="2026-09-07T00:01:00.000Z"
    shiftStart="2026-09-07T00:01:00.000Z"
    compact
  />);
  expect(view.getByText('Last GPS: 0s ago')).toBeTruthy();
  await view.rerender(<GpsReadingAge
    recordedAt="2026-09-07T00:00:00.000Z"
    shiftStart="2026-09-07T00:00:00.000Z"
    compact
  />);
  await act(() => jest.advanceTimersByTime(1000));
  expect(view.getByText('Last GPS: 30s ago')).toBeTruthy();
});
