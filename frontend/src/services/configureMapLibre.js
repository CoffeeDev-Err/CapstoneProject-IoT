import { setWorkerUrl } from 'maplibre-gl'
import mapLibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'

// MapLibre v6 is ESM-only. Vite must bundle its worker as a self-contained
// asset; otherwise raster styles render while vector tiles and GeoJSON stall.
setWorkerUrl(mapLibreWorkerUrl)
