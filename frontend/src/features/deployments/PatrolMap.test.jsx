import { act, cleanup, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import geography from '../../../../contracts/geography/cabagan-geography.json'
import PatrolMap from './PatrolMap'

const state = vi.hoisted(() => ({ map: null, markers: [] }))
vi.mock('../../services/configureMapLibre', () => ({}))
vi.mock('../../services/mapTilerWeb', () => ({ hasMapTilerWebApiKey: true, getMapTilerWebStyleUrl: () => 'test-style' }))
vi.mock('../../hooks/useDocumentTheme', () => ({ useDocumentTheme: () => false }))
vi.mock('./useRouteDirections', () => ({ default: () => ({ results: [], loading: false }) }))
vi.mock('maplibre-gl', () => {
  class Bounds {
    points = []
    extend(p) { this.points.push(p); return this }
    isEmpty() { return !this.points.length }
  }
  class Map {
    sources = {}; layers = {}; handlers = {}
    fitBounds = vi.fn(); flyTo = vi.fn()
    constructor() { state.map = this }
    addControl() {}
    on(event, layer, callback) { if (!callback) this.handlers[event] = layer }
    addSource(id, source) { this.sources[id] = { ...source, setData: vi.fn() } }
    getSource(id) { return this.sources[id] }
    addLayer(layer) { this.layers[layer.id] = layer }
    resize() {}
    remove() {}
  }
  class Marker {
    constructor({ element }) { this.element = element; state.markers.push(this) }
    setLngLat(point) { this.point = point; return this }
    setPopup() { return this }
    addTo() { return this }
    remove() {}
  }
  class Popup {
    setDOMContent() { return this }
    setLngLat() { return this }
    addTo() { return this }
  }
  return { Map, Marker, Popup, LngLatBounds: Bounds, NavigationControl: class {}, AttributionControl: class {} }
})
afterEach(() => { cleanup(); state.markers = []; vi.unstubAllGlobals() })
const mount = props => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  render(<PatrolMap {...props} />)
  act(() => state.map.handlers.load())
  return state.map
}

it('shows the full selected barangay, dashed coverage and its interior number', () => {
  const f = geography.barangays.features.find(f => f.properties.barangay === 'Tallag')
  const block = { ...f.properties.center, coverageType: 'barangay', geometry: f.geometry, label: 'Tallag', durationMinutes: 120 }
  const onSelectBlock = vi.fn()
  const map = mount({ blocks: [block], focus: { ...f.properties.center, geometry: f.geometry }, autoFit: false, onSelectBlock })
  expect(map.sources.municipality.data.geometry).toEqual(geography.municipality.geometry)
  expect(map.layers['patrol-area-line'].paint['line-dasharray']).toEqual([3, 2])
  expect(map.sources['patrol-blocks'].data.features[0].geometry).toEqual(f.geometry)
  expect(map.fitBounds).toHaveBeenCalled()
  expect(map.fitBounds.mock.calls.at(-1)[0].points).toEqual(f.geometry.coordinates[0])
  expect(map.flyTo).not.toHaveBeenCalled()
  expect(state.markers[0].point).toEqual([f.properties.center.longitude, f.properties.center.latitude])
  act(() => state.markers[0].element.click())
  expect(onSelectBlock).toHaveBeenCalledWith(0)
})

it('keeps map taps available to the picker and point searches at their existing zoom', () => {
  const onPoint = vi.fn(), point = { latitude: 17.43, longitude: 121.76 }
  const map = mount({ onPoint, focus: point })
  act(() => map.handlers.click({ lngLat: { lat: point.latitude, lng: point.longitude } }))
  expect(onPoint).toHaveBeenCalledWith(point)
  expect(map.flyTo).toHaveBeenCalledWith({ center: [point.longitude, point.latitude], zoom: 16 })
})
