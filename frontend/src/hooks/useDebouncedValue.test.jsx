import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDebouncedValue } from './useDebouncedValue'

describe('useDebouncedValue', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('publishes only the latest value after the full delay', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 250),
      { initialProps: { value: 'initial' } },
    )

    rerender({ value: 'first' })
    act(() => vi.advanceTimersByTime(200))
    rerender({ value: 'latest' })
    act(() => vi.advanceTimersByTime(249))
    expect(result.current).toBe('initial')

    act(() => vi.advanceTimersByTime(1))
    expect(result.current).toBe('latest')
  })

  it('clears pending work when the consumer unmounts', () => {
    const { unmount } = renderHook(() => useDebouncedValue('value', 250))
    expect(vi.getTimerCount()).toBe(1)

    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
