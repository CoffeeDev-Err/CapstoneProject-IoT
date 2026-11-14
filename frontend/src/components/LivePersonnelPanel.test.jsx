import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import LivePersonnelPanel from './LivePersonnelPanel'

const props = { collapsed: false, onToggle: vi.fn(), personnelCount: 1,
  personnel: [{ id: 'one', name: 'Ana Reyes', rank: 'Patrolwoman' }],
  connectionMessage: 'Connected', onSelectPersonnel: vi.fn() }
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
  HTMLDialogElement.prototype.showModal = function () { this.open = true }
  HTMLDialogElement.prototype.close = function () { this.open = false }
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('hides the roster from keyboard and accessibility navigation while keeping the show button', () => {
  const view = render(<LivePersonnelPanel {...props} />)
  fireEvent.click(screen.getByRole('button', { name: 'Hide personnel panel' }))
  expect(props.onToggle).toHaveBeenCalledOnce()
  view.rerender(<LivePersonnelPanel {...props} collapsed />)
  expect(screen.queryByRole('button', { name: /Ana Reyes/ })).toBeNull()
  expect(screen.getByRole('button', { name: 'Show personnel panel' }).getAttribute('aria-expanded')).toBe('false')
})

it('opens a mobile drawer and closes it before selecting an officer', () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }))
  render(<LivePersonnelPanel {...props} />)
  const open = screen.getByRole('button', { name: 'Personnel', exact: true })
  fireEvent.click(open)
  expect(screen.getByRole('dialog', { name: 'Live personnel' }).open).toBe(true)
  expect(document.body.style.overflow).toBe('hidden')
  fireEvent.click(screen.getByRole('button', { name: /Ana Reyes/ }))
  expect(props.onSelectPersonnel).toHaveBeenCalledWith(props.personnel[0])
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(document.body.style.overflow).toBe('')
  expect(document.activeElement).toBe(open)
})
