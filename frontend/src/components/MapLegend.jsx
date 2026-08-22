import { ChevronDown, List } from 'lucide-react'
import { useState } from 'react'

const LEGEND_ITEMS = [
  { tone: 'backup', cue: 'SOS', label: 'Backup request' },
  { tone: 'boundary', cue: '!', label: 'Outside Cabagan' },
  { tone: 'operation', cue: 'OP', label: 'On operation' },
  { tone: 'duty', cue: '✓', label: 'On duty' },
]

function MapLegend() {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <section className={`map-legend${isExpanded ? ' is-expanded' : ''}`} aria-label="Map status legend">
      <button
        type="button"
        className="map-legend__toggle"
        aria-expanded={isExpanded}
        aria-controls="live-map-legend-items"
        onClick={() => setIsExpanded((expanded) => !expanded)}
      >
        <List aria-hidden="true" />
        <span>Legend</span>
        <ChevronDown className="map-legend__chevron" aria-hidden="true" />
      </button>
      <div
        id="live-map-legend-items"
        className="map-legend__content"
        aria-hidden={!isExpanded}
      >
        {LEGEND_ITEMS.map((item) => (
          <div key={item.tone} className="map-legend__item">
            <span className={`map-legend__marker map-legend__marker--${item.tone}`} aria-hidden="true">
              <span>{item.cue}</span>
            </span>
            <span>{item.label}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

export default MapLegend
