import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import AppLayout from './AppLayout'

const auth = vi.hoisted(() => ({ user:{ id:'test', fullName:'Test Supervisor', role:'supervisor' }, logout:vi.fn(), clearSession:vi.fn() }))
vi.mock('../context/useAuth', () => ({ useAuth:() => auth }))
vi.mock('../context/usePersonnelContext', () => ({ usePersonnelContext:() => ({ notifications:[], isConnected:true }) }))
vi.mock('./SystemStatusBanner', () => ({ default:() => null }))
vi.mock('./PasswordChangeModal', () => ({ default:({ open, onChanged, onClose }) => open && <div role="dialog" aria-label="Change Password"><button onClick={onChanged}>Password changed</button><button onClick={onClose}>Close password</button></div> }))
vi.mock('../routes/routeLoaders', () => ({ prefetchRoute:vi.fn() }))

beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({ matches:true, addEventListener:vi.fn(), removeEventListener:vi.fn() }))
  HTMLDialogElement.prototype.showModal = function () { this.open = true }
  HTMLDialogElement.prototype.close = function () { this.open = false }
})
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals() })
function mount() {
  render(<MemoryRouter initialEntries={['/assign-area']}><Routes><Route element={<AppLayout />}><Route path="/assign-area" element={<p>Patrol planner</p>} /></Route><Route path="/login" element={<p>Signed out</p>} /></Routes></MemoryRouter>)
}

it('moves account access to the drawer and closes native navigation before opening the shared password dialog', async () => {
  mount()
  expect(within(screen.getByRole('banner')).queryByRole('button', { name:'Open profile menu' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name:'Open navigation' }))
  const drawer = screen.getByRole('dialog', { name:'Navigation menu' })
  fireEvent.click(within(drawer).getByRole('button', { name:'Open profile menu' }))
  fireEvent.click(within(drawer).getByRole('menuitem', { name:'Change Password' }))
  expect(drawer.open).toBe(false)
  expect(screen.getByRole('dialog', { name:'Change Password' })).toBeInTheDocument()
  fireEvent.click(screen.getByText('Close password'))
  await waitFor(() => expect(screen.getByRole('button', { name:'Open navigation' })).toHaveFocus())
})

it('preserves sign-out and post-password-change session clearing', async () => {
  mount()
  fireEvent.click(screen.getByRole('button', { name:'Open profile menu' }))
  await act(async () => { fireEvent.click(screen.getByRole('menuitem', { name:'Log Out' })) })
  expect(auth.logout).toHaveBeenCalledTimes(1)
  expect(screen.getByText('Signed out')).toBeInTheDocument()
  cleanup(); mount()
  fireEvent.click(screen.getByRole('button', { name:'Open profile menu' }))
  fireEvent.click(screen.getByRole('menuitem', { name:'Change Password' }))
  fireEvent.click(screen.getByText('Password changed'))
  expect(auth.clearSession).toHaveBeenCalledTimes(1)
  expect(screen.getByText('Signed out')).toBeInTheDocument()
})
