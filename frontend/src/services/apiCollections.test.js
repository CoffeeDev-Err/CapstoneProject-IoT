import { afterEach, expect, it, vi } from 'vitest'
import { apiRequest } from './apiClient'
import { getPaginatedCollection } from './apiCollections'

vi.mock('./apiClient', () => ({ apiRequest: vi.fn() }))
afterEach(() => vi.resetAllMocks())

it('includes personnel after the first hundred records', async () => {
  apiRequest.mockResolvedValueOnce({ data: Array.from({ length: 100 }, (_, id) => ({ id })), pagination: { totalPages: 2 } })
    .mockResolvedValueOnce({ data: [{ id: 100 }], pagination: { totalPages: 2 } })
  const rows = await getPaginatedCollection('/api/personnel', 'Unavailable')
  expect(rows).toHaveLength(101)
  expect(rows.at(-1).id).toBe(100)
  expect(apiRequest).toHaveBeenLastCalledWith('/api/personnel?limit=100&page=2', { errorMessage: 'Unavailable' })
})

it('fails visibly if a later coverage page fails instead of returning incomplete counts', async () => {
  apiRequest.mockResolvedValueOnce({ data: [{ id: 1 }], pagination: { totalPages: 2 } }).mockRejectedValueOnce(new Error('Unavailable'))
  await expect(getPaginatedCollection('/api/deployments?status=active', 'Unavailable')).rejects.toThrow('Unavailable')
})
