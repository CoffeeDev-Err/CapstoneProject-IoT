import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import SidebarAccountMenu from './SidebarAccountMenu'

afterEach(cleanup)
const user = { fullName:'Test Supervisor', role:'supervisor', profile:{ rank:'Police Captain', photoUrl:'/uploads/account-photo.png' } }

it('supports keyboard account actions and restores focus on Escape', () => {
  const password = vi.fn(), logout = vi.fn()
  render(<SidebarAccountMenu user={user} collapsed onChangePassword={password} onLogout={logout} />)
  const trigger = screen.getByRole('button', { name:'Open profile menu' })
  fireEvent.keyDown(trigger, { key:'ArrowDown' })
  expect(screen.getByRole('menuitem', { name:'Change Password' })).toHaveFocus()
  fireEvent.keyDown(document.activeElement, { key:'ArrowDown' })
  expect(screen.getByRole('menuitem', { name:'Log Out' })).toHaveFocus()
  fireEvent.keyDown(document.activeElement, { key:'Escape' })
  expect(screen.queryByRole('menu')).toBeNull()
  expect(trigger).toHaveFocus()
  fireEvent.click(trigger)
  fireEvent.click(screen.getByRole('menuitem', { name:'Change Password' }))
  expect(password).toHaveBeenCalledTimes(1)
  fireEvent.click(trigger)
  fireEvent.click(screen.getByRole('menuitem', { name:'Log Out' }))
  expect(logout).toHaveBeenCalledTimes(1)
})

it('shows account identity with an avatar fallback and dismisses outside', () => {
  render(<><SidebarAccountMenu user={user} /><button>Outside</button></>)
  fireEvent.error(screen.getByRole('button', { name:'Open profile menu' }).querySelector('img'))
  expect(screen.getByText('TS')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name:'Open profile menu' }))
  expect(screen.getByText('Police Captain')).toBeInTheDocument()
  fireEvent.mouseDown(screen.getByText('Outside'))
  expect(screen.queryByRole('menu')).toBeNull()
})
