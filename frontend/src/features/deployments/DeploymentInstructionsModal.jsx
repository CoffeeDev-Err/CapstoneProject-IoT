import { FileText } from 'lucide-react'
import { createPortal } from 'react-dom'
import { useId, useRef } from 'react'
import { useAccessibleDialog } from '../../hooks/useAccessibleDialog'

function DeploymentInstructionsModal({ assignment, onClose }) {
  const closeButtonRef = useRef(null)
  const titleId = useId()
  const descriptionId = useId()
  const dialogRef = useAccessibleDialog(Boolean(assignment), onClose, closeButtonRef)

  if (!assignment) return null

  const instructions = assignment.notes?.trim() || 'No additional instructions were provided for this deployment.'

  return createPortal(
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        ref={dialogRef}
        className="confirm-modal deployment-instructions-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="deployment-instructions-modal__heading">
          <span className="deployment-instructions-modal__icon" aria-hidden="true">
            <FileText />
          </span>
          <div>
            <small>DEPLOYMENT</small>
            <h3 id={titleId} className="confirm-modal__title">Instructions</h3>
          </div>
        </div>
        <p className="deployment-instructions-modal__context">
          {assignment.personnelName} | {assignment.patrolArea}
        </p>
        <p id={descriptionId} className="deployment-instructions-modal__content">{instructions}</p>
        <div className="confirm-modal__actions">
          <button
            ref={closeButtonRef}
            type="button"
            className="confirm-btn deployment-instructions-modal__close"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

export default DeploymentInstructionsModal
