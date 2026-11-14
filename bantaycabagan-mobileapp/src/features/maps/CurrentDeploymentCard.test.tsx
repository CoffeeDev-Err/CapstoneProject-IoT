import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { CurrentDeploymentCard } from './CurrentDeploymentCard';
import type { DeploymentAssignment } from '../../types/operations';

jest.mock('../../context/ThemeContext', () => ({
  useMobileTheme: () => ({ colors: { surface: '#fff', border: '#cbd5e1', blue: '#2563eb', blueSoft: '#dbeafe', text: '#0f172a', textMuted: '#64748b' } }),
}));

const assignment = { patrolArea: 'Market patrol', deploymentType: 'area', scheduleBlocks: [
  { label: 'Market' }, { label: 'Park' }, { label: 'School' },
] } as DeploymentAssignment;

it('keeps numbering collapsed until tapped and opens details separately from schedule previews', async () => {
  const onOpen = jest.fn(), onViewBlock = jest.fn();
  const view = await render(<CurrentDeploymentCard assignment={assignment} styleLabel="Area patrol"
    currentIndex={0} previewIndex={null} onOpen={onOpen} onViewBlock={onViewBlock} />);
  expect(view.queryByLabelText('My patrol schedule')).toBeNull();
  await fireEvent.press(view.getByRole('button', { name: 'Patrol schedule for Market patrol', expanded: false }));
  expect(onOpen).not.toHaveBeenCalled();
  await fireEvent.press(view.getByLabelText('View my area 2: Park'));
  await fireEvent.press(view.getByLabelText('View deployment details'));
  expect(onOpen).toHaveBeenCalledTimes(1);
  expect(onViewBlock).toHaveBeenCalledWith(1);
  expect(view.getByRole('button', { name: 'View my area 1: Market, current coverage', selected: true })).toBeTruthy();
  await view.rerender(<CurrentDeploymentCard assignment={assignment} styleLabel="Area patrol"
    currentIndex={0} previewIndex={1} onOpen={onOpen} onViewBlock={onViewBlock} />);
  expect(view.getByText('Preview 2')).toBeTruthy();
  expect(view.getByRole('button', { name: 'View my area 2: Park', selected: true })).toBeTruthy();
  await fireEvent.press(view.getByRole('button', { name: 'Patrol schedule for Market patrol', expanded: true }));
  expect(view.queryByLabelText('My patrol schedule')).toBeNull();
});

it('labels route selection correctly and omits the selector for a fixed post', async () => {
  const view = await render(<CurrentDeploymentCard assignment={{ ...assignment, deploymentType: 'route' }} styleLabel="Route patrol"
    currentIndex={1} previewIndex={null} onOpen={jest.fn()} onViewBlock={jest.fn()} />);
  await fireEvent.press(view.getByLabelText('Patrol schedule for Market patrol'));
  expect(view.getByLabelText('View my route 2: Park, current coverage')).toBeTruthy();
  await view.rerender(<CurrentDeploymentCard assignment={{ ...assignment, id: 'NEW-DUTY' }} styleLabel="Area patrol"
    currentIndex={0} previewIndex={null} onOpen={jest.fn()} onViewBlock={jest.fn()} />);
  expect(view.queryByLabelText('My patrol schedule')).toBeNull();
  await view.rerender(<CurrentDeploymentCard assignment={{ ...assignment, deploymentType: 'point', scheduleBlocks: [] }} styleLabel="Fixed post"
    currentIndex={-1} previewIndex={null} onOpen={jest.fn()} onViewBlock={jest.fn()} />);
  expect(view.queryByLabelText('My patrol schedule')).toBeNull();
});
