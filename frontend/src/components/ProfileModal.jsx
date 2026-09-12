import {
  BatteryMedium,
  Clock3,
  Gauge,
  LocateFixed,
  MapPin,
  RadioTower,
  X,
} from 'lucide-react'
import { createPortal } from 'react-dom'
import { useRef } from 'react'

import GpsReadingAge from './GpsReadingAge'
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

const formatTaskStatus = (value) => String(value || 'open').replaceAll('_', ' ')

function ProfileModal({
  selectedPersonnel,
  selectedTask,
  taskActionBusy = false,
  onClose,
  onLocate,
  onCompleteTask,
}) {
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
            <span>{selectedTask ? 'Current officer location' : 'Last confirmed location'}</span>
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

        {selectedTask && (
          <section className="profile-map-card__request" aria-label="Backup request details">
            <div className="profile-map-card__request-heading">
              <span className="profile-map-card__request-icon" aria-hidden="true">
                <RadioTower size={16} />
              </span>
              <div>
                <small>{selectedTask.type === 'backup' ? 'Backup request' : 'Urgent task'}</small>
                <strong>{selectedTask.title}</strong>
              </div>
              <span className={`profile-map-card__request-status is-${selectedTask.status || 'open'}`}>
                {formatTaskStatus(selectedTask.status)}
              </span>
            </div>
            <dl className="profile-map-card__request-grid">
              <div>
                <dt>Requested at</dt>
                <dd>{formatGpsDateTime(selectedTask.created_at)}</dd>
              </div>
              <div>
                <dt>Request location</dt>
                <dd>{selectedTask.location || 'Location unavailable'}</dd>
              </div>
              <div>
                <dt>Responders</dt>
                <dd>{selectedTask.accepted_by?.length || 0} of {selectedTask.required_responders || 1}</dd>
              </div>
              <div>
                <dt>Request ID</dt>
                <dd>{selectedTask.id}</dd>
              </div>
            </dl>
            {['open', 'full'].includes(selectedTask.status) && onCompleteTask && (
              <button
                type="button"
                className="profile-map-card__request-action"
                onClick={onCompleteTask}
                disabled={taskActionBusy}
              >
                {taskActionBusy ? 'Completing...' : 'Mark completed'}
              </button>
            )}
          </section>
        )}

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
            <strong>{formatGpsDateTime(selectedPersonnel.locationRecordedAt)}</strong>
          </div>
          <div className="profile-map-card__metric">
            <Clock3 size={16} aria-hidden="true" />
            <span>Reading age</span>
            <GpsReadingAge recordedAt={selectedPersonnel.locationRecordedAt} />
          </div>
        </div>
      </section>
    </div>,
    document.body,
  )
}

export default ProfileModal
