import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { X } from 'lucide-react'
import NavSidebar from './NavSidebar'

export default function MobileNavigation({ open, onClose, user, onChangePassword, onLogout }) {
  const dialogRef = useRef(null)
  const closeRef = useRef(onClose)
  const { pathname } = useLocation()
  useEffect(() => { closeRef.current = onClose }, [onClose])
  useEffect(() => { closeRef.current() }, [pathname])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!open) {
      if (dialog.open) dialog.close()
      return
    }
    dialog.showModal()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const media = window.matchMedia('(max-width: 860px)')
    const handleResize = () => { if (!media.matches) closeRef.current() }
    media.addEventListener('change', handleResize)
    handleResize()
    return () => {
      document.body.style.overflow = previousOverflow
      media.removeEventListener('change', handleResize)
      if (dialog.open) dialog.close()
    }
  }, [open])

  return (
    <dialog ref={dialogRef} id="mobile-navigation" className="mobile-navigation"
      aria-label="Navigation menu" onCancel={onClose}
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return
        const controls = [...event.currentTarget.querySelectorAll('*')]
          .filter((element) => element.tabIndex >= 0 && !element.disabled)
        const first = controls[0]
        const last = controls.at(-1)
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last?.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first?.focus()
        }
      }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div className="mobile-navigation__panel">
        <button type="button" className="icon-btn mobile-navigation__close"
          aria-label="Close navigation" onClick={onClose}><X aria-hidden="true" /></button>
        <NavSidebar key={String(open)} collapsed={false} mobile onNavigate={onClose} user={user} onChangePassword={onChangePassword} onLogout={onLogout} />
      </div>
    </dialog>
  )
}
