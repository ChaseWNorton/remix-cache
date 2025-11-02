import { useState, useEffect, type ReactNode } from 'react'
import { useEventSource } from 'remix-utils/sse/react'
import { CacheContext, type InvalidationEvent } from './context.js'

export interface CacheProviderProps {
  children: ReactNode
  endpoint?: string
}

export function CacheProvider({
  children,
  endpoint = '/api/cache-events',
}: CacheProviderProps) {
  const [invalidations, setInvalidations] = useState<InvalidationEvent[]>([])
  const event = useEventSource(endpoint, { event: 'invalidate' })

  useEffect(() => {
    if (event) {
      try {
        const data = JSON.parse(event)
        setInvalidations((prev) => [...prev, data])
      } catch (e) {
        // Ignore malformed JSON
      }
    }
  }, [event])

  return (
    <CacheContext.Provider value={{ invalidations }}>
      {children}
    </CacheContext.Provider>
  )
}
