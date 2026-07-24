/**
 * ProfileModal.jsx — Officer Profile Detail Modal
 *
 * A centred, dismissible modal that appears when a supervisor clicks a map
 * marker or a name in the SidePanel. Shows the officer's full details.
 *
 * Backdrop click  — closes the modal (calls onClose)
 * Stop propagation — prevents clicks inside the card from bubbling to the backdrop
 * Close button    — explicit dismiss
 *
 * Props:
 *   selectedPersonnel {Object|null} — officer object from personnel array,
 *                                     or null when no officer is selected
 *   onClose           {Function}    — called to dismiss the modal
 *   onLocate          {Function}    — called to focus the map on this officer
 */
import { formatTime } from '../utils/dateTime'
import { createPortal } from 'react-dom'

function ProfileModal({ selectedPersonnel, onClose, onLocate }) {
  // Do not render anything if no officer has been selected
  if (!selectedPersonnel) {
    return null
  }

  return createPortal(
    // Semi-transparent backdrop — clicking outside the card dismisses the modal
    <div className="modal-backdrop" role="presentation" onClick={onClose}>

      {/*
        The card itself — stopPropagation prevents backdrop's onClick
        from firing when the user clicks anywhere inside the card.
      */}
      <div className="profile-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>

        {/* Circular officer photo centered at the top of the card */}
        <div className="profile-photo-wrap d-flex justify-content-center mb-3">
          <img
            src={selectedPersonnel.photoUrl}
            alt={selectedPersonnel.name}
            className="profile-photo"
            onError={(e) => {
              e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(selectedPersonnel.name)}&background=1d4ed8&color=fff&size=128`
            }}
          />
        </div>

        {/* Officer name and rank header */}
        <h3 className="mb-0 fw-bold">{selectedPersonnel.name}</h3>
        <p className="rank mb-3">{selectedPersonnel.rank}</p>

        {/* Detail rows — label on left, value on right */}
        <div className="profile-row d-flex justify-content-between align-items-center">
          <span>Location</span>
          <strong>{selectedPersonnel.locationName}</strong>
        </div>
        <div className="profile-row d-flex justify-content-between align-items-center">
          <span>Status</span>
          <strong>{selectedPersonnel.status}</strong>
        </div>
        <div className="profile-row d-flex justify-content-between align-items-center">
          <span>Last Updated</span>
          {/* formatTime converts the ISO timestamp to a human-readable local time */}
          <strong>{formatTime(selectedPersonnel.lastUpdated)}</strong>
        </div>

        {/* Action buttons */}
        <div className="modal-actions">
          <button type="button" className="locate-btn" onClick={onLocate}>
            Locate
          </button>
          <button type="button" className="secondary-btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

export default ProfileModal
