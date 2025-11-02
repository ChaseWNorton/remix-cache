import type { Redis, RedisOptions } from 'ioredis'
import type { Serializer } from '../server/serializer.js'

export type RedisConfig = string | Redis | RedisOptions

export interface LocalCacheConfig {
  enabled?: boolean
  maxSize?: number
  ttl?: number
}

export interface PubSubConfig {
  enabled?: boolean
  transport?: 'redis-pubsub' | 'redis-streams'
  channels?: {
    invalidateKey?: string
    invalidateTag?: string
    invalidatePattern?: string
  }
}

export interface RevalidationConfig {
  enabled?: boolean
  transport?: 'sse' | 'polling'
  endpoint?: string
  pollInterval?: number
}

export interface CircuitBreakerConfig {
  threshold?: number
  timeout?: number
  halfOpenRequests?: number
}

export interface ErrorHandlingConfig {
  strategy?: 'fallback' | 'throw' | 'stale'
  circuitBreaker?: CircuitBreakerConfig
}

export interface CacheHooks {
  onHit?: (event: any) => void
  onMiss?: (event: any) => void
  onSet?: (event: any) => void
  onInvalidate?: (event: any) => void
  onError?: (event: any) => void
}

export interface CacheConfig {
  redis: RedisConfig
  mode?: 'auto' | 'server' | 'serverless'
  prefix?: string
  serializer?: 'json' | 'superjson' | Serializer
  onError?: ErrorHandlingConfig
  local?: LocalCacheConfig
  pubsub?: PubSubConfig
  revalidation?: RevalidationConfig
  debug?: boolean
  hooks?: CacheHooks
}

export interface TTLConfig {
  duration: number
  sliding?: boolean
}

export type TTLValue<T> =
  | number
  | false
  | ((data: T) => number)
  | TTLConfig
