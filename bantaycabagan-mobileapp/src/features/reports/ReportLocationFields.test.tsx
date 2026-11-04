import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { createEmptyReportForm } from './reportForm';
import { ReportLocationFields } from './ReportLocationFields';

jest.mock('../../context/ThemeContext', () => ({
  useMobileTheme: () => ({ colors: { text: '#fff', textMuted: '#aaa' }, isDark: true }),
}));

it('expands the report sheet when the incident place field receives focus', async () => {
  const onFieldFocus = jest.fn();
  const view = await render(<ReportLocationFields
    form={createEmptyReportForm()}
    onEditLocation={jest.fn()}
    onFieldFocus={onFieldFocus}
    onOpenBarangays={jest.fn()}
    onOpenMap={jest.fn()}
    onUseCurrentGps={jest.fn()}
  />);
  await fireEvent(view.getByPlaceholderText('Example: Anao Public Market entrance'), 'focus');
  expect(onFieldFocus).toHaveBeenCalledTimes(1);
});
