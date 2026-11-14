import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { PanelLeftClose, PanelLeftOpen, UsersRound, X } from 'lucide-react'
import SidePanel from './SidePanel'

const query = '(max-width: 860px)'
const subscribe = (listener) => {
  const media = window.matchMedia(query)
  media.addEventListener('change', listener)
  return () => media.removeEventListener('change', listener)
}
const getMobile = () => window.matchMedia(query).matches

export default function LivePersonnelPanel({ collapsed, onToggle, ...panelProps }) {
  const mobile = useSyncExternalStore(subscribe, getMobile, () => false)
  const [open, setOpen] = useState(false)
  const dialogRef = useRef(null)
  const triggerRef = useRef(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!mobile || !open || !dialog) return undefined
    const trigger = triggerRef.current
    dialog.showModal()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
      dialog.close()
      trigger?.focus()
    }
  }, [mobile, open])

  if (mobile) return <>
    <button ref={triggerRef} className="live-personnel-open" type="button"
      aria-haspopup="dialog" aria-expanded={open} aria-controls="live-personnel-drawer"
      onClick={() => setOpen(true)}><UsersRound aria-hidden="true" />Personnel</button>
    <dialog ref={dialogRef} id="live-personnel-drawer" className="live-personnel-drawer"
      aria-label="Live personnel" onCancel={() => setOpen(false)}
      onClick={(event) => { if (event.target === event.currentTarget) setOpen(false) }}>
      <div className="live-personnel-drawer__body">
        <header className="live-personnel-drawer__header"><strong>Live personnel</strong>
          <button className="icon-btn" type="button" aria-label="Close personnel" onClick={() => setOpen(false)}><X aria-hidden="true" /></button>
        </header>
        <SidePanel {...panelProps} onSelectPersonnel={(member) => {
          setOpen(false)
          panelProps.onSelectPersonnel(member)
        }} />
      </div>
    </dialog>
  </>

  return <aside className={`side-panel-shell${collapsed ? ' is-collapsed' : ''}`} aria-label="Personnel panel">
    <button type="button" className={`side-panel-collapse-btn${collapsed ? ' is-collapsed' : ''}`}
      onClick={onToggle} aria-expanded={!collapsed} aria-controls="live-personnel-overview"
      aria-label={collapsed ? 'Show personnel panel' : 'Hide personnel panel'}
      title={collapsed ? 'Show personnel panel' : 'Hide personnel panel'}>
      {collapsed ? <PanelLeftOpen aria-hidden="true" /> : <PanelLeftClose aria-hidden="true" />}
    </button>
    <div id="live-personnel-overview" className="live-personnel-content" hidden={collapsed}>
      <SidePanel {...panelProps} />
    </div>
  </aside>
}
