import { useState } from 'react'

export default function PatrolDurationControl({ value, remaining, onChange }) {
  const [custom, setCustom] = useState(false)
  const preset = !custom && [30, 60, 120, 240].includes(value) ? String(value) : 'custom'
  return <div className="patrol-duration">
    <label>Duration<select aria-label="Duration" value={preset} onChange={e => { setCustom(e.target.value === 'custom'); if (e.target.value === 'remaining') onChange(Math.max(15, remaining)); else if (e.target.value !== 'custom') onChange(Number(e.target.value)) }}>
      <option value="30">30 minutes</option><option value="60">1 hour</option><option value="120">2 hours</option><option value="240">4 hours</option>
      <option value="remaining" disabled={remaining < 15}>Remaining duty time ({Math.max(0, remaining)} min)</option><option value="custom">Custom duration</option>
    </select></label>
    {preset === 'custom' && <label>Custom duration (minutes)<input required type="number" min={15} max={1440} step={1} value={value} onChange={e => onChange(Number(e.target.value))} /></label>}
    <small>{value} minutes selected</small>
  </div>
}
