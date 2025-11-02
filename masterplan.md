# remix-cache Master Plan

## Executive Summary

**remix-cache** is a comprehensive, type-safe caching library built specifically for Remix applications. It provides distributed caching with Redis, intelligent invalidation strategies, multi-instance synchronization, and seamless client-server integration for optimal developer experience.

### Core Philosophy
- **Developer Experience First**: Minimal boilerplate, maximum type safety
- **Remix-Native**: Deep integration with Remix's loader/action patterns
- **Production-Ready**: Built for distributed systems, serverless, and long-running servers
- **Progressive Enhancement**: Start simple, add complexity as needed

---

## Problem Statement

Remix's loader-first architecture creates a challenge: complex pages with multiple data sources result in numerous API calls in loaders. Without a robust caching layer:

1. **Performance suffers** - Every route load triggers multiple database/API calls
2. **No standard solution** - Developers roll their own ad-hoc caching
3. **Cross-service invalidation is hard** - Microservices struggle to coordinate cache invalidation
4. **Client revalidation is manual** - No automatic UI updates when data changes elsewhere

remix-cache solves all of these problems with a unified, type-safe caching solution.

---

## Architecture Overview

### Two Operating Modes

#### **Mode 1: Long-Running Server**
- Node.js server that stays running (traditional deployment)
- Two-layer caching: local in-memory + Redis
- Redis Pub/Sub for multi-instance synchronization
- SSE (Server-Sent Events) for real-time client revalidation

#### **Mode 2: Serverless**
- Ephemeral functions (AWS Lambda, Vercel, Netlify)
- Redis-only caching (no local layer)
- Versioned cache keys for invalidation
- Polling-based client revalidation (or rely on Remix built-ins)

### Auto-Detection
The library automatically detects the environment and configures accordingly, but users can override.

---

## Core Concepts

### 1. Cache Definitions

Developers **define** their caches declaratively:

```typescript
export const userCache = cache.define({
  name: 'user',
  key: (userId: string) => userId,
  tags: (userId: string) => [`user:${userId}`],
  ttl: 3600,
  fetch: async (userId: string) => {
    return db.user.findUnique({ where: { id: userId } })
  },
})
```

**Key Properties:**
- `name`: Unique identifier for this cache (used for namespacing)
- `key`: Function that generates cache key from arguments
- `tags`: Function that generates tags for invalidation grouping
- `ttl`: Time-to-live in seconds (or configuration object)
- `fetch`: Function to fetch data on cache miss

### 2. Cache Keys

**Structure:** `{prefix}:{name}:{key}`

Example: `myapp:user:123`

**Multi-argument keys:**
```typescript
key: (userId: string, status: 'draft' | 'published') => `${userId}:${status}`
// Generates: "myapp:user-posts:123:published"
```

**Automatic namespacing** prevents collisions between different cache definitions.

### 3. Tags

Tags create **relationships** between cache entries for coordinated invalidation.

```typescript
export const userCache = cache.define({
  name: 'user',
  tags: (userId: string) => [`user:${userId}`],
  // ...
})

export const userPostsCache = cache.define({
  name: 'user-posts',
  tags: (userId: string) => [`user:${userId}`, 'posts'],
  // ...
})

// Invalidate all caches tagged with user:123
await cache.invalidateTag(`user:123`)
// Invalidates both userCache and userPostsCache for this user
```

**Tag Storage (Redis):**
```
SET user:123 {data}
SADD tag:user:123 "user:123"       # Index: tag -> keys
SADD tag:posts "user-posts:123"    # Index: tag -> keys
```

### 4. Pattern-Based Invalidation

Invalidate multiple keys matching a pattern:

```typescript
// Invalidate all user caches
await cache.invalidatePattern('user:*')

// Invalidate all draft posts for a user
await cache.invalidatePattern('user-posts:123:draft*')
```

**Implementation:** Index-based tracking

```
// When setting cache
SET user:123 {data}
SADD pattern:user "user:123"  # Track all keys matching pattern "user:*"

// When invalidating pattern
SMEMBERS pattern:user  # Get all matching keys
DEL user:123 user:456 ...  # Delete them all
DEL pattern:user  # Clean up index
```

---

## Feature Specifications

### 1. Serialization

**Default:** Superjson (handles Dates, Maps, Sets, BigInt, RegExp, undefined)

**Configuration:**
```typescript
export const cache = createCache({
  redis: process.env.REDIS_URL,
  serializer: 'superjson', // default
  // or custom:
  // serializer: { serialize: (data) => ..., deserialize: (str) => ... }
})
```

**Why Superjson:**
- JSON.stringify loses Date objects (becomes string)
- JSON.stringify loses undefined values
- JSON.stringify can't handle Maps, Sets, BigInt
- Superjson preserves all of these

### 2. Cache Stampede Protection

**Problem:** 100 concurrent requests for uncached data → 100 database calls

**Solution:** Request deduplication (first request fetches, others wait)

```typescript
export const userCache = cache.define({
  name: 'user',
  fetch: async (userId: string) => db.user.findUnique({ where: { id: userId } }),
  dedupe: true, // default: true
})
```

**Implementation:**
```typescript
class Deduplicator {
  private pending = new Map<string, Promise<any>>()

  async run<T>(key: string, fn: () => Promise<T>): Promise<T> {
    // If already fetching, return existing promise
    if (this.pending.has(key)) {
      return this.pending.get(key)!
    }

    // Start fetch
    const promise = fn().finally(() => {
      this.pending.delete(key)
    })

    this.pending.set(key, promise)
    return promise
  }
}
```

### 3. TTL Strategies

**Fixed TTL:**
```typescript
ttl: 3600 // 1 hour
```

**Conditional TTL:**
```typescript
ttl: (data) => data.isPremium ? 7200 : 3600
```

**No expiry (manual invalidation only):**
```typescript
ttl: false
```

**Sliding window (reset on access):**
```typescript
ttl: {
  duration: 3600,
  sliding: true
}
```

**Implementation:**
- Fixed/Conditional: Use Redis `SETEX` or `SET key value EX ttl`
- No expiry: Use Redis `SET` without expiration
- Sliding: On each `GET`, reset expiry with `EXPIRE key ttl`

### 4. Stale-While-Revalidate

Serve stale data immediately while fetching fresh data in background.

```typescript
export const userCache = cache.define({
  name: 'user',
  ttl: 3600,
  staleWhileRevalidate: 600, // Serve stale for 10min after expiry
})
```

**Implementation:**
```typescript
// Store data with two timestamps
{
  data: { id: '123', name: 'Bob' },
  expiresAt: 1699999999999,  // Fresh until this time
  staleUntil: 1700000599999  // Stale acceptable until this time
}

async get(key: string) {
  const cached = await redis.get(key)

  if (cached) {
    const { data, expiresAt, staleUntil } = cached
    const now = Date.now()

    // Fresh
    if (now < expiresAt) {
      return data
    }

    // Stale but acceptable
    if (now < staleUntil) {
      // Return stale immediately
      setImmediate(() => {
        // Refresh in background
        this.fetchAndCache(key)
      })
      return data
    }
  }

  // Expired or missing, fetch now
  return await this.fetchAndCache(key)
}
```

### 5. Error Handling & Circuit Breaker

**Strategy:** Fallback to fetch on Redis failure

```typescript
export const cache = createCache({
  redis: process.env.REDIS_URL,
  onError: {
    strategy: 'fallback', // default: 'fallback' | 'throw' | 'stale'
    circuitBreaker: {
      threshold: 5,      // Open circuit after 5 failures
      timeout: 30000,    // Try again after 30s
      halfOpenRequests: 3 // Test with 3 requests before fully closing
    }
  }
})
```

**Circuit Breaker States:**
1. **Closed** - Normal operation, Redis requests allowed
2. **Open** - Redis is failing, all requests fallback to fetch immediately
3. **Half-Open** - Testing if Redis recovered, allow limited requests

**Implementation:**
```typescript
class CircuitBreaker {
  private state: 'closed' | 'open' | 'half-open' = 'closed'
  private failures = 0
  private nextAttempt = 0
  private halfOpenSuccesses = 0

  async execute<T>(fn: () => Promise<T>, fallback: () => Promise<T>): Promise<T> {
    // Circuit is open, use fallback
    if (this.state === 'open') {
      if (Date.now() < this.nextAttempt) {
        return fallback()
      }
      // Time to test
      this.state = 'half-open'
      this.halfOpenSuccesses = 0
    }

    try {
      const result = await fn()
      this.onSuccess()
      return result
    } catch (error) {
      this.onFailure()
      return fallback()
    }
  }

  private onSuccess() {
    if (this.state === 'half-open') {
      this.halfOpenSuccesses++
      if (this.halfOpenSuccesses >= 3) {
        this.state = 'closed'
        this.failures = 0
      }
    } else {
      this.failures = 0
    }
  }

  private onFailure() {
    this.failures++
    if (this.failures >= 5) {
      this.state = 'open'
      this.nextAttempt = Date.now() + 30000
    }
  }
}
```

### 6. Bulk Operations

**getMany:**
```typescript
const users = await userCache.getMany(['1', '2', '3'])
// Uses Redis MGET for performance
```

**setMany:**
```typescript
await userCache.setMany([
  { key: '1', value: user1 },
  { key: '2', value: user2 },
])
// Uses Redis MSET
```

**invalidateMany:**
```typescript
await cache.invalidateMany(['user:1', 'user:2', 'post:123'])
// Uses Redis DEL with multiple keys
// Also publishes invalidation events
```

**Implementation:**
```typescript
async getMany(keys: string[]): Promise<Array<T | null>> {
  // 1. Build full cache keys
  const fullKeys = keys.map(k => this.buildKey(k))

  // 2. Get all from Redis in one call
  const values = await redis.mget(...fullKeys)

  // 3. Deserialize
  return values.map(v => v ? this.deserialize(v) : null)
}

async setMany(entries: Array<{ key: string, value: T }>): Promise<void> {
  // 1. Serialize all values
  const serialized = entries.flatMap(e => [
    this.buildKey(e.key),
    this.serialize(e.value)
  ])

  // 2. Set all in one call
  await redis.mset(...serialized)

  // 3. Set TTL for each (MSET doesn't support TTL)
  if (this.ttl) {
    await Promise.all(
      entries.map(e => redis.expire(this.buildKey(e.key), this.ttl))
    )
  }
}
```

### 7. Cache Warming

Pre-populate caches on deploy or startup:

```typescript
// Warm critical caches
await userCache.warm([
  { key: '1', value: await fetchUser('1') },
  { key: '2', value: await fetchUser('2') },
])

// Or let it fetch
await userCache.warm(['1', '2', '3'])
```

**Implementation:**
```typescript
async warm(entries: Array<{ key: string, value?: T } | string>): Promise<void> {
  const toSet: Array<{ key: string, value: T }> = []

  for (const entry of entries) {
    if (typeof entry === 'string') {
      // Fetch the value
      const value = await this.fetch(entry)
      toSet.push({ key: entry, value })
    } else if (entry.value !== undefined) {
      toSet.push({ key: entry.key, value: entry.value })
    } else {
      // Fetch if no value provided
      const value = await this.fetch(entry.key)
      toSet.push({ key: entry.key, value })
    }
  }

  // Use setMany for bulk insert
  await this.setMany(toSet)
}
```

### 8. Observability Hooks

Monitor cache behavior for debugging and metrics:

```typescript
cache.on('hit', ({ key, latency, value }) => {
  console.log(`✅ Cache HIT: ${key} (${latency}ms)`)
  metrics.increment('cache.hit')
})

cache.on('miss', ({ key, latency }) => {
  console.log(`❌ Cache MISS: ${key} (${latency}ms)`)
  metrics.increment('cache.miss')
})

cache.on('invalidate', ({ key, tags, pattern }) => {
  console.log(`🗑️  Invalidated: ${key || pattern || tags}`)
})

cache.on('error', ({ error, operation, key }) => {
  console.error(`💥 Cache error: ${operation} ${key}`, error)
  sentry.captureException(error)
})

cache.on('set', ({ key, ttl, size }) => {
  console.log(`💾 Cache SET: ${key} (${size} bytes, TTL: ${ttl}s)`)
})
```

**Event Types:**
- `hit` - Cache hit (data found)
- `miss` - Cache miss (data not found)
- `set` - Data stored in cache
- `invalidate` - Cache entry invalidated
- `error` - Cache operation error
- `circuitOpen` - Circuit breaker opened
- `circuitClosed` - Circuit breaker closed

### 9. Redis Connection Management

**Accept both URL string and Redis instance:**

```typescript
// Option 1: URL string (library creates connection)
export const cache = createCache({
  redis: process.env.REDIS_URL
})

// Option 2: Existing Redis instance
import { Redis } from 'ioredis'
const redis = new Redis(process.env.REDIS_URL)

export const cache = createCache({
  redis
})

// Option 3: Redis configuration object
export const cache = createCache({
  redis: {
    host: 'localhost',
    port: 6379,
    password: 'secret',
    db: 0
  }
})
```

**Internal handling:**
```typescript
function createRedisClient(config: RedisConfig): Redis {
  if (typeof config === 'string') {
    return new Redis(config)
  } else if (config instanceof Redis) {
    return config
  } else {
    return new Redis(config)
  }
}
```

### 10. Namespace/Prefix Support

Prevent key collisions in shared Redis instances:

```typescript
export const cache = createCache({
  redis: process.env.REDIS_URL,
  prefix: 'myapp', // All keys prefixed with "myapp:"
})

// Keys become: "myapp:user:123"
```

**Multi-tenant support:**
```typescript
export const cache = createCache({
  redis: process.env.REDIS_URL,
  prefix: (context) => `tenant:${context.tenantId}`,
})

// Keys become: "tenant:acme:user:123"
```

---

## Multi-Instance Synchronization

### Long-Running Server Mode: Redis Pub/Sub

**Architecture:**
```
┌─────────────┐         ┌─────────────┐         ┌─────────────┐
│  Instance A │         │    Redis    │         │  Instance B │
│             │         │   Pub/Sub   │         │             │
└─────────────┘         └─────────────┘         └─────────────┘
      │                       │                       │
      │  SUBSCRIBE            │      SUBSCRIBE        │
      │──────────────────────>│<──────────────────────│
      │                       │                       │
      │  invalidate()         │                       │
      │                       │                       │
      │  PUBLISH event        │                       │
      │──────────────────────>│                       │
      │                       │  Broadcast to all     │
      │  Receive event        │  subscribers          │
      │<──────────────────────│──────────────────────>│ Receive event
      │                       │                       │
      │  Clear local cache    │                       │    Clear local cache
```

**Implementation:**

```typescript
class PubSubHandler {
  private subscriber: Redis
  private publisher: Redis

  constructor(redisConfig: RedisConfig) {
    // Separate connections for pub/sub
    this.subscriber = createRedisClient(redisConfig)
    this.publisher = createRedisClient(redisConfig)
  }

  async subscribe(channel: string, handler: (message: any) => void) {
    await this.subscriber.subscribe(channel)
    this.subscriber.on('message', (ch, msg) => {
      if (ch === channel) {
        handler(JSON.parse(msg))
      }
    })
  }

  async publish(channel: string, message: any) {
    await this.publisher.publish(channel, JSON.stringify(message))
  }
}

// Channels
const CHANNELS = {
  INVALIDATE_KEY: 'cache:invalidate:key',
  INVALIDATE_TAG: 'cache:invalidate:tag',
  INVALIDATE_PATTERN: 'cache:invalidate:pattern',
}

// Subscribe on startup
pubsub.subscribe(CHANNELS.INVALIDATE_KEY, ({ key }) => {
  localCache.delete(key)
})

// Publish on invalidate
async function invalidate(key: string) {
  await redis.del(key)
  await pubsub.publish(CHANNELS.INVALIDATE_KEY, { key, timestamp: Date.now() })
  localCache.delete(key) // Also clear own local cache
}
```

**Two-Layer Cache:**

1. **Layer 1: Local In-Memory (per instance)**
   - Fast (~0.1ms)
   - Needs pub/sub to stay in sync
   - Uses LRU eviction

2. **Layer 2: Redis (shared)**
   - Slower (~2ms)
   - Source of truth
   - Persistent

**Get flow:**
```typescript
async get(key: string): Promise<T | null> {
  // 1. Check local cache
  let value = localCache.get(key)
  if (value) {
    this.emit('hit', { key, latency: 0.1, source: 'local' })
    return value
  }

  // 2. Check Redis
  value = await redis.get(key)
  if (value) {
    const deserialized = deserialize(value)
    localCache.set(key, deserialized)
    this.emit('hit', { key, latency: 2, source: 'redis' })
    return deserialized
  }

  // 3. Cache miss
  this.emit('miss', { key })
  return null
}
```

### Serverless Mode: Versioned Keys

**Problem:** No persistent process to subscribe to pub/sub

**Solution:** Use version numbers to invalidate caches

**Architecture:**
```
Redis stores:
  version:user:123 = 5
  user:123:v5 = {data}

When invalidating:
  INCR version:user:123  (now = 6)

Next request:
  GET version:user:123  (returns 6)
  GET user:123:v6  (miss, old cache at v5 is orphaned)
  Fetch fresh data
  SET user:123:v6 {data}
```

**Implementation:**
```typescript
class VersionedCache {
  async get(key: string): Promise<T | null> {
    // 1. Get current version
    const version = await redis.get(`version:${key}`) || '0'

    // 2. Try to get versioned cache
    const versionedKey = `${key}:v${version}`
    const cached = await redis.get(versionedKey)

    if (cached) {
      this.emit('hit', { key: versionedKey })
      return deserialize(cached)
    }

    this.emit('miss', { key: versionedKey })
    return null
  }

  async set(key: string, value: T, ttl?: number): Promise<void> {
    // 1. Get current version
    const version = await redis.get(`version:${key}`) || '0'

    // 2. Set versioned cache
    const versionedKey = `${key}:v${version}`
    await redis.set(versionedKey, serialize(value), 'EX', ttl)
  }

  async invalidate(key: string): Promise<void> {
    // Just increment version - old cache becomes orphaned
    await redis.incr(`version:${key}`)

    // Old caches will expire via TTL
    this.emit('invalidate', { key })
  }
}
```

**Orphan Cleanup:**
Old versioned caches are cleaned up by TTL. No manual cleanup needed.

---

## Client-Server Integration (Remix)

### Server-Side API

**Loader usage:**
```typescript
// app/routes/users.$userId.tsx
import { userCache, userPostsCache } from '~/cache.server'

export const loader = async ({ params }: LoaderFunctionArgs) => {
  const [user, posts] = await Promise.all([
    userCache.get(params.userId),
    userPostsCache.get(params.userId),
  ])

  return json({ user, posts })
}
```

**Action usage:**
```typescript
export const action = async ({ params, request }: ActionFunctionArgs) => {
  const formData = await request.formData()

  const user = await db.user.update({
    where: { id: params.userId },
    data: { name: formData.get('name') },
  })

  // Invalidate cache
  await userCache.invalidate(params.userId)

  // Or invalidate by tag (invalidates multiple related caches)
  await cache.invalidateTag(`user:${params.userId}`)

  return json({ user })
}
```

### Client-Side Revalidation

#### Long-Running Server Mode: SSE

**Auto-created SSE endpoint:**

```typescript
// app/routes/api.cache-events.tsx
// Auto-generated by remix-cache

import { eventStream } from 'remix-utils/sse/server'
import { cache } from '~/cache.server'

export async function loader({ request }: LoaderFunctionArgs) {
  return eventStream(request.signal, (send) => {
    const handler = (event: InvalidationEvent) => {
      send({
        event: 'invalidate',
        data: JSON.stringify({
          key: event.key,
          tags: event.tags,
          pattern: event.pattern,
          timestamp: event.timestamp,
        }),
      })
    }

    cache.on('invalidate', handler)

    return () => {
      cache.off('invalidate', handler)
    }
  })
}
```

**React Provider:**

```typescript
// app/root.tsx
import { CacheProvider } from 'remix-cache/react'

export default function Root() {
  return (
    <CacheProvider endpoint="/api/cache-events">
      <Outlet />
    </CacheProvider>
  )
}
```

**Hook usage:**

```typescript
// app/routes/users.$userId.tsx
import { useCache } from 'remix-cache/react'

export default function UserPage() {
  const { user } = useLoaderData<typeof loader>()
  const { userId } = useParams()

  // Auto-revalidates when user:123 cache is invalidated
  useCache({ tags: [`user:${userId}`] })

  return <div>{user.name}</div>
}
```

**Implementation:**

```typescript
// packages/remix-cache/src/react/provider.tsx
import { createContext, useEffect, useState } from 'react'
import { useEventSource } from 'remix-utils/sse/react'

const CacheContext = createContext<CacheContextValue>(null!)

export function CacheProvider({
  children,
  endpoint = '/api/cache-events'
}: CacheProviderProps) {
  const [invalidations, setInvalidations] = useState<InvalidationEvent[]>([])
  const event = useEventSource(endpoint, { event: 'invalidate' })

  useEffect(() => {
    if (event) {
      const data = JSON.parse(event)
      setInvalidations(prev => [...prev, data])
    }
  }, [event])

  return (
    <CacheContext.Provider value={{ invalidations }}>
      {children}
    </CacheContext.Provider>
  )
}
```

```typescript
// packages/remix-cache/src/react/useCache.ts
import { useContext, useEffect } from 'react'
import { useRevalidator } from '@remix-run/react'

export function useCache(options?: {
  tags?: string[]
  keys?: string[]
  patterns?: string[]
  debounce?: number
}) {
  const { invalidations } = useContext(CacheContext)
  const revalidator = useRevalidator()

  useEffect(() => {
    if (invalidations.length === 0) return

    const latestInvalidation = invalidations[invalidations.length - 1]

    // Check if we should revalidate
    const shouldRevalidate = matchesFilter(latestInvalidation, options)

    if (shouldRevalidate) {
      const timeout = setTimeout(() => {
        revalidator.revalidate()
      }, options?.debounce || 100)

      return () => clearTimeout(timeout)
    }
  }, [invalidations, revalidator, options])
}

function matchesFilter(
  event: InvalidationEvent,
  options?: { tags?: string[], keys?: string[], patterns?: string[] }
): boolean {
  if (!options) return true // No filter = revalidate on all invalidations

  // Check tags
  if (options.tags && event.tags) {
    if (options.tags.some(tag => event.tags?.includes(tag))) {
      return true
    }
  }

  // Check keys
  if (options.keys && event.key) {
    if (options.keys.includes(event.key)) {
      return true
    }
  }

  // Check patterns
  if (options.patterns && event.pattern) {
    if (options.patterns.some(p => matchPattern(p, event.pattern!))) {
      return true
    }
  }

  return false
}
```

#### Serverless Mode: No Auto-Revalidation

In serverless mode, rely on Remix's built-in revalidation:
- Actions automatically revalidate loaders
- Navigation revalidates
- Manual revalidation with `useRevalidator()`

**Why:** No persistent connection for SSE, and polling is wasteful.

**Alternative:** Users can implement polling if needed:

```typescript
// Optional: Manual polling in serverless
export function usePollingRevalidation(interval = 5000) {
  const revalidator = useRevalidator()

  useEffect(() => {
    const timer = setInterval(() => {
      revalidator.revalidate()
    }, interval)

    return () => clearInterval(timer)
  }, [revalidator, interval])
}
```

---

## TypeScript Type System

### Perfect Type Inference

The cache system should provide perfect TypeScript inference with zero manual type annotations needed.

**Goal:**
```typescript
export const userCache = cache.define({
  name: 'user',
  key: (userId: string) => userId,
  fetch: async (userId: string) => {
    return db.user.findUnique({ where: { id: userId } })
    //     ^? { id: string, name: string, email: string }
  },
})

// TypeScript knows this returns User | null
const user = await userCache.get('123')
//    ^? User | null
```

**Implementation:**

```typescript
// packages/remix-cache/src/server/definition.ts

export class CacheDefinition<
  TArgs extends any[],
  TData,
  TName extends string = string
> {
  constructor(
    private config: CacheDefinitionConfig<TArgs, TData, TName>
  ) {}

  // TypeScript infers TData from fetch function return type
  async get(...args: TArgs): Promise<TData | null> {
    // Implementation
  }

  async set(...args: [...TArgs, TData]): Promise<void> {
    // args: [userId, userData] for example
  }

  async invalidate(...args: TArgs): Promise<void> {
    // Implementation
  }
}

// Define method with perfect inference
export function define<
  TArgs extends any[],
  TData,
  TName extends string
>(
  config: {
    name: TName
    key: (...args: TArgs) => string
    fetch: (...args: TArgs) => Promise<TData>
    tags?: (...args: TArgs) => string[]
    ttl?: number | false | ((data: TData) => number)
    staleWhileRevalidate?: number
    dedupe?: boolean
  }
): CacheDefinition<TArgs, TData, TName> {
  return new CacheDefinition(config)
}
```

**Advanced: Branded Keys**

Prevent mixing up cache keys:

```typescript
export const userCache = cache.define({
  name: 'user' as const, // Literal type
  // ...
})

export const postCache = cache.define({
  name: 'post' as const,
  // ...
})

// TypeScript error: can't use post key with user cache
await cache.invalidateByName('post', userCache.buildKey('123'))
//                            ~~~~~~ Error: Expected 'user'
```

---

## Configuration Reference

### Complete Configuration Object

```typescript
export const cache = createCache({
  // Redis connection (required)
  redis: string | Redis | RedisOptions,

  // Operating mode (optional, auto-detected)
  mode: 'auto' | 'server' | 'serverless',

  // Key prefix for namespacing (optional)
  prefix: string | ((context?: any) => string),

  // Serialization (optional, default: superjson)
  serializer: 'json' | 'superjson' | CustomSerializer,

  // Error handling (optional)
  onError: {
    strategy: 'fallback' | 'throw' | 'stale',
    circuitBreaker: {
      threshold: number,
      timeout: number,
      halfOpenRequests: number,
    },
  },

  // Local cache config (server mode only)
  local: {
    enabled: boolean,
    maxSize: number,
    ttl: number, // Local TTL can be shorter than Redis
  },

  // Pub/Sub config (server mode only)
  pubsub: {
    enabled: boolean,
    transport: 'redis-pubsub' | 'redis-streams',
    channels: {
      invalidateKey: string,
      invalidateTag: string,
      invalidatePattern: string,
    },
  },

  // Client revalidation (optional)
  revalidation: {
    enabled: boolean,
    transport: 'sse' | 'polling',
    endpoint: string, // SSE endpoint path
    pollInterval: number, // For polling mode
  },

  // Debug mode (optional)
  debug: boolean,

  // Event hooks (optional)
  hooks: {
    onHit?: (event: CacheHitEvent) => void,
    onMiss?: (event: CacheMissEvent) => void,
    onSet?: (event: CacheSetEvent) => void,
    onInvalidate?: (event: CacheInvalidateEvent) => void,
    onError?: (event: CacheErrorEvent) => void,
  },
})
```

### Cache Definition Configuration

```typescript
cache.define<TArgs, TData>({
  // Unique name (required)
  name: string,

  // Key builder (required)
  key: (...args: TArgs) => string,

  // Fetch function (optional - can use manual set/get)
  fetch?: (...args: TArgs) => Promise<TData>,

  // Tags for invalidation (optional)
  tags?: (...args: TArgs) => string[],

  // TTL strategy (optional, default: no expiry)
  ttl?: number | false | ((data: TData) => number) | {
    duration: number,
    sliding: boolean,
  },

  // Stale-while-revalidate (optional)
  staleWhileRevalidate?: number,

  // Request deduplication (optional, default: true)
  dedupe?: boolean,

  // Automatic invalidation (optional)
  invalidates?: (...args: TArgs) => string[],
})
```

---

## Project Structure

```
remix-cache/
├── packages/
│   ├── remix-cache/                    # Main package
│   │   ├── src/
│   │   │   ├── server/                 # Server-side code
│   │   │   │   ├── cache.ts            # Main Cache class
│   │   │   │   ├── definition.ts       # CacheDefinition class
│   │   │   │   ├── redis-client.ts     # Redis connection wrapper
│   │   │   │   ├── pubsub.ts           # Pub/Sub handler
│   │   │   │   ├── serializer.ts       # Serialization (superjson)
│   │   │   │   ├── deduplicator.ts     # Stampede protection
│   │   │   │   ├── circuit-breaker.ts  # Circuit breaker
│   │   │   │   ├── local-cache.ts      # In-memory LRU cache
│   │   │   │   ├── versioned-cache.ts  # Serverless versioning
│   │   │   │   ├── tag-manager.ts      # Tag indexing
│   │   │   │   ├── pattern-matcher.ts  # Pattern invalidation
│   │   │   │   └── sse-handler.ts      # SSE endpoint generator
│   │   │   ├── react/                  # Client-side React hooks
│   │   │   │   ├── provider.tsx        # CacheProvider component
│   │   │   │   ├── use-cache.ts        # useCache hook
│   │   │   │   └── context.ts          # React context
│   │   │   ├── types/                  # TypeScript types
│   │   │   │   ├── cache.ts            # Cache types
│   │   │   │   ├── config.ts           # Config types
│   │   │   │   └── events.ts           # Event types
│   │   │   ├── utils/                  # Utilities
│   │   │   │   ├── key-builder.ts      # Key generation
│   │   │   │   ├── pattern-match.ts    # Pattern matching
│   │   │   │   └── env-detect.ts       # Environment detection
│   │   │   ├── index.ts                # Server exports
│   │   │   └── react.ts                # Client exports
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── README.md
│   │
│   └── examples/
│       └── remix-app/                  # Example Remix app
│           ├── app/
│           │   ├── cache.server.ts     # Cache configuration
│           │   ├── root.tsx            # CacheProvider setup
│           │   └── routes/
│           │       ├── users.$userId.tsx
│           │       └── api.cache-events.tsx
│           └── package.json
│
├── package.json                        # Root package.json (workspace)
├── tsconfig.json                       # Root TypeScript config
├── masterplan.md                       # This file
└── README.md                           # Project README
```

---

## Implementation Phases

### Phase 1: Core Foundation
**Goal:** Basic caching with Redis, type-safe API

**Deliverables:**
1. ✅ Project setup (monorepo with packages)
2. ✅ `createCache()` function
3. ✅ `cache.define()` function
4. ✅ Basic get/set/invalidate operations
5. ✅ TypeScript type inference
6. ✅ Serialization (superjson)
7. ✅ Key namespacing
8. ✅ Unit tests

### Phase 2: Advanced Cache Features
**Goal:** Production-ready caching features

**Deliverables:**
1. ✅ Tag-based invalidation
2. ✅ Pattern-based invalidation
3. ✅ Cache stampede protection (deduplication)
4. ✅ TTL strategies (fixed, conditional, sliding, infinite)
5. ✅ Stale-while-revalidate
6. ✅ Bulk operations (getMany, setMany, invalidateMany)
7. ✅ Cache warming
8. ✅ Error handling & circuit breaker
9. ✅ Observability hooks (events)

### Phase 3: Multi-Instance Sync (Server Mode)
**Goal:** Distributed caching for long-running servers

**Deliverables:**
1. ✅ Local in-memory cache (LRU)
2. ✅ Redis Pub/Sub integration
3. ✅ Two-layer cache (local + Redis)
4. ✅ Multi-instance invalidation sync
5. ✅ Environment detection (auto-mode)

### Phase 4: Serverless Support
**Goal:** Serverless-compatible caching

**Deliverables:**
1. ✅ Versioned cache keys
2. ✅ Tag invalidation with versioning
3. ✅ Serverless mode configuration
4. ✅ Orphan cleanup strategy

### Phase 5: Remix Integration (React)
**Goal:** Seamless client-server revalidation

**Deliverables:**
1. ✅ SSE endpoint generator
2. ✅ `CacheProvider` component
3. ✅ `useCache()` hook
4. ✅ Auto-revalidation on invalidation
5. ✅ Tag/key/pattern filtering
6. ✅ Debouncing

### Phase 6: Documentation & Examples
**Goal:** Production-ready release

**Deliverables:**
1. ✅ Comprehensive README
2. ✅ API documentation
3. ✅ Example Remix app
4. ✅ Migration guide
5. ✅ Performance benchmarks
6. ✅ Deployment guide (Vercel, Fly.io, Railway, etc.)

### Phase 7: Polish & Release
**Goal:** v1.0.0 release

**Deliverables:**
1. ✅ Integration tests
2. ✅ Performance optimizations
3. ✅ Edge case handling
4. ✅ Bundle size optimization
5. ✅ npm publish
6. ✅ Announcement post

---

## Success Metrics

### Developer Experience
- ✅ Zero-config setup for basic usage
- ✅ Full TypeScript inference (no manual types)
- ✅ < 10 lines of code for typical cache definition
- ✅ Works in both serverless and server environments

### Performance
- ✅ < 1ms for local cache hits
- ✅ < 5ms for Redis cache hits
- ✅ < 100ms for cache misses (with fetch)
- ✅ Stampede protection prevents duplicate fetches

### Reliability
- ✅ Graceful Redis failures (circuit breaker)
- ✅ Multi-instance consistency (pub/sub)
- ✅ Type-safe operations (compile-time safety)
- ✅ Comprehensive test coverage (>90%)

---

## Future Considerations (Post-V1)

### Potential V2 Features
- Distributed locks for critical operations
- Multi-region Redis support (geo-replication)
- Cache analytics dashboard
- GraphQL integration
- Cache preloading strategies
- Redis Cluster support
- Alternative backends (DynamoDB, Memcached)
- Cache compression for large values
- Partial cache invalidation (update specific fields)
- Time-based cache warming schedules

### Community Requests
- Monitor GitHub issues for feature requests
- Gather feedback from early adopters
- Create RFC process for major changes

---

## Open Questions & Decisions

### Resolved
✅ Serialization: Superjson
✅ Pattern invalidation: Index-based
✅ TTL: All options (fixed, conditional, sliding, infinite)
✅ Error handling: Fallback to fetch
✅ Stale-while-revalidate: Include in V1
✅ Operating modes: Auto-detect with override
✅ Client revalidation: SSE for server, none for serverless

### To Decide During Implementation
- Exact LRU cache library (lru-cache, quick-lru, etc.)
- SSE library (remix-utils or custom)
- Redis client version (ioredis v5 or v4)
- Bundle strategy (ESM, CJS, or both)
- Minimum Node.js version (16? 18?)

---

## Dependencies

### Core Dependencies
- `ioredis` - Redis client
- `superjson` - Serialization
- `lru-cache` or `quick-lru` - Local cache (TBD)

### React Dependencies
- `@remix-run/react` - Remix hooks
- `remix-utils` - SSE utilities (or build custom)

### Dev Dependencies
- `typescript`
- `vitest` - Testing
- `tsup` - Build tool
- `prettier` - Formatting
- `eslint` - Linting

---

## Summary

remix-cache is a comprehensive caching solution that:

1. **Simplifies caching** - Declarative API, zero boilerplate
2. **Works everywhere** - Serverless, long-running servers, multi-instance
3. **Type-safe** - Perfect TypeScript inference
4. **Production-ready** - Circuit breakers, observability, error handling
5. **Remix-native** - Deep integration with loaders/actions/hooks
6. **Developer-friendly** - Great DX, sensible defaults, escape hatches

This is **the** caching library for Remix applications.

---

**Last Updated:** 2025-01-01
**Status:** Planning Complete → Ready for Phase 1 Implementation
