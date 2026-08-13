import { useEffect, useState } from 'react'

const readTheme = () => document.documentElement.dataset.theme === 'dark'

export function useDocumentTheme() {
  const [isDark, setIsDark] = useState(readTheme)

  useEffect(() => {
    const observer = new MutationObserver(() => setIsDark(readTheme()))
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    })
    return () => observer.disconnect()
  }, [])

  return isDark
}
