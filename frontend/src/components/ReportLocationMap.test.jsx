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
    constructor() { fixture.popups.push(this) }
    setLngLat() { return this } setDOMContent(element) { this.element = element; return this }
    addTo() { return this } remove() { this.removed = true }
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
