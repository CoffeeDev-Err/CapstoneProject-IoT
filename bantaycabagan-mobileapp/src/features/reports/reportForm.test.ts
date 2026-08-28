import { createEmptyReportForm, getBarangayFromArea } from './reportForm';

describe('report form rules', () => {
  it('derives barangays from deployment area labels', () => {
    expect(getBarangayFromArea('Barangay Centro Route')).toBe('Centro');
    expect(getBarangayFromArea('Masipi East, Cabagan')).toBe('Masipi East');
    expect(getBarangayFromArea('Municipal Hall Perimeter')).toBe('');
  });

  it('creates independent default forms', () => {
    const first = createEmptyReportForm();
    const second = createEmptyReportForm();
    first.title = 'Changed';
    expect(second.title).toBe('');
  });
});
