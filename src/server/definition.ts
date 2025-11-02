import type Redis from 'ioredis'
import type { CacheDefinitionConfig, CacheDefinition } from '../types/cache.js'
import type { Serializer } from './serializer.js'
import type { Deduplicator } from './deduplicator.js'
import type { CircuitBreaker } from './circuit-breaker.js'
import type { LocalCache } from './local-cache.js'
import type { VersionedCache } from './versioned-cache.js'
import type { TagManager } from './tag-manager.js'
import type { PatternMatcher } from './pattern-matcher.js'
import type { PubSubHandler } from './pubsub.js'
import type { EventEmitter } from 'node:events'
import { buildCacheKey } from '../utils/key-builder.js'

interface CachedValueWithMeta<T> {
  data: T
  expiresAt?: number
  staleUntil?: number
}

export class CacheDefinitionImpl<TArgs extends any[], TData>
  implements CacheDefinition<TArgs, TData>
{
  constructor(
    private config: CacheDefinitionConfig<TArgs, TData>,
    private redis: Redis,
    private serializer: Serializer,
    private prefix: string,
    private mode: 'server' | 'serverless',
    private deduplicator: Deduplicator,
    private circuitBreaker: CircuitBreaker,
    private localCache: LocalCache | undefined,
    private versionedCache: VersionedCache | undefined,
    private tagManager: TagManager,
    private patternMatcher: PatternMatcher,
    private pubsub: PubSubHandler | undefined,
    private emitter: EventEmitter
  ) {}

  private buildKey(...args: TArgs): string {
    const keyPart = this.config.key(...args)
    return buildCacheKey(this.prefix, this.config.name, keyPart)
  }

  private getTTL(data?: TData): number | undefined {
    if (this.config.ttl === false) return undefined
    if (!this.config.ttl) return undefined
    if (typeof this.config.ttl === 'number') return this.config.ttl
    if (typeof this.config.ttl === 'function' && data) {
      return this.config.ttl(data)
    }
    if (typeof this.config.ttl === 'object') {
      return this.config.ttl.duration
    }
    return undefined
  }

  private isSliding(): boolean {
    if (typeof this.config.ttl === 'object' && this.config.ttl.sliding) {
      return true
    }
    return false
  }

  private async resetTTL(key: string, data?: TData): Promise<void> {
    const ttl = this.getTTL(data)
    if (ttl && this.isSliding()) {
      await this.redis.expire(key, ttl)
    }
  }

  private unwrapValue(
    value: TData | CachedValueWithMeta<TData>
  ): {
    data: TData
    isStale: boolean
    isPastStale: boolean
  } {
    // Check if value has metadata structure
    if (
      value &&
      typeof value === 'object' &&
      'data' in value &&
      'expiresAt' in value
    ) {
      const wrapped = value as CachedValueWithMeta<TData>
      const now = Date.now()
      const isStale = wrapped.expiresAt ? now > wrapped.expiresAt : false
      const isPastStale = wrapped.staleUntil ? now > wrapped.staleUntil : false
      return {
        data: wrapped.data,
        isStale,
        isPastStale,
      }
    }

    // Not wrapped, treat as fresh
    return {
      data: value as TData,
      isStale: false,
      isPastStale: false,
    }
  }

  async get(...args: TArgs): Promise<TData | null> {
    const key = this.buildKey(...args)
    const startTime = Date.now()

    if (this.mode === 'serverless' && this.versionedCache) {
      const data = await this.versionedCache.get<TData>(key)
      if (data) {
        this.emitter.emit('hit', {
          key,
          latency: Date.now() - startTime,
          source: 'redis',
          timestamp: Date.now(),
        })
        return data
      }

      this.emitter.emit('miss', {
        key,
        latency: Date.now() - startTime,
        timestamp: Date.now(),
      })

      if (this.config.fetch) {
        const fetched = await this.config.fetch(...args)
        if (fetched !== null && fetched !== undefined) {
          const ttl = this.getTTL(fetched)
          await this.versionedCache.set(key, fetched, ttl)

          // Track patterns and tags even in serverless mode
          await this.patternMatcher.trackKey(key)
          if (this.config.tags) {
            const tags = this.config.tags(...args)
            await this.tagManager.addTags(key, tags)
          }

          this.emitter.emit('set', {
            key,
            ttl,
            size: this.serializer.serialize(fetched).length,
            timestamp: Date.now(),
          })
        }
        return fetched
      }

      return null
    }

    if (this.localCache) {
      const cached = this.localCache.get(key)
      if (cached !== undefined) {
        const { data: unwrappedData, isStale, isPastStale } = this.unwrapValue(
          cached as TData | CachedValueWithMeta<TData>
        )

        // If past stale period, treat as miss and remove from local cache
        if (isPastStale) {
          this.localCache.delete(key)
          // Fall through to Redis/fetch logic
        } else if (isStale && this.config.fetch) {
          // Return stale data immediately and revalidate in background
          Promise.resolve().then(async () => {
            try {
              await this.fetchAndCache(...args)
            } catch (e) {
              // Ignore background revalidation errors
            }
          })

          this.emitter.emit('hit', {
            key,
            latency: Date.now() - startTime,
            source: 'local',
            timestamp: Date.now(),
          })

          return unwrappedData
        } else {
          // Fresh data from local cache
          // Reset TTL in Redis if sliding window is enabled
          if (this.isSliding()) {
            await this.resetTTL(key, unwrappedData)
          }

          this.emitter.emit('hit', {
            key,
            latency: Date.now() - startTime,
            source: 'local',
            timestamp: Date.now(),
          })
          return unwrappedData
        }
      }
    }

    const fallback = async (): Promise<TData | null> => {
      if (this.config.fetch) {
        return this.fetchAndCache(...args)
      }
      return null
    }

    return this.circuitBreaker.execute(async () => {
      let data: TData | null = null

      const cached = await this.redis.get(key)
      if (cached) {
        const deserial = this.serializer.deserialize<
          TData | CachedValueWithMeta<TData>
        >(cached)
        const { data: unwrappedData, isStale, isPastStale } =
          this.unwrapValue(deserial)

        // If past stale period, treat as miss
        if (isPastStale) {
          this.emitter.emit('miss', {
            key,
            latency: Date.now() - startTime,
            timestamp: Date.now(),
          })

          if (this.config.fetch) {
            if (this.config.dedupe !== false) {
              data = await this.deduplicator.run(key, () =>
                this.fetchAndCache(...args)
              )
            } else {
              data = await this.fetchAndCache(...args)
            }
          }
          return data
        }

        // If stale but within stale period, return stale and revalidate in background
        if (isStale && this.config.fetch) {
          // Return stale data immediately
          data = unwrappedData

          // Trigger background revalidation (don't await)
          Promise.resolve().then(async () => {
            try {
              await this.fetchAndCache(...args)
            } catch (e) {
              // Ignore background revalidation errors
            }
          })

          this.emitter.emit('hit', {
            key,
            latency: Date.now() - startTime,
            source: 'redis',
            timestamp: Date.now(),
          })

          return data
        }

        // Fresh data
        data = unwrappedData

        if (this.localCache && data) {
          const ttl = this.getTTL(data)
          this.localCache.set(key, deserial, ttl)
        }

        // Reset TTL if sliding window is enabled
        await this.resetTTL(key, data)

        this.emitter.emit('hit', {
          key,
          latency: Date.now() - startTime,
          source: 'redis',
          timestamp: Date.now(),
        })

        return data
      }

      this.emitter.emit('miss', {
        key,
        latency: Date.now() - startTime,
        timestamp: Date.now(),
      })

      if (this.config.fetch) {
        if (this.config.dedupe !== false) {
          data = await this.deduplicator.run(key, () =>
            this.fetchAndCache(...args)
          )
        } else {
          data = await this.fetchAndCache(...args)
        }
      }

      return data
    }, fallback)
  }

  private async fetchAndCache(...args: TArgs): Promise<TData | null> {
    if (!this.config.fetch) return null

    const data = await this.config.fetch(...args)

    if (data !== null && data !== undefined) {
      await this.set(...([...args, data] as [...TArgs, TData]))
    }

    return data
  }

  async set(...args: [...TArgs, TData]): Promise<void> {
    const data = args[args.length - 1] as TData
    const keyArgs = args.slice(0, -1) as TArgs
    const key = this.buildKey(...keyArgs)
    const ttl = this.getTTL(data)

    // Wrap with metadata if staleWhileRevalidate is configured
    let valueToStore: TData | CachedValueWithMeta<TData> = data
    let storeTTL = ttl

    if (this.config.staleWhileRevalidate && ttl) {
      const now = Date.now()
      valueToStore = {
        data,
        expiresAt: now + ttl * 1000,
        staleUntil: now + (ttl + this.config.staleWhileRevalidate) * 1000,
      }
      // Store for TTL + staleWhileRevalidate duration
      storeTTL = ttl + this.config.staleWhileRevalidate
    }

    const serialized = this.serializer.serialize(valueToStore)

    // Store in cache (versioned for serverless, regular for server mode)
    if (this.mode === 'serverless' && this.versionedCache) {
      await this.versionedCache.set(key, valueToStore, storeTTL)
    } else {
      // Store in Redis
      if (storeTTL) {
        await this.redis.setex(key, storeTTL, serialized)
      } else {
        await this.redis.set(key, serialized)
      }

      // Store in local cache
      if (this.localCache) {
        this.localCache.set(key, valueToStore, storeTTL)
      }
    }

    // Track for pattern matching
    await this.patternMatcher.trackKey(key)

    // Add tags if configured
    if (this.config.tags) {
      const tags = this.config.tags(...keyArgs)
      await this.tagManager.addTags(key, tags)
    }

    this.emitter.emit('set', {
      key,
      ttl,
      size: serialized.length,
      timestamp: Date.now(),
    })
  }

  async invalidate(...args: TArgs): Promise<void> {
    const key = this.buildKey(...args)

    if (this.mode === 'serverless' && this.versionedCache) {
      await this.versionedCache.invalidate(key)

      this.emitter.emit('invalidate', {
        key,
        timestamp: Date.now(),
      })
      return
    }

    await this.redis.del(key)

    if (this.localCache) {
      this.localCache.delete(key)
    }

    if (this.pubsub) {
      await this.pubsub.publishKeyInvalidation(key)
    }

    await this.patternMatcher.removeKey(key)

    if (this.config.tags) {
      const tags = this.config.tags(...args)
      await this.tagManager.removeTags(key, tags)
    }

    if (this.config.invalidates) {
      const keysToInvalidate = this.config.invalidates(...args)
      for (const k of keysToInvalidate) {
        await this.redis.del(k)
        if (this.localCache) {
          this.localCache.delete(k)
        }
      }
    }

    this.emitter.emit('invalidate', {
      key,
      timestamp: Date.now(),
    })
  }

  async getMany(keys: TArgs[]): Promise<Array<TData | null>> {
    if (keys.length === 0) return []

    const fullKeys = keys.map((k) => this.buildKey(...k))

    // Get all from Redis
    const values = await this.redis.mget(...fullKeys)

    return values.map((v) => (v ? this.serializer.deserialize<TData>(v) : null))
  }

  async setMany(entries: Array<{ args: TArgs; value: TData }>): Promise<void> {
    if (entries.length === 0) return

    // Build pipeline for batch operations
    const pipeline = this.redis.pipeline()

    for (const entry of entries) {
      const key = this.buildKey(...entry.args)
      const ttl = this.getTTL(entry.value)
      const serialized = this.serializer.serialize(entry.value)

      if (ttl) {
        pipeline.setex(key, ttl, serialized)
      } else {
        pipeline.set(key, serialized)
      }

      // Track for pattern matching - use patternMatcher's logic
      await this.patternMatcher.trackKey(key)

      // Add tags
      if (this.config.tags) {
        const tags = this.config.tags(...entry.args)
        await this.tagManager.addTags(key, tags)
      }
    }

    await pipeline.exec()

    // Store in local cache and emit events
    if (this.localCache) {
      for (const entry of entries) {
        const key = this.buildKey(...entry.args)
        const ttl = this.getTTL(entry.value)
        this.localCache.set(key, entry.value, ttl)
      }
    }

    // Emit set events for each entry
    for (const entry of entries) {
      const key = this.buildKey(...entry.args)
      const ttl = this.getTTL(entry.value)
      const serialized = this.serializer.serialize(entry.value)

      this.emitter.emit('set', {
        key,
        ttl,
        size: serialized.length,
        timestamp: Date.now(),
      })
    }
  }

  async invalidateMany(keys: TArgs[]): Promise<void> {
    if (keys.length === 0) return

    const fullKeys = keys.map((k) => this.buildKey(...k))

    // Delete from Redis
    await this.redis.del(...fullKeys)

    // Delete from local cache
    if (this.localCache) {
      for (const key of fullKeys) {
        this.localCache.delete(key)
      }
    }

    // Publish invalidation events
    if (this.pubsub) {
      for (const key of fullKeys) {
        await this.pubsub.publishKeyInvalidation(key)
      }
    }
  }

  async warm(
    entries: Array<{ args: TArgs; value?: TData } | TArgs>
  ): Promise<void> {
    const toSet: Array<{ args: TArgs; value: TData }> = []

    for (const entry of entries) {
      if (Array.isArray(entry)) {
        // It's just args, fetch the value
        if (this.config.fetch) {
          const value = await this.config.fetch(...entry)
          if (value !== null && value !== undefined) {
            toSet.push({ args: entry, value })
          }
        }
      } else if (entry.value !== undefined) {
        // Has both args and value
        toSet.push({ args: entry.args, value: entry.value })
      } else {
        // Has args but no value, fetch it
        if (this.config.fetch) {
          const value = await this.config.fetch(...entry.args)
          if (value !== null && value !== undefined) {
            toSet.push({ args: entry.args, value })
          }
        }
      }
    }

    // Use setMany for bulk insert
    await this.setMany(toSet)
  }
}
