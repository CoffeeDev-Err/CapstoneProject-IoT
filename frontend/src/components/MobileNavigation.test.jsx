import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { useState } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import MobileNavigation from './MobileNavigation'

let mediaListener
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.open = true }
  HTMLDialogElement.prototype.close = function () { this.open = false }
  vi.stubGlobal('matchMedia', () => ({ matches: true,
    addEventListener: (_, callback) => { mediaListener = callback }, removeEventListener: vi.fn() }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

function Harness() {
  const [open, setOpen] = useState(false)
  return <MemoryRouter><button onClick={() => setOpen(true)}>Open menu</button>
    <MobileNavigation open={open} onClose={() => setOpen(false)} /></MemoryRouter>
}

it('opens a modal navigation menu and restores scrolling after selecting a route', () => {
  render(<Harness />)
  fireEvent.click(screen.getByText('Open menu'))
  expect(screen.getByRole('dialog').open).toBe(true)
  expect(document.body.style.overflow).toBe('hidden')
  fireEvent.click(screen.getByRole('link', { name: 'Personnel' }))
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(document.body.style.overflow).toBe('')
})

it('dismisses using the close button, backdrop, and Escape cancel event', () => {
  render(<Harness />)
  for (const action of ['close', 'backdrop', 'escape']) {
    fireEvent.click(screen.getByText('Open menu'))
    const dialog = screen.getByRole('dialog')
    if (action === 'close') fireEvent.click(screen.getByRole('button', { name: 'Close navigation' }))
    if (action === 'backdrop') fireEvent.click(dialog)
    if (action === 'escape') fireEvent(dialog, new Event('cancel', { bubbles: false }))
    expect(dialog.open).toBe(false)
    expect(document.body.style.overflow).toBe('')
  }
})

it('registers a viewport listener and restores scrolling on unmount', () => {
  const { unmount } = render(<Harness />)
  fireEvent.click(screen.getByText('Open menu'))
  expect(mediaListener).toBeTypeOf('function')
  unmount()
  expect(document.body.style.overflow).toBe('')
})

it('cycles keyboard focus between the first and last menu controls', () => {
  render(<Harness />)
  fireEvent.click(screen.getByText('Open menu'))
  const first = screen.getByRole('button', { name: 'Close navigation' })
  const last = screen.getByRole('link', { name: 'Account Management' })
  first.focus()
  fireEvent.keyDown(first, { key: 'Tab', shiftKey: true })
  expect(document.activeElement).toBe(last)
  fireEvent.keyDown(last, { key: 'Tab' })
  expect(document.activeElement).toBe(first)
})
