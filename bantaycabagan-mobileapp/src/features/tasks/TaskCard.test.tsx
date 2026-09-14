import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import type { OperationalTask } from '../../types/operations';
import { TaskCard } from './TaskCard';

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
  useMobileTheme: () => ({
    colors: { textMuted: '#64748b' },
    isDark: false,
  }),
}));

const task: OperationalTask = {
  id: 'task-1',
  type: 'backup',
  title: 'Backup requested',
  description: 'Assist the patrol team.',
  location: 'Centro, Cabagan',
  latitude: 17.42,
  longitude: 121.77,
  requested_by: 'officer-2',
  requester_name: 'Officer Two',
  assigned_area: 'Centro',
  required_responders: 2,
  accepted_by: [],
  responders: [],
  status: 'open',
  created_at: '2026-08-28T08:00:00.000Z',
};

describe('TaskCard', () => {
  it('routes expansion and acceptance actions to the screen controller', async () => {
    const onAccept = jest.fn();
    const onToggle = jest.fn();
    const view = await render(
      <TaskCard
        accepting={false}
        cancelling={false}
        completing={false}
        currentPersonnelId="officer-1"
        expanded
        filterTranslateX={{ value: 0 } as never}
        onAccept={onAccept}
        onCancel={jest.fn()}
        onComplete={jest.fn()}
        onCreateReport={jest.fn()}
        onOpenReport={jest.fn()}
        onToggle={onToggle}
        task={task}
      />,
    );

    await fireEvent.press(view.getByText('Backup requested'));
    await fireEvent.press(view.getByText('Accept Task'));

    expect(onToggle).toHaveBeenCalledWith('task-1');
    expect(onAccept).toHaveBeenCalledWith(task);
  });

  it('lets the requester close an active backup response', async () => {
    const onCancel = jest.fn();
    const onComplete = jest.fn();
    const ownTask = {
      ...task,
      requested_by: 'officer-1',
      accepted_by: ['officer-2'],
      responders: [{
        personnel_id: 'officer-2',
        name: 'Officer Two',
        rank: 'PO1',
        badge_number: '1002',
        accepted_at: '2026-08-28T08:05:00.000Z',
        arrived_at: '2026-08-28T08:10:00.000Z',
      }],
    };
    const view = await render(
      <TaskCard
        accepting={false}
        cancelling={false}
        completing={false}
        currentPersonnelId="officer-1"
        expanded
        filterTranslateX={{ value: 0 } as never}
        onAccept={jest.fn()}
        onCancel={onCancel}
        onComplete={onComplete}
        onCreateReport={jest.fn()}
        onOpenReport={jest.fn()}
        onToggle={jest.fn()}
        task={ownTask}
      />,
    );

    await fireEvent.press(view.getByText('Complete Response'));
    expect(onComplete).toHaveBeenCalledWith(ownTask);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('offers one report action after the requester completes the backup', async () => {
    const onCreateReport = jest.fn();
    const completedTask = {
      ...task,
      requested_by: 'officer-1',
      status: 'completed' as const,
      completed_at: '2026-08-28T08:15:00.000Z',
    };
    const view = await render(
      <TaskCard
        accepting={false}
        cancelling={false}
        completing={false}
        currentPersonnelId="officer-1"
        expanded
        filterTranslateX={{ value: 0 } as never}
        onAccept={jest.fn()}
        onCancel={jest.fn()}
        onComplete={jest.fn()}
        onCreateReport={onCreateReport}
        onOpenReport={jest.fn()}
        onToggle={jest.fn()}
        task={completedTask}
      />,
    );

    await fireEvent.press(view.getByText('Create Incident Report'));
    expect(onCreateReport).toHaveBeenCalledWith(completedTask);
  });

  it('opens the linked incident report instead of creating another one', async () => {
    const onOpenReport = jest.fn();
    const completedTask = {
      ...task,
      requested_by: 'officer-1',
      status: 'completed' as const,
      completed_at: '2026-08-28T08:15:00.000Z',
      report_id: 'RPT-2026-LINKED01',
    };
    const view = await render(
      <TaskCard
        accepting={false}
        cancelling={false}
        completing={false}
        currentPersonnelId="officer-1"
        expanded
        filterTranslateX={{ value: 0 } as never}
        onAccept={jest.fn()}
        onCancel={jest.fn()}
        onComplete={jest.fn()}
        onCreateReport={jest.fn()}
        onOpenReport={onOpenReport}
        onToggle={jest.fn()}
        task={completedTask}
      />,
    );

    await fireEvent.press(view.getByText('View Incident Report'));
    expect(onOpenReport).toHaveBeenCalledWith('RPT-2026-LINKED01');
  });

  it('shows that arrival is detected automatically for an accepted responder', async () => {
    const acceptedTask = {
      ...task,
      accepted_by: ['officer-1'],
      responders: [{
        personnel_id: 'officer-1',
        name: 'Officer One',
        rank: 'PO1',
        badge_number: '1001',
        accepted_at: '2026-08-28T08:05:00.000Z',
      }],
    };
    const view = await render(
      <TaskCard
        accepting={false}
        cancelling={false}
        completing={false}
        currentPersonnelId="officer-1"
        expanded
        filterTranslateX={{ value: 0 } as never}
        onAccept={jest.fn()}
        onCancel={jest.fn()}
        onComplete={jest.fn()}
        onCreateReport={jest.fn()}
        onOpenReport={jest.fn()}
        onToggle={jest.fn()}
        task={acceptedTask}
      />,
    );

    expect(view.getByText('Responding')).toBeTruthy();
    expect(view.getByText('Waiting for GPS Arrival')).toBeTruthy();
    expect(view.getByText('Updates automatically near the request point')).toBeTruthy();
  });

  it('waits for a verified arrival before the requester can complete', async () => {
    const onComplete = jest.fn();
    const view = await render(
      <TaskCard
        accepting={false}
        cancelling={false}
        completing={false}
        currentPersonnelId="officer-1"
        expanded
        filterTranslateX={{ value: 0 } as never}
        onAccept={jest.fn()}
        onCancel={jest.fn()}
        onComplete={onComplete}
        onCreateReport={jest.fn()}
        onOpenReport={jest.fn()}
        onToggle={jest.fn()}
        task={{ ...task, requested_by: 'officer-1' }}
      />,
    );

    await fireEvent.press(view.getByText('Waiting for Arrival'));
    expect(onComplete).not.toHaveBeenCalled();
  });
});
