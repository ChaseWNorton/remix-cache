import { EventEmitter } from 'node:events'
import type { Redis } from 'ioredis'
import type {
  Cache,
  CacheConfig,
  CacheDefinitionConfig,
  CacheDefinition,
} from '../types/cache.js'
import type {
  CacheEventHandler,
  CacheHitEvent,
  CacheMissEvent,
  CacheSetEvent,
  CacheInvalidateEvent,
  CacheErrorEvent,
  CircuitBreakerEvent,
} from '../types/events.js'
import { createRedisClients } from './redis-client.js'
import { createSerializer, type Serializer } from './serializer.js'
import { PubSubHandler } from './pubsub.js'
import { LocalCache } from './local-cache.js'
import { VersionedCache } from './versioned-cache.js'
import { TagManager } from './tag-manager.js'
import { PatternMatcher } from './pattern-matcher.js'
import { CircuitBreaker } from './circuit-breaker.js'
import { Deduplicator } from './deduplicator.js'
import { detectMode } from '../utils/env-detect.js'
import { CacheDefinitionImpl } from './definition.js'

export class CacheImpl extends EventEmitter implements Cache {
  private redis: Redis
  private subscriber: Redis
  private publisher: Redis
  private serializer: Serializer
  private pubsub?: PubSubHandler
  private localCache?: LocalCache
  private versionedCache?: VersionedCache
  private tagManager: TagManager
  private patternMatcher: PatternMatcher
  private circuitBreaker: CircuitBreaker
  private deduplicator: Deduplicator
  private prefix: string
  private mode: 'server' | 'serverless'
  private debug: boolean

  constructor(config: CacheConfig) {
    super()

    // Determine mode
    if (config.mode === 'auto' || !config.mode) {
      this.mode = detectMode()
    } else {
      this.mode = config.mode
    }

    // Set prefix
    this.prefix = config.prefix || 'remix-cache'

    // Debug mode
    this.debug = config.debug || false

    // Create Redis clients
    const { client, subscriber, publisher } = createRedisClients(config.redis)
    this.redis = client
    this.subscriber = subscriber
    this.publisher = publisher

    // Create serializer
    this.serializer = createSerializer(config.serializer || 'superjson')

    // Create tag and pattern managers
    this.tagManager = new TagManager(this.redis, this.prefix)
    this.patternMatcher = new PatternMatcher(this.redis, this.prefix)

    // Create circuit breaker
    const cbConfig = config.onError?.circuitBreaker
    this.circuitBreaker = new CircuitBreaker(
      cbConfig?.threshold,
      cbConfig?.timeout,
      cbConfig?.halfOpenRequests
    )

    // Set error handler for circuit breaker
    this.circuitBreaker.setErrorHandler((error) => {
      this.emit('error', {
        error,
        timestamp: Date.now(),
      })
    })

    // Create deduplicator
    this.deduplicator = new Deduplicator()

    // Mode-specific setup
    if (this.mode === 'server') {
      // Server mode: pub/sub + local cache
      if (config.pubsub?.enabled !== false) {
        this.pubsub = new PubSubHandler(this.subscriber, this.publisher)
        this.setupPubSub()
      }

      if (config.local?.enabled !== false) {
        this.localCache = new LocalCache(config.local || {})
      }
    } else {
      // Serverless mode: versioned cache
      this.versionedCache = new VersionedCache(
        this.redis,
        this.serializer,
        this.prefix
      )
    }

    // Setup event hooks
    if (config.hooks) {
      if (config.hooks.onHit) this.on('hit', config.hooks.onHit)
      if (config.hooks.onMiss) this.on('miss', config.hooks.onMiss)
      if (config.hooks.onSet) this.on('set', config.hooks.onSet)
      if (config.hooks.onInvalidate)
        this.on('invalidate', config.hooks.onInvalidate)
      if (config.hooks.onError) this.on('error', config.hooks.onError)
    }

    this.log('Cache initialized', { mode: this.mode, prefix: this.prefix })
  }

  private setupPubSub(): void {
    if (!this.pubsub) return

    this.pubsub.subscribe((channel, event) => {
      this.log('Received invalidation event', { channel, event })

      // Clear local cache if we have one
      if (this.localCache) {
        if (event.key) {
          this.localCache.delete(event.key)
        } else if (event.tag && event.keys) {
          this.localCache.deleteByTag(event.tag, event.keys)
        } else if (event.pattern && event.keys) {
          for (const key of event.keys) {
            this.localCache.delete(key)
          }
        }
      }

      // Emit event for observability
      this.emit('invalidate', event)
    })
  }

  define<TArgs extends any[], TData>(
    config: CacheDefinitionConfig<TArgs, TData>
  ): CacheDefinition<TArgs, TData> {
    return new CacheDefinitionImpl(
      config,
      this.redis,
      this.serializer,
      this.prefix,
      this.mode,
      this.deduplicator,
      this.circuitBreaker,
      this.localCache,
      this.versionedCache,
      this.tagManager,
      this.patternMatcher,
      this.pubsub,
      this
    )
  }

  async invalidateTag(tag: string): Promise<void> {
    this.log('Invalidating tag', { tag })

    // Get all keys with this tag
    const keys = await this.tagManager.getKeysByTag(tag)

    if (keys.length === 0) {
      this.log('No keys found for tag', { tag })
      return
    }

    // Delete all keys (versioned in serverless, direct in server mode)
    if (this.mode === 'serverless' && this.versionedCache) {
      await this.versionedCache.invalidateMany(keys)
    } else {
      await this.redis.del(...keys)
    }

    // Delete from local cache
    if (this.localCache) {
      this.localCache.deleteByTag(tag, keys)
    }

    // Publish invalidation event
    if (this.pubsub) {
      await this.pubsub.publishTagInvalidation(tag, keys)
    }

    // Clean up tag index
    await this.tagManager.deleteTag(tag)

    // Emit event
    this.emit('invalidate', { tag, keys, timestamp: Date.now() })
  }

  async invalidatePattern(pattern: string): Promise<void> {
    this.log('Invalidating pattern', { pattern })

    // Get all keys matching pattern
    const keys = await this.patternMatcher.getKeysByPattern(pattern)

    if (keys.length === 0) {
      this.log('No keys found for pattern', { pattern })
      return
    }

    // Delete all keys (versioned in serverless, direct in server mode)
    if (this.mode === 'serverless' && this.versionedCache) {
      await this.versionedCache.invalidateMany(keys)
    } else {
      await this.redis.del(...keys)
    }

    // Delete from local cache
    if (this.localCache) {
      for (const key of keys) {
        this.localCache.delete(key)
      }
    }

    // Publish invalidation event
    if (this.pubsub) {
      await this.pubsub.publishPatternInvalidation(pattern, keys)
    }

    // Emit event
    this.emit('invalidate', { pattern, keys, timestamp: Date.now() })
  }

  async invalidateMany(keys: string[]): Promise<void> {
    this.log('Invalidating many keys', { count: keys.length })

    if (keys.length === 0) return

    // Delete from Redis
    await this.redis.del(...keys)

    // Delete from local cache
    if (this.localCache) {
      for (const key of keys) {
        this.localCache.delete(key)
      }
    }

    // Publish invalidation events
    if (this.pubsub) {
      for (const key of keys) {
        await this.pubsub.publishKeyInvalidation(key)
      }
    }

    // Emit event
    this.emit('invalidate', { keys, timestamp: Date.now() })
  }

  // EventEmitter overrides for type safety
  override on(event: 'hit', handler: CacheEventHandler<CacheHitEvent>): this
  override on(event: 'miss', handler: CacheEventHandler<CacheMissEvent>): this
  override on(event: 'set', handler: CacheEventHandler<CacheSetEvent>): this
  override on(
    event: 'invalidate',
    handler: CacheEventHandler<CacheInvalidateEvent>
  ): this
  override on(
    event: 'error',
    handler: CacheEventHandler<CacheErrorEvent>
  ): this
  override on(
    event: 'circuitOpen' | 'circuitClosed',
    handler: CacheEventHandler<CircuitBreakerEvent>
  ): this
  override on(event: string, handler: CacheEventHandler): this {
    return super.on(event, handler)
  }

  override off(event: string, handler: CacheEventHandler): this {
    return super.off(event, handler)
  }

  override emit(event: string, data: any): boolean {
    return super.emit(event, data)
  }

  private log(message: string, data?: any): void {
    if (this.debug) {
      console.log(`[remix-cache] ${message}`, data || '')
    }
  }

  async close(): Promise<void> {
    this.log('Closing cache connections')

    if (this.pubsub) {
      await this.pubsub.unsubscribe()
    }

    await this.redis.quit()
    await this.subscriber.quit()
    await this.publisher.quit()
  }
}

export function createCache(config: CacheConfig): Cache {
  return new CacheImpl(config)
}
