import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useRealtimeNotifications } from './useRealtimeNotifications'
import { deleteNotifications, getNotifications, readAllNotifications, readNotification } from '../../services/notifications'
const showFeedback = vi.hoisted(() => vi.fn())
vi.mock('../../context/useFeedback', () => ({ useFeedback: () => ({ showFeedback }) }))
vi.mock('../../services/notifications', () => ({ deleteNotifications: vi.fn(), getNotifications: vi.fn(), readAllNotifications: vi.fn(), readNotification: vi.fn() }))
const notification = { id: 'server-1', isRead: false, timestamp: '2026-09-01', message: 'Backup' }
beforeEach(() => { vi.resetAllMocks(); getNotifications.mockResolvedValue([notification]) })
afterEach(cleanup)
async function open() {
  const view = renderHook(() => useRealtimeNotifications(true))
  await waitFor(() => expect(view.result.current.notifications).toHaveLength(1))
  return view
}
describe('notification request failures', () => {
  it('keeps unread notifications after failure and supports retry', async () => {
    readAllNotifications.mockRejectedValueOnce({ code: 'NETWORK_ERROR' }).mockResolvedValueOnce({})
    const { result } = await open()
    await act(async () => { await result.current.markAllNotificationsRead() })
    expect(result.current.unreadNotificationCount).toBe(1)
    expect(showFeedback).toHaveBeenCalledWith(expect.stringMatching(/Could not confirm/), expect.objectContaining({ type: 'error' }))
    await act(async () => { await result.current.markAllNotificationsRead() })
    expect(result.current.unreadNotificationCount).toBe(0)
  })
  it('keeps notifications when clearing fails', async () => {
    deleteNotifications.mockRejectedValueOnce({ status: 503 })
    const { result } = await open()
    await act(async () => { await result.current.clearNotifications() })
    expect(result.current.notifications).toHaveLength(1)
  })
  it('preserves alerts received while a clear is pending and prevents duplicate writes', async () => {
    let resolve
    deleteNotifications.mockReturnValue(new Promise((done) => { resolve = done }))
    const { result } = await open()
    let pending
    act(() => { pending = result.current.clearNotifications() })
    await act(async () => { await result.current.clearNotifications(); result.current.addNotification({ message: 'New alert' }) })
    expect(deleteNotifications).toHaveBeenCalledTimes(1)
    await act(async () => { resolve({}); await pending })
    expect(result.current.notifications).toHaveLength(1)
    expect(result.current.notifications[0].message).toBe('New alert')
  })
  it('surfaces history failures and ignores results after sign-out', async () => {
    getNotifications.mockRejectedValueOnce({ status: 401 })
    const view = renderHook(({ authenticated }) => useRealtimeNotifications(authenticated), { initialProps: { authenticated: true } })
    await waitFor(() => expect(showFeedback).toHaveBeenCalledWith(expect.stringMatching(/Sign in again/), expect.anything()))
    view.unmount()
    getNotifications.mockResolvedValueOnce([notification])
    let reject
    readNotification.mockReturnValue(new Promise((_resolve, fail) => { reject = fail }))
    const next = renderHook(({ authenticated }) => useRealtimeNotifications(authenticated), { initialProps: { authenticated: true } })
    await waitFor(() => expect(next.result.current.notifications).toHaveLength(1))
    let pending
    act(() => { pending = next.result.current.markNotificationAsRead('server-1') })
    next.rerender({ authenticated: false })
    showFeedback.mockClear()
    await act(async () => { reject({ status: 503 }); await pending })
    expect(showFeedback).not.toHaveBeenCalled()
  })

  it('preserves actionable metadata and merges repeated server notifications', async () => {
    const { result } = await open()
    await act(async () => {
      result.current.addNotification({
        id: 'server-action',
        title: 'Backup Request',
        referenceType: 'task',
        referenceId: 'TSK-ONE',
        data: { personnelId: 'PNP-ONE' },
      })
      result.current.addNotification({
        id: 'server-action',
        title: 'Backup Request',
        referenceType: 'task',
        referenceId: 'TSK-ONE',
        data: { personnelId: 'PNP-ONE' },
      })
    })
    expect(result.current.notifications.filter((item) => item.id === 'server-action')).toHaveLength(1)
    expect(result.current.notifications[0]).toMatchObject({
      referenceType: 'task', referenceId: 'TSK-ONE', data: { personnelId: 'PNP-ONE' },
    })
  })
})
