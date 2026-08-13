import { Box, Map as MapIcon, Satellite } from 'lucide-react'

function MapStyleControls({ mapMode, threeDEnabled, onMapModeChange, onThreeDChange, compact = false }) {
  return (
    <div className={`map-style-control${compact ? ' map-style-control--compact' : ''}`} aria-label="Map display controls">
      <button
        type="button"
        className={`map-style-button${mapMode === 'street' ? ' is-active' : ''}`}
        onClick={() => onMapModeChange('street')}
        aria-label="Use street map"
        aria-pressed={mapMode === 'street'}
        title="Map"
      >
        <MapIcon aria-hidden="true" />
        <span>Map</span>
      </button>
      <button
        type="button"
        className={`map-style-button${mapMode === 'satellite' ? ' is-active' : ''}`}
        onClick={() => onMapModeChange('satellite')}
        aria-label="Use satellite map"
        aria-pressed={mapMode === 'satellite'}
        title="Satellite"
      >
        <Satellite aria-hidden="true" />
        <span>Satellite</span>
      </button>
      <button
        type="button"
        className={`map-style-button${threeDEnabled ? ' is-active' : ''}`}
        onClick={() => onThreeDChange(!threeDEnabled)}
        aria-label={threeDEnabled ? 'Disable 3D terrain' : 'Enable 3D terrain'}
        aria-pressed={threeDEnabled}
        title="3D terrain"
      >
        <Box aria-hidden="true" />
        <span>3D</span>
      </button>
    </div>
  )
}

export default MapStyleControls
