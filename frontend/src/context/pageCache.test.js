import { describe, expect, it } from 'vitest'
import { createPageCache } from './pageCache'

describe('session page cache', () => {
  it('bounds memory and keeps snapshots stable until data changes', () => {
    const cache = createPageCache()
    cache.write('first', [])
    expect(cache.read('first')).toBe(cache.read('first'))
    for (let index = 0; index < 50; index++) cache.write(`query-${index}`, [index])
    expect(cache.read('first')).toBeUndefined()
    expect(cache.read('query-49').value).toEqual([49])
    expect(createPageCache().read('query-49')).toBeUndefined()
  })
})
