import type { ReactNode } from 'react'

export interface CacheProviderProps {
  children: ReactNode
  endpoint?: string
}

export interface UseCacheOptions {
  tags?: string[]
  keys?: string[]
  patterns?: string[]
  debounce?: number
}
