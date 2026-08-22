import {
  BatteryMedium,
  Clock3,
  Gauge,
  LocateFixed,
  MapPin,
  X,
} from 'lucide-react'
import { createPortal } from 'react-dom'
import { useRef } from 'react'

import { formatTime } from '../utils/dateTime'
import { useAccessibleDialog } from '../hooks/useAccessibleDialog'
import InitialsAvatar from './InitialsAvatar'

const formatGpsDateTime = (value) => {
  if (!value) return 'Unavailable'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unavailable'

  return new Intl.DateTimeFormat('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

function ProfileModal({ selectedPersonnel, onClose, onLocate }) {
  const closeButtonRef = useRef(null)
  const dialogRef = useAccessibleDialog(Boolean(selectedPersonnel), onClose, closeButtonRef)

  if (!selectedPersonnel) return null

  const hasCurrentLocation = !selectedPersonnel.isLocationStale
    && selectedPersonnel.isVisibleOnMap !== false
  const speed = Number.isFinite(selectedPersonnel.speed)
    ? `${selectedPersonnel.speed.toFixed(1)} km/h`
    : 'Unavailable'
  const battery = Number.isFinite(selectedPersonnel.batteryLevel)
    ? `${Math.round(selectedPersonnel.batteryLevel)}%`
    : 'Unavailable'

  return createPortal(
    <div className="profile-modal-layer" role="presentation" onClick={onClose}>
      <section
        ref={dialogRef}
        className="profile-map-card"
        role="dialog"
        aria-modal="true"
        aria-label={`${selectedPersonnel.name} live details`}
        onClick={(event) => event.stopPropagation()}
        tabIndex={-1}
      >
        <button
          ref={closeButtonRef}
          type="button"
          className="profile-map-card__close"
          onClick={onClose}
          aria-label="Close personnel details"
          title="Close"
        >
          <X size={18} strokeWidth={2.2} />
        </button>

        <header className="profile-map-card__header">
          <InitialsAvatar
            src={selectedPersonnel.photoUrl}
            name={selectedPersonnel.name}
            alt=""
            className="profile-map-card__photo"
          />
          <div className="profile-map-card__identity">
            <h3>{selectedPersonnel.name}</h3>
            <p>{selectedPersonnel.rank}</p>
            <span className="profile-map-card__status">
              <i aria-hidden="true" />
              {selectedPersonnel.status}
            </span>
          </div>
        </header>

        <div className="profile-map-card__location">
          <MapPin size={17} aria-hidden="true" />
          <div>
            <span>Current location</span>
            <strong>{selectedPersonnel.locationName || 'Location unavailable'}</strong>
            {selectedPersonnel.isLocationStale && selectedPersonnel.lastKnownLocationName && (
              <small>Last known: {selectedPersonnel.lastKnownLocationName}</small>
            )}
          </div>
          <button
            type="button"
            className="profile-map-card__locate"
            onClick={onLocate}
            disabled={!hasCurrentLocation}
            aria-label="Locate personnel on map"
            title={hasCurrentLocation ? 'Locate on map' : 'Waiting for a current GPS fix'}
          >
            <LocateFixed size={17} aria-hidden="true" />
            <span>Locate</span>
          </button>
        </div>

        <div className="profile-map-card__telemetry">
          <div className="profile-map-card__metric">
            <Gauge size={16} aria-hidden="true" />
            <span>Speed</span>
            <strong>{speed}</strong>
          </div>
          <div className="profile-map-card__metric">
            <BatteryMedium size={16} aria-hidden="true" />
            <span>Battery</span>
            <strong>{battery}</strong>
          </div>
          <div className="profile-map-card__metric">
            <Clock3 size={16} aria-hidden="true" />
            <span>GPS time</span>
            <strong>{formatGpsDateTime(selectedPersonnel.locationRecordedAt || selectedPersonnel.lastUpdated)}</strong>
          </div>
          <div className="profile-map-card__metric">
            <Clock3 size={16} aria-hidden="true" />
            <span>Updated</span>
            <strong>{formatTime(selectedPersonnel.lastUpdated)}</strong>
          </div>
        </div>
      </section>
    </div>,
    document.body,
  )
}

export default ProfileModal
