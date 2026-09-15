import React from 'react';
import { render } from '@testing-library/react-native';
import type { DeploymentAssignment } from '../../types/operations';
import { UpcomingShiftCard } from './UpcomingShiftCard';

jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: { View },
    cancelAnimation: jest.fn(),
    Easing: { bezier: () => undefined },
    interpolate: (value: number) => value,
    useAnimatedStyle: (factory: () => object) => factory(),
    useSharedValue: (value: number) => ({ value }),
    withTiming: (value: number) => value,
  };
});

jest.mock('../../context/ThemeContext', () => ({
  useMobileTheme: () => ({ colors: { textMuted: '#64748b' }, isDark: false }),
}));

const deployment: DeploymentAssignment = {
  id: 'DEP-001',
  groupId: 'GROUP-001',
  personnelId: 'PNP-001',
  personnelName: 'Officer One',
  rank: 'Patrolman',
  patrolArea: 'Barangay Centro',
  shiftStart: '2026-09-16T00:00:00.000Z',
  shiftEnd: '2026-09-16T08:00:00.000Z',
  notes: 'Monitor the eastern checkpoint.',
  assignedAt: '2026-09-15T00:00:00.000Z',
  latitude: 17.42,
  longitude: 121.77,
  status: 'scheduled',
  isCurrentShift: false,
  acknowledged: false,
};

describe('UpcomingShiftCard', () => {
  it('shows deployment instructions in the expanded shift details', async () => {
    const view = await render(
      <UpcomingShiftCard
        expanded
        isLoading={false}
        onToggle={jest.fn()}
        upcomingDeployment={deployment}
      />,
    );

    expect(view.getByText('INSTRUCTIONS')).toBeTruthy();
    expect(view.getByText('Monitor the eastern checkpoint.')).toBeTruthy();
  });
});
