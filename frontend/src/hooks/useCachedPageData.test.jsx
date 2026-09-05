import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PageCacheProvider } from '../context/PageCacheProvider'
import { useCachedPageData } from './useCachedPageData'

describe('cached page updates', () => {
  it('supports account create, edit, and delete functional updates', () => {
    const { result } = renderHook(() => useCachedPageData('accounts', []), {
      wrapper: PageCacheProvider,
    })
    expect(result.current[2]).toBe(false)
    const originalSetter = result.current[1]
    act(() => result.current[1]((previous) => [...previous, { id: 'one', name: 'Old' }]))
    expect(result.current[0]).toEqual([{ id: 'one', name: 'Old' }])
    expect(result.current[1]).toBe(originalSetter)
    act(() => result.current[1]((previous) => previous.map((row) => ({ ...row, name: 'New' }))))
    expect(result.current[0][0].name).toBe('New')
    act(() => result.current[1]((previous) => previous.filter((row) => row.id !== 'one')))
    expect(result.current[0]).toEqual([])
    expect(result.current[2]).toBe(true)
  })
})
