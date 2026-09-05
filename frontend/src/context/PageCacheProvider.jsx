import { useState } from 'react'
import { createPageCache, PageCacheContext } from './pageCache'

export function PageCacheProvider({ children }) {
  const [cache] = useState(createPageCache)
  return <PageCacheContext.Provider value={cache}>{children}</PageCacheContext.Provider>
}
