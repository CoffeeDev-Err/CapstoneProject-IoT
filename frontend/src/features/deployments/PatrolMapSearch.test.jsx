import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import PatrolMapSearch from './PatrolMapSearch'
import { apiRequest } from '../../services/apiClient'
vi.mock('../../services/apiClient', () => ({ apiRequest: vi.fn() }))
afterEach(() => { cleanup(); vi.clearAllMocks() })

it('searches on Enter and selects a result with the arrow keys and Enter', async () => {
  vi.mocked(apiRequest).mockResolvedValue({ places: [{ label: 'Public market', latitude: 17.43, longitude: 121.765 }, { label: 'Market entrance', latitude: 17.431, longitude: 121.766 }] })
  const onSelect = vi.fn(); render(<PatrolMapSearch onSelect={onSelect} />)
  const input = screen.getByRole('combobox')
  fireEvent.change(input, { target: { value: 'Market' } }); fireEvent.keyDown(input, { key: 'Enter' })
  await screen.findByRole('listbox')
  fireEvent.keyDown(input, { key: 'ArrowDown' }); fireEvent.keyDown(input, { key: 'ArrowDown' }); fireEvent.keyDown(input, { key: 'Enter' })
  expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ label: 'Market entrance' }))
  expect(screen.queryByRole('listbox')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Clear map search' })); expect(input).toHaveValue('')
})

it('ignores a response arriving after the query was cleared', async () => {
  let resolve
  vi.mocked(apiRequest).mockImplementation(() => new Promise(done => { resolve = done }))
  render(<PatrolMapSearch onSelect={vi.fn()} />)
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Market' } }); fireEvent.click(screen.getByRole('button', { name: 'Search' }))
  fireEvent.click(screen.getByRole('button', { name: 'Clear map search' }))
  resolve({ places: [{ label: 'Late result' }] })
  expect(screen.queryByRole('listbox')).toBeNull()
})
