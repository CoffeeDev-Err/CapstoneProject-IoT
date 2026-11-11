import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { ReportLocationFields } from './ReportLocationFields';
import { createEmptyReportForm } from './reportForm';

jest.mock('../../context/ThemeContext', () => ({ useMobileTheme: () => ({ colors: {} }) }));

const callbacks = () => ({
  onEditLocation: jest.fn(), onOpenBarangays: jest.fn(),
  onOpenMap: jest.fn(), onUseCurrentGps: jest.fn(),
});

it('shows the detected barangay without requiring a manual selection, but permits correction', async () => {
  const actions = callbacks();
  const form = { ...createEmptyReportForm(), barangay: 'Centro' };
  const view = await render(<ReportLocationFields {...actions} form={form} />);
  expect(view.getByText('Centro')).toBeTruthy();
  expect(view.queryByRole('button', { name: 'Select barangay' })).toBeNull();
  expect(actions.onOpenBarangays).not.toHaveBeenCalled();
  await fireEvent.press(view.getByRole('button', { name: 'Incorrect barangay?' }));
  expect(actions.onOpenBarangays).toHaveBeenCalledTimes(1);
});

it('waits for detection before offering the manual fallback after a failed lookup', async () => {
  const actions = callbacks();
  const form = { ...createEmptyReportForm(), latitude: 17.43, longitude: 121.77 };
  const view = await render(<ReportLocationFields {...actions} form={form} isResolvingLocation />);
  expect(view.queryByRole('button', { name: 'Select barangay' })).toBeNull();
  expect(view.queryByRole('button', { name: 'Incorrect barangay?' })).toBeNull();
  await view.rerender(<ReportLocationFields {...actions} form={form}
    locationLookupMessage="Barangay could not be identified." />);
  await fireEvent.press(view.getByRole('button', { name: 'Select barangay' }));
  expect(actions.onOpenBarangays).toHaveBeenCalledTimes(1);
});

it('keeps manual reporting reachable when neither GPS nor map coordinates are available', async () => {
  const actions = callbacks();
  const form = createEmptyReportForm();
  const view = await render(<ReportLocationFields {...actions} form={form} />);
  expect(view.queryByRole('button', { name: 'Select barangay' })).toBeNull();
  await fireEvent.changeText(view.getByLabelText('Exact incident place or landmark'), 'Market entrance');
  expect(actions.onEditLocation).toHaveBeenCalledWith('Market entrance');
  await view.rerender(<ReportLocationFields {...actions} form={{ ...form, location: 'Market entrance' }} />);
  await fireEvent.press(view.getByRole('button', { name: 'Select barangay' }));
  expect(actions.onOpenBarangays).toHaveBeenCalledTimes(1);
});
