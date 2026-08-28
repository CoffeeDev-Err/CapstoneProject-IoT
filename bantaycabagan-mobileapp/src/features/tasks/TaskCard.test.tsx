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
  required_responders: 2,
  accepted_by: [],
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
        currentPersonnelId="officer-1"
        expanded
        filterTranslateX={{ value: 0 } as never}
        onAccept={onAccept}
        onCancel={jest.fn()}
        onToggle={onToggle}
        task={task}
      />,
    );

    await fireEvent.press(view.getByText('Backup requested'));
    await fireEvent.press(view.getByText('Accept Task'));

    expect(onToggle).toHaveBeenCalledWith('task-1');
    expect(onAccept).toHaveBeenCalledWith(task);
  });
});
