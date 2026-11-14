import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { MemoryRouter, useLocation } from 'react-router-dom'
import TopBar from './TopBar'

afterEach(cleanup)
const notifications = [
  { id:'report-alert', title:'Incident report received', message:'New report in Centro', type:'success', timestamp:new Date().toISOString(), referenceType:'report', referenceId:'RPT-1' },
  { id:'deployment-alert', title:'Deployment updated', message:'Route schedule changed', type:'success', timestamp:new Date().toISOString(), referenceType:'deployment', referenceId:'DEP-1' },
]
function Destination() { const location = useLocation(); return <output>{location.pathname} {location.state?.reportId}</output> }
function mount(props = {}) {
  render(<MemoryRouter initialEntries={['/assign-area']}><TopBar isConnected isDark notifications={notifications} {...props} /><Destination /></MemoryRouter>)
}

it('keeps notification search, read state and report navigation working in the compact header', () => {
  const readAll = vi.fn(), read = vi.fn(), load = vi.fn()
  mount({ onReadAllNotifications:readAll, onReadNotification:read, onShowAllNotifications:load })
  expect(screen.getByText('Deployment Management')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name:'Open notifications' }))
  expect(readAll).toHaveBeenCalledOnce()
  expect(load).toHaveBeenCalledOnce()
  fireEvent.change(screen.getByRole('searchbox', { name:'Search notifications' }), { target:{ value:'Incident' } })
  expect(screen.queryByText('Deployment updated')).toBeNull()
  fireEvent.click(screen.getByText('Incident report received'))
  expect(read).toHaveBeenCalledWith('report-alert')
  expect(screen.getByRole('status')).toHaveTextContent('/reports RPT-1')
  expect(screen.getByRole('button', { name:'Open notifications' })).toHaveAttribute('aria-expanded', 'false')
})

it('requires the existing confirmation before clearing notification history', async () => {
  const clear = vi.fn(), theme = vi.fn()
  mount({ onClearNotifications:clear, onToggleDark:theme })
  fireEvent.click(screen.getByRole('button', { name:'Switch to light mode' }))
  expect(theme).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByRole('button', { name:'Open notifications' }))
  fireEvent.click(screen.getByRole('button', { name:'Clear', exact:true }))
  expect(clear).not.toHaveBeenCalled()
  await waitFor(() => expect(within(screen.getByRole('dialog')).getByRole('button', { name:'Cancel' })).toHaveFocus())
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name:'Cancel' }))
  expect(clear).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name:'Open notifications' }))
  fireEvent.click(screen.getByRole('button', { name:'Clear', exact:true }))
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name:'Clear', exact:true }))
  expect(clear).toHaveBeenCalledOnce()
})
