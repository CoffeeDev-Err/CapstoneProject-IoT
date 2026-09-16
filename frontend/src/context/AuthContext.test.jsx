import { StrictMode } from 'react'
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from './AuthContext'
import { useAuth } from './useAuth'
import ProtectedRoute from '../components/ProtectedRoute'
import GuestOnlyRoute from '../components/GuestOnlyRoute'
import { AUTH_USER_KEY, getCurrentUser, logoutSession } from '../services/auth'

vi.mock('../services/auth', () => ({ AUTH_USER_KEY: 'test_user', AUTH_TOKEN_KEY: 'test_token', getCurrentUser: vi.fn(), logoutSession: vi.fn() }))
const user = { id: 'supervisor', role: 'supervisor' }
beforeEach(() => {
  vi.useFakeTimers()
  vi.resetAllMocks()
  localStorage.clear()
  logoutSession.mockResolvedValue({})
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks() })
const flush = () => act(async () => {})
describe('session outage recovery', () => {
  it('removes a legacy cached profile during outages without granting unverified access', async () => {
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user))
    getCurrentUser.mockRejectedValueOnce({ status: 503 }).mockResolvedValueOnce({ user })
    const { result } = renderHook(useAuth, { wrapper: AuthProvider })
    await flush()
    expect(result.current.loading).toBe(false)
    expect(result.current.isAuthenticated).toBe(false)
    expect(result.current.sessionError).toMatch(/Unable to verify/)
    expect(localStorage.getItem(AUTH_USER_KEY)).toBeNull()
    await act(async () => { await result.current.refreshSession() })
    expect(result.current.isAuthenticated).toBe(true)
    expect(result.current.sessionError).toBe('')
    expect(localStorage.getItem(AUTH_USER_KEY)).toBeNull()
  })
  it('shows recovery instead of login on protected and guest routes', async () => {
    getCurrentUser.mockRejectedValue({ code: 'NETWORK_ERROR' })
    for (const path of ['/', '/login']) {
      const view = render(<AuthProvider><MemoryRouter initialEntries={[path]}><Routes>
        <Route element={<ProtectedRoute />}><Route path="/" element={<p>Private page</p>} /></Route>
        <Route element={<GuestOnlyRoute />}><Route path="/login" element={<p>Login form</p>} /></Route>
      </Routes></MemoryRouter></AuthProvider>)
      await flush()
      expect(screen.getByRole('heading', { name: 'Unable to verify your session' })).toBeInTheDocument()
      expect(screen.queryByText('Private page')).not.toBeInTheDocument()
      expect(screen.queryByText('Login form')).not.toBeInTheDocument()
      fireEvent.click(screen.getByText('Try again'))
      await flush()
      view.unmount()
    }
  })
  it('keeps a verified user signed in when a background check times out', async () => {
    getCurrentUser.mockResolvedValueOnce({ user }).mockRejectedValueOnce({ status: 408 })
    const { result } = renderHook(useAuth, { wrapper: AuthProvider })
    await flush()
    await act(async () => { await result.current.refreshSession() })
    expect(result.current.isAuthenticated).toBe(true)
    expect(result.current.user).toEqual(user)
    expect(result.current.sessionError).toBeTruthy()
  })
  it.each([401, 403])('clears a definitively invalid session for status %s', async (status) => {
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user))
    getCurrentUser.mockRejectedValueOnce({ status })
    const { result } = renderHook(useAuth, { wrapper: AuthProvider })
    await flush()
    expect(result.current.isAuthenticated).toBe(false)
    expect(result.current.sessionError).toBe('')
    expect(localStorage.getItem(AUTH_USER_KEY)).toBeNull()
  })
  it('automatically retries temporary errors and cleans up retry timers', async () => {
    const intervals = vi.spyOn(globalThis, 'setInterval')
    const cleared = vi.spyOn(globalThis, 'clearInterval')
    getCurrentUser.mockRejectedValueOnce({ status: 503 }).mockResolvedValueOnce({ user })
    const { result, unmount } = renderHook(useAuth, { wrapper: AuthProvider })
    await flush()
    const retryTimer = intervals.mock.results[0].value
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000) })
    expect(result.current.isAuthenticated).toBe(true)
    expect(getCurrentUser).toHaveBeenCalledTimes(2)
    unmount()
    expect(cleared).toHaveBeenCalledWith(retryTimer)
  })
  it('does not restore a user from a late response after logout', async () => {
    let resolve
    getCurrentUser.mockReturnValue(new Promise((done) => { resolve = done }))
    const { result } = renderHook(useAuth, { wrapper: AuthProvider })
    await act(async () => { await result.current.logout() })
    await act(async () => { resolve({ user }) })
    expect(result.current.user).toBeNull()
    expect(result.current.isAuthenticated).toBe(false)
  })
  it('ignores a stale bootstrap failure after successful login and supports StrictMode', async () => {
    const rejects = []
    getCurrentUser.mockImplementation(() => new Promise((_done, fail) => { rejects.push(fail) }))
    const wrapper = ({ children }) => <StrictMode><AuthProvider>{children}</AuthProvider></StrictMode>
    const { result } = renderHook(useAuth, { wrapper })
    await act(async () => { result.current.establishSession({ user }); rejects.forEach((reject) => reject({ status: 401 })) })
    expect(result.current.isAuthenticated).toBe(true)
    expect(result.current.sessionError).toBe('')
  })
})
