import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useRealtimeNotifications } from './useRealtimeNotifications'
import { deleteNotifications, getNotificationPage, readAllNotifications, readNotification } from '../../services/notifications'
const showFeedback = vi.hoisted(() => vi.fn())
vi.mock('../../context/useFeedback', () => ({ useFeedback: () => ({ showFeedback }) }))
vi.mock('../../services/notifications', () => ({ deleteNotifications: vi.fn(), getNotificationPage: vi.fn(), readAllNotifications: vi.fn(), readNotification: vi.fn() }))
const notification = { id: 'server-1', isRead: false, timestamp: '2026-09-01', message: 'Backup' }
const page = (notifications, { hasNextPage = false, nextCursor = null } = {}) => ({
  notifications,
  pagination: { limit: 50, hasNextPage, nextCursor },
  unreadCount: notifications.filter((item) => !item.isRead).length,
})
beforeEach(() => { vi.resetAllMocks(); getNotificationPage.mockResolvedValue(page([notification])) })
afterEach(cleanup)
async function open(expectedLength = 1) {
  const view = renderHook(() => useRealtimeNotifications(true))
  await waitFor(() => expect(view.result.current.notifications).toHaveLength(expectedLength))
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
    getNotificationPage.mockRejectedValueOnce({ status: 401 })
    const view = renderHook(({ authenticated }) => useRealtimeNotifications(authenticated), { initialProps: { authenticated: true } })
    await waitFor(() => expect(showFeedback).toHaveBeenCalledWith(expect.stringMatching(/Sign in again/), expect.anything()))
    view.unmount()
    getNotificationPage.mockResolvedValueOnce(page([notification]))
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

  it('loads every cursor page without the old 25-notification cap', async () => {
    const first = Array.from({ length: 50 }, (_, index) => ({
      ...notification, id: `server-${index}`, timestamp: `2026-09-01T00:${String(index).padStart(2, '0')}:00Z`,
    }))
    const rest = Array.from({ length: 25 }, (_, index) => ({
      ...notification, id: `server-${index + 50}`, timestamp: `2026-08-31T23:${String(index).padStart(2, '0')}:00Z`,
    }))
    getNotificationPage
      .mockResolvedValueOnce(page(first, { hasNextPage: true, nextCursor: 'next-page' }))
      .mockResolvedValueOnce(page(rest))
    const { result } = await open(50)
    expect(result.current.notifications).toHaveLength(50)
    await act(async () => { await result.current.loadAllNotifications() })
    expect(getNotificationPage).toHaveBeenLastCalledWith({ cursor: 'next-page', limit: 50 })
    expect(result.current.notifications).toHaveLength(75)
    expect(result.current.hasMoreNotifications).toBe(false)
  })
})
