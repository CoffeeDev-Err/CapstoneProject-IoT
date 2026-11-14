import { useEffect, useId, useRef, useState } from 'react'
import { ChevronUp, LogOut, UserRoundKey } from 'lucide-react'
import { resolveApiAssetUrl } from '../services/apiAssets'
import InitialsAvatar from './InitialsAvatar'

export default function SidebarAccountMenu({ user, collapsed, onChangePassword, onLogout }) {
  const [open, setOpen] = useState(false)
  const root = useRef(null)
  const trigger = useRef(null)
  const menuId = useId()
  const role = user?.role === 'supervisor' ? 'Supervisor' : 'Officer'
  const name = user?.profile?.fullName || user?.fullName || user?.username || 'Signed-in user'
  const rank = user?.profile?.rank || user?.rank || role
  const photo = resolveApiAssetUrl(user?.profile?.photoUrl || user?.photoUrl)

  useEffect(() => {
    if (!open) return undefined
    root.current?.querySelector('[role="menuitem"]')?.focus()
    const outside = event => { if (!root.current?.contains(event.target)) setOpen(false) }
    document.addEventListener('mousedown', outside)
    document.addEventListener('focusin', outside)
    return () => {
      document.removeEventListener('mousedown', outside)
      document.removeEventListener('focusin', outside)
    }
  }, [open])

  if (!user) return null
  return <div className="sidebar-account" ref={root} onKeyDown={event => {
    if (event.key === 'Escape' && open) {
      event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus()
    }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault()
      if (!open) { setOpen(true); return }
      const items = [...root.current.querySelectorAll('[role="menuitem"]')]
      const index = items.indexOf(document.activeElement)
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
      items[next]?.focus()
    }
  }}>
    <button ref={trigger} type="button" className="sidebar-account__trigger" aria-label="Open profile menu"
      aria-expanded={open} aria-haspopup="menu" aria-controls={open ? menuId : undefined}
      title={collapsed ? `${name} · ${role}` : undefined} onClick={() => setOpen(value => !value)}>
      <InitialsAvatar className="sidebar-account__avatar" src={photo} name={name} />
      {!collapsed && <><span className="sidebar-account__identity"><strong title={name}>{name}</strong><small>{role}</small></span><ChevronUp size={15} aria-hidden="true" /></>}
    </button>
    {open && <div id={menuId} className="sidebar-account__menu" role="menu" aria-label="Profile menu">
      <div className="sidebar-account__details" role="presentation"><strong>{name}</strong>{rank !== role && <span>{rank}</span>}<small>{role}</small></div>
      <button type="button" role="menuitem" onClick={() => { setOpen(false); onChangePassword?.() }}><UserRoundKey size={17} aria-hidden="true" />Change Password</button>
      <button type="button" role="menuitem" className="sidebar-account__logout" onClick={() => { setOpen(false); onLogout?.() }}><LogOut size={17} aria-hidden="true" />Log Out</button>
    </div>}
  </div>
}
