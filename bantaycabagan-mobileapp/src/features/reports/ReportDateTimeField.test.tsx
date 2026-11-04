import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { ReportDateTimeField, parseReportTime, toLocalReportTime } from './ReportDateTimeField';
jest.mock('../../context/ThemeContext', () => ({ useMobileTheme: () => ({ colors: {} }) }));
it('round-trips local incident times and rejects impossible dates', () => {
  const iso = parseReportTime('2026-09-08 20:30');
  expect(toLocalReportTime(iso)).toBe('2026-09-08 20:30');
  for (const value of ['2026-02-30 20:30', '2026-09-08 25:00', '2026-13-01 12:00', 'bad']) expect(parseReportTime(value)).toBe('');
});
it('keeps a partial edit visible while marking the form time invalid', async () => {
  const onChange = jest.fn();
  const view = await render(<ReportDateTimeField value="2026-09-08T12:30:00Z" onChange={onChange} />);
  await fireEvent.changeText(view.getByLabelText('Incident or activity date and time'), '2026-09-');
  expect(onChange).toHaveBeenLastCalledWith('');
  await view.rerender(<ReportDateTimeField value="" onChange={onChange} />);
  expect(view.getByLabelText('Incident or activity date and time')).toHaveProp('value', '2026-09-');
});
