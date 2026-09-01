import { CABAGAN_BOUNDARY_COORDS } from './cabaganGeofence'
import { getMapTilerWebTerrainUrl } from '../services/mapTilerWeb'

const TERRAIN_SOURCE_ID = 'geosentri-terrain'
const HILLSHADE_LAYER_ID = 'geosentri-terrain-hillshade'
const BUILDINGS_LAYER_ID = 'geosentri-3d-buildings'

const CABAGAN_TERRAIN_BOUNDS = CABAGAN_BOUNDARY_COORDS.reduce(
  (bounds, [latitude, longitude]) => [
    Math.min(bounds[0], longitude),
    Math.min(bounds[1], latitude),
    Math.max(bounds[2], longitude),
    Math.max(bounds[3], latitude),
  ],
  [Infinity, Infinity, -Infinity, -Infinity],
)

const closeRing = (coordinates) => {
  if (coordinates.length === 0) return coordinates
  const [firstLongitude, firstLatitude] = coordinates[0]
  const [lastLongitude, lastLatitude] = coordinates[coordinates.length - 1]
  return firstLongitude === lastLongitude && firstLatitude === lastLatitude
    ? coordinates
    : [...coordinates, coordinates[0]]
}

export const cabaganBoundaryLngLat = closeRing(
  CABAGAN_BOUNDARY_COORDS.map(([latitude, longitude]) => [longitude, latitude]),
)

export const cabaganBoundaryFeature = {
  type: 'Feature',
  properties: { name: 'Cabagan Geofence Boundary' },
  geometry: { type: 'Polygon', coordinates: [cabaganBoundaryLngLat] },
}

export const createCircleFeature = (longitude, latitude, radiusMeters, properties = {}) => {
  const coordinates = []
  const latitudeRadius = radiusMeters / 111_320
  const longitudeRadius = radiusMeters / (111_320 * Math.cos(latitude * Math.PI / 180))

  for (let index = 0; index <= 64; index += 1) {
    const angle = index / 64 * Math.PI * 2
    coordinates.push([
      longitude + Math.cos(angle) * longitudeRadius,
      latitude + Math.sin(angle) * latitudeRadius,
    ])
  }

  return {
    type: 'Feature',
    properties,
    geometry: { type: 'Polygon', coordinates: [coordinates] },
  }
}

export const featureCollection = (features = []) => ({ type: 'FeatureCollection', features })

export const setGeoJsonSourceData = (map, sourceId, data) => {
  const source = map.getSource(sourceId)
  if (source?.setData) source.setData(data)
}

const firstSymbolLayerId = (map) => map.getStyle()?.layers?.find(
  (layer) => layer.type === 'symbol' && map.getLayer(layer.id),
)?.id

const addLayerBelowLabels = (map, layer) => {
  const beforeLayerId = firstSymbolLayerId(map)
  if (beforeLayerId) map.addLayer(layer, beforeLayerId)
  else map.addLayer(layer)
}

const findVectorBasemapSource = (map) => {
  const sources = map.getStyle()?.sources || {}
  return ['maptiler_planet_v4', 'maptiler_planet', 'openmaptiles']
    .find((sourceId) => sources[sourceId]?.type === 'vector')
}

export const applyThreeDimensionalTerrain = (map, enabled) => {
  if (!map?.getStyle()) return false

  if (!enabled) {
    map.setTerrain(null)
    if (map.getLayer(BUILDINGS_LAYER_ID)) map.removeLayer(BUILDINGS_LAYER_ID)
    if (map.getLayer(HILLSHADE_LAYER_ID)) map.removeLayer(HILLSHADE_LAYER_ID)
    if (map.getSource(TERRAIN_SOURCE_ID)) map.removeSource(TERRAIN_SOURCE_ID)
    map.easeTo({ pitch: 0, duration: 550 })
    return true
  }

  if (!map.getSource(TERRAIN_SOURCE_ID)) {
    map.addSource(TERRAIN_SOURCE_ID, {
      type: 'raster-dem',
      url: getMapTilerWebTerrainUrl(),
      tileSize: 512,
      maxzoom: 12,
      encoding: 'mapbox',
      bounds: CABAGAN_TERRAIN_BOUNDS,
    })
  }

  map.setTerrain({ source: TERRAIN_SOURCE_ID, exaggeration: 1.05 })
  if (!map.getLayer(HILLSHADE_LAYER_ID)) {
    addLayerBelowLabels(map, {
      id: HILLSHADE_LAYER_ID,
      type: 'hillshade',
      source: TERRAIN_SOURCE_ID,
      paint: {
        'hillshade-exaggeration': 0.22,
        'hillshade-shadow-color': '#071326',
        'hillshade-highlight-color': '#d8e8ff',
      },
    })
  }

  const basemapSourceId = findVectorBasemapSource(map)
  if (basemapSourceId && !map.getLayer(BUILDINGS_LAYER_ID)) {
    addLayerBelowLabels(map, {
      id: BUILDINGS_LAYER_ID,
      type: 'fill-extrusion',
      source: basemapSourceId,
      'source-layer': 'building',
      minzoom: 16,
      filter: ['any', ['has', 'render_height'], ['has', 'height']],
      paint: {
        'fill-extrusion-color': '#b8c4d6',
        'fill-extrusion-height': ['coalesce', ['get', 'render_height'], ['get', 'height'], 8],
        'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], ['get', 'min_height'], 0],
        'fill-extrusion-opacity': 0.72,
      },
    })
  }

  map.easeTo({ pitch: 45, duration: 550 })
  return true
}
