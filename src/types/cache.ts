import type { TTLValue } from './config.js'
import type { CacheEventEmitter } from './events.js'

export type { CacheConfig } from './config.js'

export interface Cache extends CacheEventEmitter {
  define: <TArgs extends any[], TData>(
    config: CacheDefinitionConfig<TArgs, TData>
  ) => CacheDefinition<TArgs, TData>

  invalidateTag: (tag: string) => Promise<void>
  invalidatePattern: (pattern: string) => Promise<void>
  invalidateMany: (keys: string[]) => Promise<void>
}

export interface CacheDefinitionConfig<TArgs extends any[], TData> {
  name: string
  key: (...args: TArgs) => string
  fetch?: (...args: TArgs) => Promise<TData>
  tags?: (...args: TArgs) => string[]
  ttl?: TTLValue<TData>
  staleWhileRevalidate?: number
  dedupe?: boolean
  invalidates?: (...args: TArgs) => string[]
}

export interface CacheDefinition<TArgs extends any[], TData> {
  get: (...args: TArgs) => Promise<TData | null>
  set: (...args: [...TArgs, TData]) => Promise<void>
  invalidate: (...args: TArgs) => Promise<void>
  getMany: (keys: TArgs[]) => Promise<Array<TData | null>>
  setMany: (entries: Array<{ args: TArgs; value: TData }>) => Promise<void>
  invalidateMany: (keys: TArgs[]) => Promise<void>
  warm: (entries: Array<{ args: TArgs; value?: TData } | TArgs>) => Promise<void>
}
