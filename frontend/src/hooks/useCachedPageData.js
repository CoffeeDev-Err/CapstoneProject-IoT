import { useCallback, useContext, useRef, useSyncExternalStore } from 'react'
import { PageCacheContext } from '../context/pageCache'

// Call the setter only with successful data (including an empty result).
// Loading/errors remain local; revisiting always revalidates in the background.
export function useCachedPageData(key, fallback) {
  const cache = useContext(PageCacheContext)
  const initialFallback = useRef(fallback)
  if (!cache) throw new Error('Page data must be inside PageCacheProvider')
  const read = useCallback(() => cache.read(key), [cache, key])
  const entry = useSyncExternalStore(cache.subscribe, read)
  const setData = useCallback((value) => {
    const previous = cache.read(key)
    cache.write(key, typeof value === 'function'
      ? value(previous ? previous.value : initialFallback.current)
      : value)
  }, [cache, key])
  return [entry ? entry.value : fallback, setData, Boolean(entry)]
}
