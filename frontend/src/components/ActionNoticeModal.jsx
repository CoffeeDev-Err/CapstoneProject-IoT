import { AlertCircle } from 'lucide-react'
import { createPortal } from 'react-dom'
import { useId, useRef } from 'react'
import { useAccessibleDialog } from '../hooks/useAccessibleDialog'

function ActionNoticeModal({
  open,
  title = 'Action unavailable',
  message,
  items = [],
  closeLabel = 'Review fields',
  onClose,
}) {
  const closeButtonRef = useRef(null)
  const titleId = useId()
  const descriptionId = useId()
  const dialogRef = useAccessibleDialog(open, onClose, closeButtonRef)

  if (!open) return null

  return createPortal(
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        ref={dialogRef}
        className="confirm-modal action-notice-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="action-notice-modal__heading">
          <span className="action-notice-modal__icon" aria-hidden="true">
            <AlertCircle />
          </span>
          <h3 id={titleId} className="confirm-modal__title">{title}</h3>
        </div>
        <p id={descriptionId} className="confirm-modal__message">{message}</p>
        {items.length > 0 && (
          <ul className="action-notice-modal__list">
            {items.map((item) => <li key={item}>{item}</li>)}
          </ul>
        )}

        <div className="confirm-modal__actions">
          <button
            ref={closeButtonRef}
            type="button"
            className="confirm-btn confirm-btn--primary"
            onClick={onClose}
          >
            {closeLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

export default ActionNoticeModal
