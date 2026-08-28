import { useEffect, useMemo, useRef, useState } from 'react'
import { rankOptions } from './accountPresentation'
import { matchesPrefixSearch } from '../../utils/searchMatching'

function AccountRankPicker({ value, onChange, invalid }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [dropdownLayout, setDropdownLayout] = useState({ placement: 'below', maxHeight: 260 })
  const pickerRef = useRef(null)
  const filteredRanks = useMemo(() => (
    rankOptions.filter((rank) => matchesPrefixSearch(search, [rank]))
  ), [search])

  useEffect(() => {
    if (!open) return undefined

    const handlePointerDownOutside = (event) => {
      if (!pickerRef.current?.contains(event.target)) {
        setOpen(false)
        setSearch('')
      }
    }

    document.addEventListener('pointerdown', handlePointerDownOutside)
    return () => document.removeEventListener('pointerdown', handlePointerDownOutside)
  }, [open])

  const closePicker = () => {
    setOpen(false)
    setSearch('')
  }

  const togglePicker = () => {
    if (open) {
      closePicker()
      return
    }

    const pickerBounds = pickerRef.current?.getBoundingClientRect()
    const topBarBottom = document.querySelector('.top-bar')?.getBoundingClientRect().bottom || 0
    const viewportHeight = window.innerHeight
    const desiredHeight = Math.min(260, viewportHeight * 0.38)
    const spaceBelow = Math.max(0, viewportHeight - (pickerBounds?.bottom || 0) - 12)
    const spaceAbove = Math.max(0, (pickerBounds?.top || 0) - topBarBottom - 12)
    const placement = spaceBelow >= Math.min(180, desiredHeight) || spaceBelow >= spaceAbove
      ? 'below'
      : 'above'
    const availableSpace = placement === 'below' ? spaceBelow : spaceAbove

    setDropdownLayout({
      placement,
      maxHeight: Math.min(desiredHeight, availableSpace),
    })
    setSearch('')
    setOpen(true)
  }

  return (
    <div
      ref={pickerRef}
      className="account-rank-picker"
      onKeyDown={(event) => {
        if (event.key === 'Escape') closePicker()
      }}
    >
      <button
        type="button"
        className={`settings-input account-rank-trigger${invalid ? ' settings-input--error' : ''}`}
        onClick={togglePicker}
        aria-labelledby="account-rank-label account-rank-value"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls="account-rank-options"
        aria-invalid={invalid}
      >
        <span id="account-rank-value">{value}</span>
        <span className="account-rank-trigger__icon" aria-hidden="true">⌄</span>
      </button>

      {open && (
        <div
          className={`account-rank-dropdown account-rank-dropdown--${dropdownLayout.placement}`}
          style={{ '--account-rank-max-height': `${dropdownLayout.maxHeight}px` }}
        >
          <div className="account-rank-search">
            <input
              type="search"
              className="settings-input"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search rank"
              aria-label="Search police rank"
              autoFocus
            />
          </div>
          <div id="account-rank-options" className="account-rank-options" role="listbox">
            {filteredRanks.length === 0 ? (
              <p className="account-rank-empty">No matching rank.</p>
            ) : filteredRanks.map((rank) => (
              <button
                key={rank}
                type="button"
                role="option"
                aria-selected={value === rank}
                className={`account-rank-option${value === rank ? ' is-selected' : ''}`}
                onClick={() => {
                  onChange(rank)
                  closePicker()
                }}
              >
                <span>{rank}</span>
                {value === rank && <span aria-hidden="true">✓</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default AccountRankPicker
