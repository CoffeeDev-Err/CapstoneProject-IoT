import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, expect, it } from 'vitest'
import PatrolPersonnelSelect from './PatrolPersonnelSelect'
afterEach(cleanup)
const personnel = Array.from({ length: 106 }, (_, i) => ({ id: `PNP-${i + 1}`, name: `Officer ${i + 1}`, rank: 'Patrolman', badgeNumber: `BADGE-${i + 1}` }))
function Roster() { const [ids, setIds] = useState([]); return <PatrolPersonnelSelect personnel={personnel} ids={ids} onChange={setIds} disabledIds={['PNP-11']} /> }
it('keeps selections across pages, search and selected-only filters for a large roster', () => {
  render(<Roster />)
  expect(screen.getAllByRole('checkbox')).toHaveLength(10)
  fireEvent.click(screen.getByLabelText('Officer 1'))
  fireEvent.click(screen.getByRole('button', { name: 'Personnel next page' }))
  expect(screen.getByLabelText('Officer 11')).toBeDisabled()
  fireEvent.click(screen.getByLabelText('Officer 12'))
  fireEvent.change(screen.getByLabelText('Find personnel'), { target: { value: 'BADGE-106' } })
  expect(screen.getAllByRole('checkbox')).toHaveLength(1)
  fireEvent.click(screen.getByLabelText('Officer 106'))
  fireEvent.change(screen.getByLabelText('Find personnel'), { target: { value: '' } })
  fireEvent.change(screen.getByLabelText('Show personnel'), { target: { value: 'selected' } })
  expect(screen.getAllByRole('checkbox')).toHaveLength(3)
  expect(screen.getAllByRole('checkbox').every(input => input.checked)).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Remove Officer 12' }))
  expect(screen.getAllByRole('checkbox')).toHaveLength(2)
  fireEvent.change(screen.getByLabelText('Show personnel'), { target: { value: 'all' } })
  fireEvent.change(screen.getByLabelText('Personnel per page'), { target: { value: '25' } })
  expect(screen.getAllByRole('checkbox')).toHaveLength(25)
  expect(screen.getByLabelText('Officer 1')).toBeChecked()
})
