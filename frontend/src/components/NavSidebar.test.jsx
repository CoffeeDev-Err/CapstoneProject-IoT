import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { prefetchRoute } from '../routes/routeLoaders'
import NavSidebar from './NavSidebar'
vi.mock('../routes/routeLoaders', () => ({ prefetchRoute: vi.fn() }))
afterEach(() => { cleanup(); vi.clearAllMocks() })

it('prefetches the intended route on pointer, keyboard and touch interaction', () => {
  render(<MemoryRouter><NavSidebar /></MemoryRouter>)
  const personnel = screen.getByRole('link', { name: 'Personnel' })
  fireEvent.pointerEnter(personnel)
  fireEvent.focus(personnel)
  fireEvent.touchStart(personnel)
  expect(prefetchRoute).toHaveBeenCalledTimes(3)
  expect(prefetchRoute).toHaveBeenLastCalledWith('/personnel')
  expect(personnel).toHaveAttribute('href', '/personnel')
})
