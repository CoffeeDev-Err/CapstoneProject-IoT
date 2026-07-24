import { createPortal } from 'react-dom'

function ConfirmModal({
  open,
  title = 'Confirm Action',
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  variant = 'danger',
}) {
  if (!open) {
    return null
  }

  return createPortal(
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={onCancel}
    >
      <div
        className="confirm-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className="confirm-modal__title">{title}</h3>
        <p className="confirm-modal__message">{message}</p>

        <div className="confirm-modal__actions">
          <button type="button" className="confirm-btn confirm-btn--cancel" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`confirm-btn ${variant === 'primary' ? 'confirm-btn--primary' : 'confirm-btn--danger'}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

export default ConfirmModal
