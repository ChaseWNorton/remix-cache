/**
 * Event types for cache observability
 */

export interface CacheHitEvent {
  key: string
  latency: number
  source: 'local' | 'redis'
  timestamp: number
}

export interface CacheMissEvent {
  key: string
  latency: number
  timestamp: number
}

export interface CacheSetEvent {
  key: string
  ttl?: number
  size?: number
  timestamp: number
}

export interface CacheInvalidateEvent {
  key?: string
  tag?: string
  pattern?: string
  keys?: string[]
  timestamp: number
}

export interface CacheErrorEvent {
  error: Error
  operation: string
  key?: string
  timestamp: number
}

export interface CircuitBreakerEvent {
  state: 'open' | 'closed' | 'half-open'
  timestamp: number
}

export type CacheEvent =
  | { type: 'hit'; data: CacheHitEvent }
  | { type: 'miss'; data: CacheMissEvent }
  | { type: 'set'; data: CacheSetEvent }
  | { type: 'invalidate'; data: CacheInvalidateEvent }
  | { type: 'error'; data: CacheErrorEvent }
  | { type: 'circuitOpen'; data: CircuitBreakerEvent }
  | { type: 'circuitClosed'; data: CircuitBreakerEvent }

export type CacheEventHandler<T = any> = (event: T) => void

export interface CacheEventEmitter {
  on(event: 'hit', handler: CacheEventHandler<CacheHitEvent>): void
  on(event: 'miss', handler: CacheEventHandler<CacheMissEvent>): void
  on(event: 'set', handler: CacheEventHandler<CacheSetEvent>): void
  on(
    event: 'invalidate',
    handler: CacheEventHandler<CacheInvalidateEvent>
  ): void
  on(event: 'error', handler: CacheEventHandler<CacheErrorEvent>): void
  on(
    event: 'circuitOpen' | 'circuitClosed',
    handler: CacheEventHandler<CircuitBreakerEvent>
  ): void

  off(event: string, handler: CacheEventHandler): void
  emit(event: string, data: any): void
}
