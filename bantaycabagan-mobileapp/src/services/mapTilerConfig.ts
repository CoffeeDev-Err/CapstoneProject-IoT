import type { StyleSpecification } from '@maplibre/maplibre-react-native';

export type GeoSentriMapMode = 'street' | 'satellite';

const MAPTILER_API_BASE = 'https://api.maptiler.com';
const TERRAIN_SOURCE_ID = 'geosentri-terrain';

export const MAPTILER_API_KEY = process.env.EXPO_PUBLIC_MAPTILER_API_KEY?.trim() || '';
export const hasMapTilerApiKey = MAPTILER_API_KEY.length > 0;

const styleIdFor = (mode: GeoSentriMapMode, isDark: boolean) => {
  if (mode === 'satellite') return isDark ? 'hybrid-v4-dark' : 'hybrid-v4';
  return isDark ? 'streets-v4-dark' : 'streets-v4';
};

export const getMapTilerStyleUrl = (mode: GeoSentriMapMode, isDark: boolean) => (
  `${MAPTILER_API_BASE}/maps/${styleIdFor(mode, isDark)}/style.json?key=${encodeURIComponent(MAPTILER_API_KEY)}`
);

export const getMapTilerTerrainUrl = () => (
  `${MAPTILER_API_BASE}/tiles/terrain-rgb-v2/tiles.json?key=${encodeURIComponent(MAPTILER_API_KEY)}`
);

const buildingLayer: StyleSpecification['layers'][number] = {
  id: 'geosentri-3d-buildings',
  type: 'fill-extrusion',
  source: 'openmaptiles',
  'source-layer': 'building',
  minzoom: 15,
  paint: {
    'fill-extrusion-color': '#b8c4d6',
    'fill-extrusion-height': [
      'coalesce',
      ['get', 'render_height'],
      ['get', 'height'],
      8,
    ],
    'fill-extrusion-base': [
      'coalesce',
      ['get', 'render_min_height'],
      ['get', 'min_height'],
      0,
    ],
    'fill-extrusion-opacity': 0.72,
  },
};

const hillshadeLayer: StyleSpecification['layers'][number] = {
  id: 'geosentri-terrain-hillshade',
  type: 'hillshade',
  source: TERRAIN_SOURCE_ID,
  paint: {
    'hillshade-exaggeration': 0.32,
    'hillshade-shadow-color': '#071326',
    'hillshade-highlight-color': '#d8e8ff',
  },
};

export async function loadMapTilerStyle(
  mode: GeoSentriMapMode,
  isDark: boolean,
  enable3D: boolean,
  signal?: AbortSignal,
): Promise<string | StyleSpecification> {
  const styleUrl = getMapTilerStyleUrl(mode, isDark);
  if (!enable3D) return styleUrl;

  const response = await fetch(styleUrl, { signal });
  if (!response.ok) throw new Error(`MapTiler style request failed (${response.status}).`);

  const style = await response.json() as StyleSpecification;
  style.sources = {
    ...style.sources,
    [TERRAIN_SOURCE_ID]: {
      type: 'raster-dem',
      url: getMapTilerTerrainUrl(),
      tileSize: 512,
      maxzoom: 14,
      encoding: 'mapbox',
    },
  };
  style.terrain = {
    source: TERRAIN_SOURCE_ID,
    exaggeration: 1.12,
  };

  const layers = [...(style.layers || [])];
  const firstSymbolIndex = layers.findIndex((layer) => layer.type === 'symbol');
  const insertionIndex = firstSymbolIndex >= 0 ? firstSymbolIndex : layers.length;
  const additions: StyleSpecification['layers'] = [hillshadeLayer];

  if (Object.prototype.hasOwnProperty.call(style.sources, 'openmaptiles')) {
    additions.push(buildingLayer);
  }

  layers.splice(insertionIndex, 0, ...additions);
  style.layers = layers;
  return style;
}
