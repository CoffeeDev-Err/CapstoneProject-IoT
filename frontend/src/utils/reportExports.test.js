import { expect, it, vi } from 'vitest'
import { analyticsSheets, buildAnalyticsWorkbook, buildIndividualReportPdf, currentEvidence, fitImage, reportExportRows } from './reportExports'

it('requests signed photo bytes through the export endpoint and explains photo network failures', async () => {
  const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
  vi.stubGlobal('fetch', fetchMock)
  try {
    await expect(buildIndividualReportPdf({ evidence_photo: { url: '/api/media/token?expires=123&signature=signed' } }))
      .rejects.toThrow('The report photo could not be loaded for the PDF')
    const requested = new URL(fetchMock.mock.calls[0][0])
    expect(requested.pathname).toBe('/api/media/token')
    expect(requested.searchParams.get('signature')).toBe('signed')
    expect(requested.searchParams.get('export')).toBe('1')
  } finally {
    vi.unstubAllGlobals()
  }
})

it('exports all officer fields, coordinates and dates without review history', () => {
  const rows = reportExportRows({ id: 'RPT-1', officer: 'Officer One', officer_rank: 'Police Corporal', badge_number: '001',
    latitude: 17.4, longitude: 121.7, history: [{ reason: 'HIDDEN REVIEW' }], occurred_at: '2026-09-15T00:00:00Z' })
  expect(rows).toContainEqual(['Badge number', '001'])
  expect(rows).toContainEqual(['GPS coordinates', '17.400000, 121.700000'])
  expect(JSON.stringify(rows)).not.toContain('HIDDEN REVIEW')
})
it('preserves landscape and portrait photo aspect ratios and uses the newest correction', () => {
  expect(fitImage(4000, 2000, 180, 110)).toEqual({ width: 180, height: 90 })
  expect(fitImage(2000, 4000, 180, 110)).toEqual({ width: 55, height: 110 })
  expect(currentEvidence({ evidence_photo: { url: 'original' }, evidence_corrections: [{ url: 'old' }, { url: 'new' }] })).toMatchObject({ url: 'new', label: 'Current evidence - corrected photo 2' })
})
it('writes a real XLSX with matching numeric metrics, rankings and literal text cells', async () => {
  const analytics = { periodLabel: 'September 2026', start: new Date('2026-09-01'), end: new Date('2026-09-15'),
    totalReports: 2, totalValidatedIncidents: 1, totalResolvedCases: 1, highPriorityBarangays: 1, excludedOutsideCabaganReports: 0,
    barangays: [{ barangay: 'Centro', reportCount: 2, validatedIncidentCount: 1, priorityScore: 60, priorityLevel: 'High', assignedPersonnel: 1, availablePersonnel: 1, requiredPersonnel: 2, recommendation: 'Add patrol' }] }
  const reports = [{ id: 'RPT-1', title: '=HYPERLINK("bad")', severity: 4 }]
  const book = await buildAnalyticsWorkbook(analytics, reports, '2026-09-15T00:00:00Z')
  const bytes = await book.xlsx.writeBuffer()
  expect(bytes[0]).toBe(0x50); expect(bytes[1]).toBe(0x4b)
  const { default: ExcelJS } = await import('exceljs')
  const reread = new ExcelJS.Workbook(); await reread.xlsx.load(bytes)
  expect(reread.getWorksheet('Report rankings').getCell('C2').value).toBe(2)
  expect(reread.getWorksheet('Reports').getCell('D2').value).toBe('=HYPERLINK("bad")')
  expect(reread.getWorksheet('Reports').getCell('D2').type).toBe(ExcelJS.ValueType.String)
  expect(analyticsSheets(analytics, reports, '2026-09-15')[0].rows).toContainEqual(['Submitted Reports', 2])
}, 30000)
