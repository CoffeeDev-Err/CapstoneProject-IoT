import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const fixture = vi.hoisted(() => ({ maps: [], markers: [], loaded: false }))
vi.mock('maplibre-gl', () => ({
  Map: class {
    constructor(options) {
      this.container = options.container
      this.options = options
      this.zoom = 11
      this.bounds = [121.5, 17.2, 122, 17.7]
      this.listeners = {}
      fixture.maps.push(this)
    }
    on(event, listener) { (this.listeners[event] ||= []).push(listener) }
    off(event, listener) { this.listeners[event] = this.listeners[event]?.filter((item) => item !== listener) }
    trigger(event) { this.listeners[event]?.forEach((listener) => listener()) }
    isStyleLoaded() { return fixture.loaded }
    getZoom() { return this.zoom }
    getBounds() {
      const [west, south, east, north] = this.bounds
      return { getWest: () => west, getSouth: () => south, getEast: () => east, getNorth: () => north }
    }
    getStyle() { return { sources: {}, layers: [] } }
    getSource() {}
    getLayer() { return true }
    addSource() {}
    addLayer() {}
    resize = vi.fn()
    jumpTo = vi.fn()
    easeTo() {}
    flyTo() {}
    stop() { this.stopped = true }
    remove() {}
  },
  Marker: class {
    constructor({ element }) { this.element = element; fixture.markers.push(this) }
    setLngLat(position) { this.position = position; return this }
    addTo(map) { map.container.append(this.element); return this }
    remove() { this.element.remove() }
  },
}))
vi.mock('../services/configureMapLibre', () => ({}))
vi.mock('../services/mapTilerWeb', () => ({ hasMapTilerWebApiKey: true, getMapTilerWebStyleUrl: () => 'test-style' }))
vi.mock('../utils/mapNavigation', () => ({ addMobileLikeNavigationControls: () => () => {} }))
vi.mock('../utils/mapLibreLayers', () => ({
  applyThreeDimensionalTerrain: () => {}, cabaganBoundaryFeature: {}, cabaganBoundaryLngLat: [],
}))
vi.mock('./GpsReadingAge', () => ({ default: () => null }))
import PersonnelMap from './PersonnelMap'

beforeEach(() => vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} }))

afterEach(() => {
  cleanup()
  fixture.maps.length = 0
  fixture.markers.length = 0
  fixture.loaded = false
  vi.unstubAllGlobals()
})

const officer = (id, overrides = {}) => ({
  id: String(id), name: `Officer ${id}`, latitude: 17.4269, longitude: 121.7653,
  status: 'On Duty', photoUrl: `/photo-${id}.jpg`, isInsideCabagan: true,
  locationRecordedAt: '2026-10-05T00:00:00Z', ...overrides,
})

it('renders 2,000 clustered officers without creating hidden photo markers or waiting for tiles', () => {
  const personnel = Array.from({ length: 2000 }, (_, id) => officer(id, { emergencyActive: id === 0 }))
  const selected = vi.fn()
  const view = render(<PersonnelMap personnel={personnel} onSelectPersonnel={selected} />)
  const map = fixture.maps[0]
  expect(fixture.loaded).toBe(false)
  expect(view.container.querySelectorAll('.maplibre-personnel-marker')).toHaveLength(0)
  expect(view.container.querySelectorAll('.maplibre-personnel-cluster')).toHaveLength(1)
  expect(view.container.querySelector('.personnel-cluster').textContent).toBe('2000')
  expect(view.container.querySelector('.personnel-cluster--backup')).not.toBeNull()
  expect(view.container.querySelectorAll('.police-marker__photo')).toHaveLength(0)
  // The followed officer stays visible even at a clustered zoom.
  view.rerender(<PersonnelMap personnel={personnel} followedPersonnelId="0" onSelectPersonnel={selected} />)
  expect(view.container.querySelectorAll('.maplibre-personnel-marker')).toHaveLength(1)
  expect(view.container.querySelectorAll('.police-marker__photo')).toHaveLength(1)
  act(() => view.container.querySelector('.maplibre-personnel-marker').click())
  expect(selected).toHaveBeenCalledWith(personnel[0])
  const latestSelect = vi.fn()
  view.rerender(<PersonnelMap personnel={personnel} followedPersonnelId="0" onSelectPersonnel={latestSelect} />)
  act(() => view.container.querySelector('.maplibre-personnel-marker').click())
  expect(latestSelect).toHaveBeenCalledWith(personnel[0])
  expect(fixture.maps).toHaveLength(1)
  // Pan offscreen: only the explicitly followed officer remains mounted.
  map.bounds = [0, 0, 1, 1]
  act(() => map.trigger('moveend'))
  expect(view.container.querySelectorAll('.maplibre-personnel-cluster')).toHaveLength(0)
  expect(view.container.querySelectorAll('.maplibre-personnel-marker')).toHaveLength(1)
  view.rerender(<PersonnelMap personnel={[]} onSelectPersonnel={selected} />)
  expect(view.container.querySelectorAll('.maplibre-personnel-marker')).toHaveLength(0)
})

it('keeps the existing map camera when the personnel panel changes width', async () => {
  vi.useFakeTimers()
  try {
    const view = render(<PersonnelMap personnel={[]} layoutVersion={0} />)
    const map = fixture.maps[0]
    view.rerender(<PersonnelMap personnel={[]} layoutVersion={1} />)
    await act(async () => vi.advanceTimersByTime(300))
    expect(fixture.maps).toHaveLength(1)
    expect(map.resize).toHaveBeenCalled()
    expect(map.jumpTo).not.toHaveBeenCalled()
  } finally { vi.useRealTimers() }
})

it('shows individuals on zoom-in and releases their DOM and photos when clustered again', () => {
  const personnel = [officer('a'), officer('b')]
  const view = render(<PersonnelMap personnel={personnel} onSelectPersonnel={vi.fn()} />)
  const map = fixture.maps[0]
  map.zoom = 18
  act(() => map.trigger('zoom'))
  expect(view.container.querySelectorAll('.maplibre-personnel-marker')).toHaveLength(2)
  map.zoom = 11
  act(() => map.trigger('zoom'))
  expect(view.container.querySelectorAll('.maplibre-personnel-marker')).toHaveLength(0)
  expect(view.container.querySelectorAll('.police-marker__photo')).toHaveLength(0)
  view.rerender(<PersonnelMap personnel={[officer('b', { latitude: 17.5 })]} onSelectPersonnel={vi.fn()} />)
  expect(view.container.querySelector('.maplibre-personnel-marker').getAttribute('aria-label')).toContain('Officer b')
  const mounted = fixture.markers.filter((marker) => marker.element.isConnected)
  expect(mounted[0].position).toEqual([121.7653, 17.5])
})

it('keeps the same clickable marker through an outage and animates when a newer fix arrives', () => {
  const frames = []
  vi.stubGlobal('requestAnimationFrame', (callback) => { frames.push(callback); return frames.length })
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  const selected = vi.fn()
  const original = officer('a', { isVisibleOnMap: true })
  const view = render(<PersonnelMap personnel={[original]} onSelectPersonnel={selected} />)
  const marker = fixture.markers.find((item) => item.element.isConnected)
  const stale = { ...original, isLocationStale: true, locationAgeSeconds: 600 }
  view.rerender(<PersonnelMap personnel={[stale]} onSelectPersonnel={selected} />)
  expect(marker.element.isConnected).toBe(true)
  expect(marker.position).toEqual([original.longitude, original.latitude])
  expect(frames).toHaveLength(0)
  act(() => marker.element.click())
  expect(selected).toHaveBeenLastCalledWith(stale)

  const fresh = { ...original, latitude: 17.42708, locationRecordedAt: '2026-10-05T00:10:00Z', speed: 5 }
  view.rerender(<PersonnelMap personnel={[fresh]} onSelectPersonnel={selected} />)
  expect(marker.element.isConnected).toBe(true)
  expect(frames.length).toBeGreaterThan(0)
  act(() => frames.shift()(performance.now() + 1000))
  expect(marker.position).toEqual([fresh.longitude, fresh.latitude])
  act(() => marker.element.click())
  expect(selected).toHaveBeenLastCalledWith(fresh)
})
