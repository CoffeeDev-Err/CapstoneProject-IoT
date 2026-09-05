import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'
import ProtectedRoute from './ProtectedRoute'
import { useCachedPageData } from '../hooks/useCachedPageData'

const auth = vi.hoisted(() => ({ current: null }))
vi.mock('../context/useAuth', () => ({ useAuth: () => auth.current }))
afterEach(cleanup)

function CachedPage() {
  const [value, setValue] = useCachedPageData('test', 'Uncached')
  return <>
    <span>{value}</span>
    <button onClick={() => setValue('Cached')}>Load data</button>
    <Link to="/other">Leave page</Link>
  </>
}
function App() {
  return <MemoryRouter initialEntries={['/']}>
    <Routes>
      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<CachedPage />} />
        <Route path="/other" element={<Link to="/">Return to page</Link>} />
      </Route>
      <Route path="/login" element={<Link to="/">Sign in again</Link>} />
    </Routes>
  </MemoryRouter>
}

describe('authenticated page cache lifetime', () => {
  it('survives navigation but clears when the user signs out and back in', () => {
    const session = { loading: false, isAuthenticated: true, user: { id: 'supervisor' } }
    auth.current = session
    const app = render(<App />)
    fireEvent.click(screen.getByText('Load data'))
    fireEvent.click(screen.getByText('Leave page'))
    fireEvent.click(screen.getByText('Return to page'))
    expect(screen.getByText('Cached')).toBeInTheDocument()
    auth.current = { loading: false, isAuthenticated: false, user: null }
    app.rerender(<App />)
    expect(screen.queryByText('Cached')).not.toBeInTheDocument()
    auth.current = session
    app.rerender(<App />)
    fireEvent.click(screen.getByText('Sign in again'))
    expect(screen.getByText('Uncached')).toBeInTheDocument()
  })
})
