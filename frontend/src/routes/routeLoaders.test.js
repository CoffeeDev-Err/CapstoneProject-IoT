import { expect, it, vi } from 'vitest'
import { createRouteLoader, scheduleRoutePreloads } from './routeLoaders'

it('shares concurrent imports and retries a failed prefetch on the next request', async () => {
  const importer = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ default: 'Page' })
  const load = createRouteLoader(importer)
  const first = load()
  expect(load()).toBe(first)
  await expect(first).rejects.toThrow('offline')
  expect(await load()).toEqual({ default: 'Page' })
  await load()
  expect(importer).toHaveBeenCalledTimes(2)
})

it('preloads sequentially in idle slots and stops scheduling after cleanup', async () => {
  const callbacks = []
  const host = { requestIdleCallback: vi.fn(cb => { callbacks.push(cb); return callbacks.length }), cancelIdleCallback: vi.fn() }
  let finish
  const first = vi.fn(() => new Promise(resolve => { finish = resolve }))
  const second = vi.fn().mockResolvedValue({})
  const cancel = scheduleRoutePreloads({ host, connection: {}, loaders: [first, second] })
  const running = callbacks[0]()
  expect(first).toHaveBeenCalledOnce()
  expect(second).not.toHaveBeenCalled()
  expect(callbacks).toHaveLength(1)
  finish()
  await running
  expect(callbacks).toHaveLength(2)
  cancel()
  await callbacks[1]()
  expect(second).not.toHaveBeenCalled()
  expect(host.cancelIdleCallback).toHaveBeenCalledWith(2)
})

it.each([{ saveData: true }, { effectiveType: '2g' }, { effectiveType: 'slow-2g' }])('skips idle downloads on restricted connections: %j', connection => {
  const host = { requestIdleCallback: vi.fn(), cancelIdleCallback: vi.fn() }
  scheduleRoutePreloads({ host, connection })()
  expect(host.requestIdleCallback).not.toHaveBeenCalled()
})

it('continues after an idle import failure and cancels the timer fallback', async () => {
  const callbacks = []
  const host = { setTimeout: vi.fn(cb => { callbacks.push(cb); return callbacks.length }), clearTimeout: vi.fn() }
  const second = vi.fn().mockResolvedValue({})
  const cancel = scheduleRoutePreloads({ host, connection: {}, loaders: [() => Promise.reject(new Error('offline')), second] })
  await callbacks[0]()
  await callbacks[1]()
  expect(second).toHaveBeenCalledOnce()
  cancel()
  expect(host.clearTimeout).toHaveBeenCalledWith(2)
})
