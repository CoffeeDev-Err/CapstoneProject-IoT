import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'

const menuPosition = box => {
  const below = window.innerHeight - box.bottom - 12, above = box.top - 12
  const upward = below < 180 && above > below
  const width = Math.min(Math.max(box.width, 150), window.innerWidth - 24)
  return { position: 'fixed', width, left: Math.max(12, Math.min(box.left, window.innerWidth - width - 12)),
    maxHeight: Math.max(60, Math.min(280, upward ? above : below)),
    ...(upward ? { bottom: window.innerHeight - box.top + 5 } : { top: box.bottom + 5 }) }
}

export default function SelectControl({ className = '', wrapperClassName = '', children, ...props }) {
  const id = useId()
  const selectRef = useRef(null)
  const menuRef = useRef(null)
  const searchRef = useRef({ text: '', time: 0 })
  const [menu, setMenu] = useState(null)
  const options = menu?.options || []
  const close = () => setMenu(null)
  const open = () => {
    const select = selectRef.current
    if (!select || select.matches(':disabled')) return
    const box = select.getBoundingClientRect()
    const optionRows = Array.from(select.options, option => ({ value: option.value, text: option.text, disabled: option.disabled || option.parentElement?.disabled, selected: option.selected }))
    setMenu({ index: select.selectedIndex, options: optionRows, label: props['aria-label'] || select.labels?.[0]?.textContent?.trim() || 'Options', style: menuPosition(box) })
    select.focus({ preventScroll: true })
  }
  const choose = index => {
    const select = selectRef.current
    const option = select?.options[index]
    if (!option || option.disabled || select.matches(':disabled')) return
    select.value = option.value
    select.dispatchEvent(new Event('change', { bubbles: true }))
    close()
    select.focus({ preventScroll: true })
  }
  useEffect(() => {
    if (!menu) return undefined
    const outside = event => {
      if (!selectRef.current?.parentElement.contains(event.target) && !menuRef.current?.contains(event.target)) setMenu(null)
    }
    const scroll = event => {
      if (menuRef.current?.contains(event.target)) return
      const box = selectRef.current?.getBoundingClientRect()
      if (!box || box.bottom <= 0 || box.top >= window.innerHeight) { setMenu(null); return }
      const style = menuPosition(box)
      setMenu(current => !current || JSON.stringify(current.style) === JSON.stringify(style) ? current : { ...current, style })
    }
    document.addEventListener('pointerdown', outside)
    window.addEventListener('resize', scroll)
    window.addEventListener('scroll', scroll, true)
    return () => { document.removeEventListener('pointerdown', outside); window.removeEventListener('resize', scroll); window.removeEventListener('scroll', scroll, true) }
  }, [menu])
  useEffect(() => {
    if (!menu) return
    const list = menuRef.current, option = list?.querySelector('[data-highlighted="true"]')
    if (!option) return
    if (option.offsetTop < list.scrollTop) list.scrollTop = option.offsetTop
    else if (option.offsetTop + option.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = option.offsetTop + option.offsetHeight - list.clientHeight
  }, [menu])
  const keyDown = event => {
    props.onKeyDown?.(event)
    if (event.defaultPrevented) return
    if (event.key === 'Tab') { close(); return }
    if (event.key === 'Escape' && menu) { event.preventDefault(); event.stopPropagation(); close(); return }
    if (['Enter', ' ', 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault()
      if (!menu) { open(); return }
      if (event.key === 'Enter' || event.key === ' ') { choose(menu.index); return }
      const enabled = options.map((option, index) => !option.disabled ? index : -1).filter(index => index >= 0)
      const position = enabled.indexOf(menu.index)
      const index = event.key === 'Home' ? enabled[0] : event.key === 'End' ? enabled.at(-1)
        : enabled[Math.max(0, Math.min(enabled.length - 1, position + (event.key === 'ArrowDown' ? 1 : -1)))]
      setMenu(current => ({ ...current, index })); return
    }
    if (menu && event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault()
      const now = Date.now()
      const text = (now - searchRef.current.time < 700 ? searchRef.current.text : '') + event.key.toLowerCase()
      searchRef.current = { text, time: now }
      const index = options.findIndex(option => !option.disabled && option.text.toLowerCase().startsWith(text))
      if (index >= 0) setMenu(current => ({ ...current, index }))
    }
  }
  return (
    <span className={`select-control${wrapperClassName ? ` ${wrapperClassName}` : ''}`}>
      <select {...props} ref={selectRef} id={props.id || id} className={className}
        aria-expanded={Boolean(menu)} aria-controls={menu ? `${id}-options` : undefined}
        aria-activedescendant={menu ? `${id}-option-${menu.index}` : undefined}
        onPointerDown={event => event.preventDefault()}
        onMouseDown={event => event.preventDefault()} onClick={event => { event.preventDefault(); if (menu) close(); else open() }} onKeyDown={keyDown}
        onBlur={event => { props.onBlur?.(event); close() }}>{children}</select>
      <ChevronDown className="select-control__icon" aria-hidden="true" />
      {menu && createPortal(<div ref={menuRef} id={`${id}-options`} role="listbox"
        aria-label={menu.label}
        data-select-owner={props.id || id} className="select-control__menu" style={menu.style}
        onPointerDown={event => event.preventDefault()} onClick={event => event.stopPropagation()}>
        {options.map((option, index) => <div id={`${id}-option-${index}`} key={`${option.value}-${index}`} role="option"
          aria-selected={option.selected} aria-disabled={option.disabled || undefined} data-highlighted={menu.index === index}
          className="select-control__option" onPointerMove={() => !option.disabled && setMenu(current => ({ ...current, index }))}
          onClick={() => choose(index)}><span>{option.text}</span>{option.selected && <Check size={15} aria-hidden="true" />}</div>)}
      </div>, document.body)}
    </span>
  )
}
