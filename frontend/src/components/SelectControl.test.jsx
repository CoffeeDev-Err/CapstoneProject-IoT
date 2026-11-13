import { useState } from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import SelectControl from './SelectControl'
afterEach(cleanup)
function Filter() {
  const [value, setValue] = useState('all')
  return <label>People<SelectControl value={value} onChange={event => setValue(event.target.value)}>
    <option value="all">All personnel</option><option value="selected">Selected</option><option value="unavailable" disabled>Unavailable</option>
  </SelectControl></label>
}
it('opens a themed portal menu, updates the real form control and retains focus', () => {
  render(<Filter />)
  const select = screen.getByLabelText('People')
  fireEvent.click(select)
  const menu = screen.getByRole('listbox')
  fireEvent.click(within(menu).getByRole('option', { name: 'Selected' }))
  expect(select).toHaveValue('selected')
  expect(select).toHaveFocus()
  expect(screen.queryByRole('listbox')).toBeNull()
})
it('supports keyboard selection, disabled options and Escape without changing the selection', () => {
  render(<Filter />)
  const select = screen.getByLabelText('People')
  fireEvent.keyDown(select, { key: 'ArrowDown' })
  fireEvent.keyDown(select, { key: 'End' })
  fireEvent.keyDown(select, { key: 'Enter' })
  expect(select).toHaveValue('selected')
  fireEvent.keyDown(select, { key: ' ' })
  fireEvent.keyDown(select, { key: 'Home' })
  fireEvent.keyDown(select, { key: 'Escape' })
  expect(select).toHaveValue('selected')
  expect(screen.queryByRole('listbox')).toBeNull()
})
