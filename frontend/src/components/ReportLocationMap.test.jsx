import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const fixture = vi.hoisted(() => ({ maps: [], markers: [], popups: [] }))
vi.mock('maplibre-gl', () => ({
  Map: class {
    constructor(options) { this.options = options; this.sources = {}; this.layers = {}; this.events = {}; fixture.maps.push(this) }
    on(event, layer, callback) { this.events[callback ? `${event}:${layer}` : event] = callback || layer }
    off(event, layer, callback) { delete this.events[callback ? `${event}:${layer}` : event] }
    stop() { this.stopped = true }
    getSource(id) { return this.sources[id] }
    addSource(id, data) { this.sources[id] = { ...data, setData(next) { this.data = next } } }
    getLayer(id) { return this.layers[id] }
    addLayer(layer) { this.layers[layer.id] = layer }
    isStyleLoaded() { return true }
    setStyle() { this.styleChanges = (this.styleChanges || 0) + 1; this.sources = {}; this.layers = {}; this.events['style.load']() }
    queryRenderedFeatures() { return [] }
    resize() { this.resizes = (this.resizes || 0) + 1 }
    fitBounds() {} easeTo() {} remove() { this.removed = true }
  },
  LngLatBounds: class { extend() { return this } },
  Marker: class {
    constructor(options) { this.element = options.element; fixture.markers.push(this) }
    setLngLat() { return this } addTo() { return this } remove() {}
  },
  Popup: class {
    constructor() { this.events = {}; fixture.popups.push(this) }
    on(event, callback) { this.events[event] = callback; return this }
    setLngLat() { return this } setDOMContent(element) { this.element = element; return this }
    addTo() { return this } remove() { this.removed = true; this.events.close?.() }
  },
}))
vi.mock('../services/configureMapLibre', () => ({}))
vi.mock('../services/mapTilerWeb', () => ({ hasMapTilerWebApiKey: true, getMapTilerWebStyleUrl: () => 'test-style' }))
vi.mock('../utils/mapNavigation', () => ({ addMobileLikeNavigationControls: () => () => {} }))
vi.mock('../utils/mapLibreLayers', async importOriginal => ({ ...(await importOriginal()), applyThreeDimensionalTerrain: () => {} }))
import ReportLocationMap from './ReportLocationMap'

beforeEach(() => vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} }))
afterEach(() => { cleanup(); fixture.maps.length = 0; fixture.markers.length = 0; fixture.popups.length = 0;
  delete document.documentElement.dataset.theme; vi.unstubAllGlobals(); vi.useRealTimers() })
const samples = [
  { latitude: 17.4, longitude: 121.7, accuracy: 4, recorded_at: '2026-10-06T06:00:00Z' },
  { latitude: 17.4003, longitude: 121.7, accuracy: 4, recorded_at: '2026-10-06T06:00:10Z' },
  { latitude: 17.4003, longitude: 121.7004, accuracy: 4, recorded_at: '2026-10-06T06:00:20Z' },
]

it('groups hourly markers and provides hover/click details without drawing a detailed route', () => {
  const onSelectHour = vi.fn()
  const hours = [0, 1].map(hour => ({ hour, from: `2026-11-05T0${hour}:00:00Z`, to: `2026-11-05T0${hour + 1}:00:00Z`,
    checkpoint: { latitude: 17.42, longitude: 121.77, recorded_at: `2026-11-05T0${hour}:59:00Z`, speed: 0 } }))
  render(<ReportLocationMap hourlyCheckpoints={hours} onSelectHour={onSelectHour} />)
  const map = fixture.maps[0]
  act(() => map.events['style.load']())
  expect(fixture.markers).toHaveLength(1)
  expect(fixture.markers[0].element.textContent).toBe('1, 2')
  fireEvent.mouseEnter(fixture.markers[0].element)
  expect(fixture.popups.at(-1).element.textContent).toContain('Hour 2')
  fireEvent.click(fixture.popups.at(-1).element.querySelectorAll('button')[1])
  expect(onSelectHour).toHaveBeenCalledWith('1')
  expect(map.getSource('geosentri-report-route').data.features.some(feature => feature.properties.kind === 'trace')).toBe(false)
})

it('keeps a neutral history map with no dots when no accepted readings exist', () => {
  render(<ReportLocationMap historyContext={{ personnelName: 'Officer One' }} hourlyCheckpoints={[]} mapLabel="Personnel duty GPS history map" />)
  expect(screen.getByLabelText('Personnel duty GPS history map')).toBeTruthy()
  expect(fixture.maps[0].options.center).toEqual([121.829, 17.3928])
  expect(fixture.markers).toHaveLength(0)
})
it('opens grouped history details and clears the selected marker when the popup closes', () => {
  const hours = [0, 1].map(hour => ({ hour, from: `2026-11-05T0${hour}:00:00Z`, to: `2026-11-05T0${hour + 1}:00:00Z`,
    checkpoint: { latitude: 17.42, longitude: 121.77, recorded_at: `2026-11-05T0${hour}:59:00Z`, speed: 0, battery_level: 90 } }))
  render(<ReportLocationMap historyContext={{ personnelName: 'Officer One' }} hourlyCheckpoints={hours} />)
  const marker = fixture.markers[0].element
  fireEvent.click(marker)
  expect(marker).toHaveAttribute('aria-expanded', 'true')
  const popup = fixture.popups.at(-1)
  expect(popup.element.textContent).toContain('2 hourly readings at this location')
  expect(popup.element.textContent).toContain('90%')
  act(() => popup.remove())
  expect(marker).toHaveAttribute('aria-expanded', 'false')
  expect(marker).not.toHaveClass('is-selected')
})
it('lets the user retry an unavailable history map without changing saved readings', () => {
  render(<ReportLocationMap historyContext={{}} hourlyCheckpoints={[]} />)
  const map = fixture.maps[0]
  map.isStyleLoaded = () => false
  act(() => map.events.error())
  expect(screen.getByText(/The map could not be loaded/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Retry map' }))
  expect(map.styleChanges).toBe(1)
  expect(screen.queryByText(/The map could not be loaded/)).toBeNull()
  expect(fixture.markers).toHaveLength(0)
})
it('shows structured details on a detailed GPS point hover while keeping report behavior available', () => {
  render(<ReportLocationMap historyContext={{ personnelName: 'Officer One' }} routePoints={[{ ...samples[0], location_name: 'School', battery_level: 90, speed: 0 }]} />)
  const map = fixture.maps[0]
  act(() => map.events['style.load']())
  const feature = map.getSource('geosentri-report-route').data.features.find(item => item.properties.kind === 'recorded')
  act(() => map.events['mouseenter:geosentri-report-recorded']({ features: [feature] }))
  expect(fixture.popups.at(-1).element.textContent).toContain('School')
  expect(fixture.popups.at(-1).element.textContent).toContain('90%')
  expect(fixture.popups.at(-1).element.textContent).toContain('0 km/h')
})

it('cancels delayed map work and listeners when dismissed, and can initialize after reopening', () => {
  vi.useFakeTimers()
  const incident = { latitude: 17.4, longitude: 121.7 }
  const view = render(<ReportLocationMap incident={incident} />)
  const map = fixture.maps[0]
  act(() => map.events['style.load']())
  view.rerender(<ReportLocationMap active={false} incident={incident} />)
  act(() => vi.advanceTimersByTime(500))
  expect(map.resizes || 0).toBe(0)
  expect(map.stopped).toBe(true)
  expect(map.removed).toBe(true)
  expect(Object.keys(map.events)).toHaveLength(0)
  view.rerender(<ReportLocationMap incident={incident} />)
  expect(fixture.maps).toHaveLength(2)
  view.unmount()
  expect(fixture.maps[1].removed).toBe(true)
})

it('does not initialize a map when its lazy module arrives after close', () => {
  render(<ReportLocationMap active={false} incident={{ latitude: 17.4, longitude: 121.7 }} />)
  expect(fixture.maps).toHaveLength(0)
})

it('keeps raw, filtered, probable-turn and matched layers separate and restores them across themes', async () => {
  const raw = JSON.stringify(samples)
  render(<ReportLocationMap incident={{ latitude: 17.4, longitude: 121.7 }} routePoints={samples}
    roadMatching={{ segments: [{ coordinates: [[121.7, 17.4], [121.7, 17.4003], [121.7004, 17.4003]] }] }} />)
  const map = fixture.maps[0]
  act(() => map.events['style.load']())
  const features = () => map.getSource('geosentri-report-route').data.features
  expect(features().filter(feature => feature.properties.kind === 'recorded')).toHaveLength(3)
  expect(features().filter(feature => feature.properties.kind === 'turn')).toHaveLength(1)
  expect(features().filter(feature => feature.properties.kind === 'matched')).toHaveLength(1)
  fireEvent.click(screen.getByRole('checkbox', { name: 'Filtered GPS trace' }))
  expect(features().some(feature => feature.properties.kind === 'trace')).toBe(false)
  expect(features().filter(feature => feature.properties.kind === 'recorded')).toHaveLength(3)
  const turn = features().find(feature => feature.properties.kind === 'turn')
  act(() => map.events['click:geosentri-report-turns']({ features: [turn] }))
  expect(fixture.popups[0].element.textContent).toContain('Probable right turn (90°)')
  expect(fixture.popups[0].element.textContent).toContain('the exact corner is unknown')
  document.documentElement.dataset.theme = 'dark'
  await waitFor(() => expect(map.styleChanges).toBe(1))
  expect(map.layers['geosentri-report-turns']).toBeTruthy()
  expect(features().some(feature => feature.properties.kind === 'trace')).toBe(false)
  expect(fixture.maps).toHaveLength(1)
  expect(JSON.stringify(samples)).toBe(raw)
})

it('renders thousands of received samples as GPU features with only start/end/location DOM markers', () => {
  const many = Array.from({ length: 2000 }, (_, index) => ({ ...samples[0], latitude: 17.4 + index * 0.00005,
    recorded_at: new Date(Date.UTC(2026, 9, 6, 6, 0, index * 10)).toISOString() }))
  render(<ReportLocationMap incident={{ latitude: 17.4, longitude: 121.7 }} routePoints={many} />)
  const map = fixture.maps[0]
  act(() => map.events['style.load']())
  expect(map.getSource('geosentri-report-route').data.features.filter(feature => feature.properties.kind === 'recorded')).toHaveLength(2000)
  expect(fixture.markers.length).toBeLessThanOrEqual(3)
  fireEvent.click(screen.getByRole('checkbox', { name: 'Recorded GPS points' }))
  expect(map.getSource('geosentri-report-route').data.features.some(feature => feature.properties.kind === 'recorded')).toBe(false)
  expect(fixture.maps).toHaveLength(1)
})
