import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, expect, it } from 'vitest'
import PatrolPersonnelSelect from './PatrolPersonnelSelect'
afterEach(cleanup)
const personnel = Array.from({ length: 106 }, (_, i) => ({ id: `PNP-${i + 1}`, name: `Officer ${i + 1}`, rank: 'Patrolman', badgeNumber: `BADGE-${i + 1}` }))
function Roster() { const [ids, setIds] = useState([]); return <PatrolPersonnelSelect personnel={personnel} ids={ids} onChange={setIds} disabledIds={['PNP-11']} /> }
it('shows the full roster without pagination and retains selections across searches and filters', () => {
  render(<Roster />)
  const cards = () => within(screen.getByRole('group', { name: 'Personnel selection' })).getAllByRole('button')
  expect(cards()).toHaveLength(106)
  expect(screen.queryByRole('checkbox')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Personnel next page' })).toBeNull()
  fireEvent.click(screen.getByLabelText('Officer 1'))
  expect(screen.getByLabelText('Officer 11')).toBeDisabled()
  fireEvent.click(screen.getByLabelText('Officer 12'))
  fireEvent.change(screen.getByLabelText('Find personnel'), { target: { value: 'BADGE-106' } })
  expect(cards()).toHaveLength(1)
  fireEvent.click(screen.getByLabelText('Officer 106'))
  fireEvent.change(screen.getByLabelText('Find personnel'), { target: { value: '' } })
  fireEvent.change(screen.getByLabelText('Show personnel'), { target: { value: 'selected' } })
  expect(cards()).toHaveLength(3)
  expect(cards().every(button => button.getAttribute('aria-pressed') === 'true')).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Remove Officer 12' }))
  expect(cards()).toHaveLength(2)
  fireEvent.change(screen.getByLabelText('Show personnel'), { target: { value: 'all' } })
  expect(cards()).toHaveLength(106)
  expect(screen.getByLabelText('Officer 1')).toHaveAttribute('aria-pressed', 'true')
})
