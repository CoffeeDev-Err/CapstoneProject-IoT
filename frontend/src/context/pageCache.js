import { createContext } from 'react'

export const PageCacheContext = createContext(null)

// Memory only: never persist operational/account data in browser storage.
export function createPageCache() {
  const entries = new Map()
  const listeners = new Set()
  return {
    read: (key) => entries.get(key),
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    write(key, value) {
      entries.delete(key)
      entries.set(key, { value })
      // Bound report-search variants during long sessions.
      if (entries.size > 50) entries.delete(entries.keys().next().value)
      listeners.forEach((listener) => listener())
    },
  }
}
