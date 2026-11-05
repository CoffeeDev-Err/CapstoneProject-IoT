import { fireEvent, within } from '@testing-library/react'
import { expect, it } from 'vitest'
import { createHistoryPopupContent } from './historyMapPopup'

const point = { latitude: 17.42, longitude: 121.77, recorded_at: '2026-11-05T00:10:00Z', location_name: 'School entrance', speed: 0, battery_level: 0, accuracy: 4, satellites: 12 }
const hour = index => ({ hour: index, from: `2026-11-05T0${index}:00:00Z`, to: `2026-11-05T0${index + 1}:00:00Z`, checkpoint: { ...point, recorded_at: `2026-11-05T0${index}:10:00Z` } })

it('shows location, Philippine date/time and available telemetry, including real zero values', () => {
  const popup = createHistoryPopupContent({ point, context: { personnelName: 'Officer One', deploymentType: 'point', patrolArea: 'School' } })
  expect(within(popup).getByRole('heading', { name: 'School entrance' })).toBeTruthy()
  expect(popup.textContent).toContain('8:10:00 AM PHT')
  expect(popup.textContent).toContain('Nov 5, 2026')
  for (const value of ['0 km/h', '0%', '4 m', '12', 'Officer One']) expect(popup.textContent).toContain(value)
})
it('keeps every coincident hourly checkpoint individually selectable with its original time', () => {
  const popup = createHistoryPopupContent({ hours: [hour(0), hour(1)] })
  expect(popup.textContent).toContain('2 hourly readings at this location')
  fireEvent.click(within(popup).getByRole('button', { name: 'Hour 2' }))
  expect(popup.textContent).toContain('Checkpoint 2')
  expect(popup.textContent).toContain('9:10:00 AM PHT')
  expect(within(popup).getByRole('button', { name: 'Hour 2' })).toHaveAttribute('aria-pressed', 'true')
})
it('treats missing telemetry as unrecorded and renders place names as text', () => {
  const popup = createHistoryPopupContent({ point: { ...point, location_name: '<img src=x onerror=alert(1)>', speed: null, battery_level: null, accuracy: 'unknown', satellites: null } })
  expect(popup.querySelector('img')).toBeNull()
  expect(popup.textContent).toContain('<img src=x onerror=alert(1)>')
  expect(within(popup).getAllByText('Not recorded')).toHaveLength(4)
})
