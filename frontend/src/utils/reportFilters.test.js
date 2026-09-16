import { describe, expect, it } from 'vitest'
import { analyticsReportsUrl, readReportFilters, reportPeriodRange } from './reportFilters'
import { buildBarangayAnalytics } from './barangayAnalytics'

describe('report date and drilldown contracts', () => {
  it('uses Philippine midnight and Monday week boundaries regardless of browser timezone', () => {
    const now = new Date('2026-09-14T17:00:00Z') // Tuesday in the Philippines
    expect(reportPeriodRange('today', now)).toEqual({ from: '2026-09-14T16:00:00.000Z', to: '2026-09-15T15:59:59.999Z' })
    expect(reportPeriodRange('week', now).from).toBe('2026-09-13T16:00:00.000Z')
    expect(reportPeriodRange('monthly', now).from).toBe('2026-08-31T16:00:00.000Z')
    expect(reportPeriodRange('yearly', now).from).toBe('2025-12-31T16:00:00.000Z')
  })
  it('retains exact analytics dates, category, validation, case and barangay on refresh', () => {
    const analytics = { period: 'weekly', start: new Date('2026-09-08T16:00:00Z'), end: new Date('2026-09-15T15:59:59.999Z') }
    const url = analyticsReportsUrl(analytics, { category: 'incident', validation_status: 'validated', case_status: 'resolved', barangay: 'San Juan' })
    expect(readReportFilters(new URLSearchParams(url.split('?')[1]))).toMatchObject({
      from: analytics.start.toISOString(), to: analytics.end.toISOString(), category: 'incident',
      validationStatus: 'validated', caseStatus: 'resolved', barangay: 'San Juan', cabaganOnly: true,
    })
  })
  it('counts the same submitted records as Reports even if the incident occurred earlier', () => {
    const analytics = buildBarangayAnalytics({ period: 'monthly', referenceDate: new Date('2026-09-15T01:00:00Z'), deploymentCoverage: [], reports: [
      { id: 'included', barangay: 'Centro', is_incident: true, validation_status: 'validated', case_status: 'resolved', date_time: '2026-09-01T00:00:00Z', occurred_at: '2026-08-01T00:00:00Z' },
      { id: 'excluded', barangay: 'Centro', is_incident: true, date_time: '2026-08-01T00:00:00Z', occurred_at: '2026-09-01T00:00:00Z' },
      { id: 'outside', barangay: 'Outside Cabagan', is_incident: true, date_time: '2026-09-01T00:00:00Z' },
    ] })
    expect(analytics.totalReports).toBe(1)
    expect(analytics.totalValidatedIncidents).toBe(1)
    expect(analytics.totalResolvedCases).toBe(1)
    expect(analytics.excludedOutsideCabaganReports).toBe(1)
  })
  it('does not reuse historical report dates as the current analytics period', () => {
    const analytics = buildBarangayAnalytics({ period: 'yearly', deploymentCoverage: [], reports: [
      { barangay: 'Centro', date_time: '2001-01-01', occurred_at: '2001-01-01' },
    ] })
    expect(analytics.totalReports).toBe(0)
  })
  it('includes deployed barangays without reports and keeps incident time windows in Philippine time', () => {
    const analytics = buildBarangayAnalytics({ period: 'monthly', referenceDate: new Date('2026-09-15'),
      deploymentCoverage: [{ barangay: 'Aggub', assignedPersonnel: 2, availablePersonnel: 2 }],
      reports: [{ barangay: 'Centro', is_incident: true, validation_status: 'validated', date_time: '2026-09-15T01:00:00Z', occurred_at: '2026-09-14T17:00:00Z' }],
    })
    expect(analytics.barangays.find((b) => b.barangay === 'Aggub')).toMatchObject({ reportCount: 0, availablePersonnel: 2 })
    expect(analytics.barangays.find((b) => b.barangay === 'Centro').peakTimeWindow).toBe('12 AM-4 AM')
    expect(analytics.totalReports).toBe(1)
  })
})
