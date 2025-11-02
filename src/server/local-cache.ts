import { LRUCache } from 'lru-cache'

export interface LocalCacheConfig {
  maxSize?: number
  ttl?: number
}

/**
 * In-memory LRU cache for fast local lookups in long-running servers.
 * Not used in serverless mode.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CacheValue = any

export class LocalCache {
  private cache: LRUCache<string, CacheValue>

  constructor(config: LocalCacheConfig = {}) {
    this.cache = new LRUCache<string, CacheValue>({
      max: config.maxSize || 1000,
      ttl: config.ttl ? config.ttl * 1000 : undefined, // Convert to ms
      updateAgeOnGet: false,
      updateAgeOnHas: false,
    })
  }

  get(key: string): CacheValue | undefined {
    return this.cache.get(key)
  }

  set(key: string, value: CacheValue, ttl?: number): void {
    this.cache.set(key, value, { ttl: ttl ? ttl * 1000 : undefined })
  }

  delete(key: string): boolean {
    return this.cache.delete(key)
  }

  deleteByPattern(pattern: string): number {
    const regex = this.patternToRegex(pattern)
    let count = 0

    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key)
        count++
      }
    }

    return count
  }

  deleteByTag(_tag: string, keys: string[]): number {
    let count = 0
    for (const key of keys) {
      if (this.cache.delete(key)) {
        count++
      }
    }
    return count
  }

  clear(): void {
    this.cache.clear()
  }

  get size(): number {
    return this.cache.size
  }

  private patternToRegex(pattern: string): RegExp {
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    const regex = escaped.replace(/\*/g, '.*')
    return new RegExp(`^${regex}$`)
  }
}
