import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import type { DeploymentAssignment, LivePersonnel } from '../../types/operations';
import { GpsTrackingReminder } from './GpsTrackingReminder';

jest.mock('../../components/SwipeDismissSheet', () => {
  const ReactModule = require('react');
  const { View } = require('react-native');
  return {
    SwipeDismissSheet: ({ children, onClose, visible }: {
      children: React.ReactNode | ((controls: { close: () => void }) => React.ReactNode);
      onClose: () => void;
      visible: boolean;
    }) => visible
      ? ReactModule.createElement(View, {}, typeof children === 'function' ? children({ close: onClose }) : children)
      : null,
  };
});

jest.mock('../../context/ThemeContext', () => ({
  useMobileTheme: () => ({
    colors: {
      border: '#d7e0eb', danger: '#dc2626', surface: '#ffffff', surfaceMuted: '#f8fafc',
      text: '#0f172a', textMuted: '#64748b', warning: '#b45309', warningSoft: '#fffbeb',
    },
    isDark: false,
  }),
}));

describe('GpsTrackingReminder', () => {
  it('opens a modal with the tracker reminder from the compact map warning', async () => {
    const now = Date.now();
    const assignment = {
      id: 'DEP-001', status: 'active', isCurrentShift: true, acknowledged: true,
      shiftStart: new Date(now - 3 * 60_000).toISOString(),
    } as DeploymentAssignment;
    const officer = {
      latitude: null, longitude: null, locationStatus: 'unavailable', isLocationStale: true,
    } as LivePersonnel;
    const view = await render(
      <GpsTrackingReminder
        assignment={assignment}
        isConnected
        officer={officer}
        onRefresh={jest.fn().mockResolvedValue(undefined)}
      />,
    );

    await fireEvent.press(view.getByLabelText('GPS tracking unavailable. View reminder'));

    expect(view.getByText('GPS Tracking Required')).toBeTruthy();
    expect(view.getByText('REMINDER')).toBeTruthy();
    expect(view.getByText(/Keep your assigned GPS tracker powered on, charged/)).toBeTruthy();
    expect(view.getByText('Check Again')).toBeTruthy();
  });
});
