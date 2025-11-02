import { createContext, useContext } from 'react'

export interface InvalidationEvent {
  key?: string
  tag?: string
  pattern?: string
  keys?: string[]
  timestamp: number
}

export interface CacheContextValue {
  invalidations: InvalidationEvent[]
}

export const CacheContext = createContext<CacheContextValue | null>(null)

export function useCacheContext(): CacheContextValue {
  const context = useContext(CacheContext)
  if (!context) {
    throw new Error('useCacheContext must be used within CacheProvider')
  }
  return context
}
