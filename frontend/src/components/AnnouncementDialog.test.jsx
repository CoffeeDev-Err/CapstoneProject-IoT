import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import AnnouncementDialog from './AnnouncementDialog'
import { sendPersonnelAnnouncement } from '../services/notifications'
vi.mock('../services/notifications', () => ({ sendPersonnelAnnouncement: vi.fn() }))
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
beforeEach(() => { vi.clearAllMocks(); sendPersonnelAnnouncement.mockResolvedValue({ announcement: { recipientCount: 3, status: 'queued' } }) })
const props = () => ({ open: true, onClose: vi.fn(), onSent: vi.fn() })
const review = () => {
  fireEvent.change(screen.getByLabelText(/Message \/ reason/), { target: { value: 'Attend the briefing.' } })
  fireEvent.change(screen.getByLabelText(/Location/), { target: { value: 'Station' } })
  fireEvent.click(screen.getByText('Review announcement'))
}

it('requires a message, omits a title field, and previews before broadcasting to all accounts', async () => {
  const callbacks = props(); render(<AnnouncementDialog {...callbacks} />)
  expect(screen.queryByLabelText(/title/i)).toBeNull()
  expect(screen.getByText('Includes on-duty and off-duty personnel.')).toBeTruthy()
  review()
  expect(sendPersonnelAnnouncement).not.toHaveBeenCalled()
  expect(screen.getByText('Immediately')).toBeTruthy()
  fireEvent.click(screen.getByText('Send to all personnel'))
  await waitFor(() => expect(callbacks.onSent).toHaveBeenCalledWith({ recipientCount: 3, status: 'queued' }))
  expect(sendPersonnelAnnouncement).toHaveBeenCalledWith(expect.objectContaining({ message: 'Attend the briefing.', location: 'Station', when: 'immediately', event_at: null }))
  expect(callbacks.onClose).toHaveBeenCalled()
})

it('interprets event time as Philippine time and sends it now instead of scheduling delivery', async () => {
  render(<AnnouncementDialog {...props()} />)
  fireEvent.click(screen.getByLabelText('Date and time'))
  fireEvent.change(screen.getByLabelText('Event date and time (PHT)'), { target: { value: '2099-11-09T14:30' } })
  review()
  expect(screen.getByText(/Nov 9, 2099.*2:30 PM PHT/)).toBeTruthy()
  fireEvent.click(screen.getByText('Send to all personnel'))
  await waitFor(() => expect(sendPersonnelAnnouncement).toHaveBeenCalledWith(expect.objectContaining({ event_at: '2099-11-09T14:30:00+08:00' })))
})

it('keeps the same immutable request for an ambiguous retry, even after closing and reopening', async () => {
  sendPersonnelAnnouncement.mockRejectedValueOnce({ status: 408, message: 'Timeout' })
  const callbacks = props(); const view = render(<AnnouncementDialog {...callbacks} />)
  review(); fireEvent.click(screen.getByText('Send to all personnel'))
  await screen.findByText('Retry send')
  expect(screen.queryByText('Back to edit')).toBeNull()
  const first = sendPersonnelAnnouncement.mock.calls[0][0]
  view.rerender(<AnnouncementDialog {...callbacks} open={false} />)
  view.rerender(<AnnouncementDialog {...callbacks} />)
  fireEvent.click(screen.getByText('Retry send'))
  await waitFor(() => expect(sendPersonnelAnnouncement).toHaveBeenCalledTimes(2))
  expect(sendPersonnelAnnouncement.mock.calls[1][0]).toEqual(first)
})

it('prevents duplicate clicks while sending and allows correcting a rejected request', async () => {
  let reject
  sendPersonnelAnnouncement.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail }))
  render(<AnnouncementDialog {...props()} />)
  review(); fireEvent.click(screen.getByText('Send to all personnel'))
  fireEvent.submit(document.querySelector('.announcement-dialog form'))
  expect(sendPersonnelAnnouncement).toHaveBeenCalledTimes(1)
  reject({ status: 400, message: 'Event time has passed.' })
  await screen.findByText('Back to edit')
  fireEvent.click(screen.getByText('Back to edit'))
  expect(screen.getByLabelText(/Message \/ reason/).value).toBe('Attend the briefing.')
})

it('can send from a local HTTP deployment without crypto.randomUUID', async () => {
  vi.stubGlobal('crypto', {})
  render(<AnnouncementDialog {...props()} />)
  review(); fireEvent.click(screen.getByText('Send to all personnel'))
  await waitFor(() => expect(sendPersonnelAnnouncement).toHaveBeenCalledTimes(1))
  expect(sendPersonnelAnnouncement.mock.calls[0][0].request_id).toMatch(/^[a-zA-Z0-9-]{16,80}$/)
})
