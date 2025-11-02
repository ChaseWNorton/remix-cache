import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createCache } from '../cache.js'
import { createSSEHandler } from '../sse-handler.js'
import type { Cache } from '../../types/cache.js'
import Redis from 'ioredis'

describe('SSE Handler', () => {
  let cache: Cache
  let redis: Redis

  beforeEach(async () => {
    redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: Number(process.env.REDIS_PORT) || 6379,
    })

    await redis.flushdb()

    cache = createCache({
      redis,
      prefix: 'test-sse',
      mode: 'server',
      debug: false,
    })
  })

  afterEach(async () => {
    try {
      if (redis.status === 'ready') {
        await redis.flushdb()
      }
    } catch (e) {
      // Ignore errors during cleanup
    }
    try {
      await cache.close()
    } catch (e) {
      // Ignore errors during cleanup
    }
  })

  describe('createSSEHandler', () => {
    it('should create an SSE handler function', () => {
      const handler = createSSEHandler(cache)
      expect(handler).toBeInstanceOf(Function)
    })

    it('should return a function that accepts request object', async () => {
      const handler = createSSEHandler(cache)

      // Mock Request with AbortController
      const controller = new AbortController()
      const request = new Request('http://localhost/api/cache-events', {
        signal: controller.signal,
      })

      // Handler should return a Response with event-stream content type
      const response = await handler({ request } as any)

      expect(response).toBeInstanceOf(Response)
      expect(response.headers.get('content-type')).toContain('text/event-stream')
      expect(response.headers.get('cache-control')).toBe('no-cache')
      expect(response.headers.get('connection')).toBe('keep-alive')

      controller.abort()
    })

    it('should stream invalidation events when cache is invalidated', async () => {
      const handler = createSSEHandler(cache)
      const controller = new AbortController()
      const request = new Request('http://localhost/api/cache-events', {
        signal: controller.signal,
      })

      const response = await handler({ request } as any)
      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      // Start reading events in background
      const events: string[] = []
      const readEvents = async () => {
        if (!reader) return
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            const text = decoder.decode(value)
            events.push(text)
          }
        } catch (e) {
          // Stream closed
        }
      }
      const readPromise = readEvents()

      // Give stream time to connect
      await new Promise((resolve) => setTimeout(resolve, 100))

      // Trigger invalidation
      const userCache = cache.define({
        name: 'user',
        key: (userId: string) => userId,
      })
      await userCache.set('1', { id: '1', name: 'Test' })
      await userCache.invalidate('1')

      // Wait for event to be sent
      await new Promise((resolve) => setTimeout(resolve, 100))

      // Close stream
      controller.abort()
      await readPromise

      // Should have received invalidation event
      expect(events.length).toBeGreaterThan(0)
      const eventData = events.join('')
      expect(eventData).toContain('event: invalidate')
      expect(eventData).toContain('test-sse:user:1')
    })

    it('should send events with correct SSE format', async () => {
      const handler = createSSEHandler(cache)
      const controller = new AbortController()
      const request = new Request('http://localhost/api/cache-events', {
        signal: controller.signal,
      })

      const response = await handler({ request } as any)
      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      const events: string[] = []
      const readEvents = async () => {
        if (!reader) return
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            events.push(decoder.decode(value))
          }
        } catch (e) {
          // Stream closed
        }
      }
      const readPromise = readEvents()

      await new Promise((resolve) => setTimeout(resolve, 100))

      const userCache = cache.define({
        name: 'user',
        key: (userId: string) => userId,
      })
      await userCache.set('1', { id: '1', name: 'Test' })
      await userCache.invalidate('1')

      await new Promise((resolve) => setTimeout(resolve, 100))

      controller.abort()
      await readPromise

      const fullEvent = events.join('')

      // SSE format: event: <event-name>\ndata: <json>\n\n
      expect(fullEvent).toMatch(/event: invalidate\n/)
      expect(fullEvent).toMatch(/data: \{.*\}\n/)
    })

    it('should include timestamp in event data', async () => {
      const handler = createSSEHandler(cache)
      const controller = new AbortController()
      const request = new Request('http://localhost/api/cache-events', {
        signal: controller.signal,
      })

      const response = await handler({ request } as any)
      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      const events: string[] = []
      const readEvents = async () => {
        if (!reader) return
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            events.push(decoder.decode(value))
          }
        } catch (e) {
          // Stream closed
        }
      }
      const readPromise = readEvents()

      await new Promise((resolve) => setTimeout(resolve, 100))

      const userCache = cache.define({
        name: 'user',
        key: (userId: string) => userId,
      })
      await userCache.set('1', { id: '1', name: 'Test' })
      await userCache.invalidate('1')

      await new Promise((resolve) => setTimeout(resolve, 100))

      controller.abort()
      await readPromise

      const fullEvent = events.join('')
      expect(fullEvent).toContain('"timestamp"')
    })

    it('should clean up event listener when connection closes', async () => {
      const handler = createSSEHandler(cache)
      const controller = new AbortController()
      const request = new Request('http://localhost/api/cache-events', {
        signal: controller.signal,
      })

      // Track number of listeners before and after
      const initialListenerCount = cache.listenerCount('invalidate')

      const response = await handler({ request } as any)

      // Should have added a listener
      await new Promise((resolve) => setTimeout(resolve, 50))
      const afterConnectCount = cache.listenerCount('invalidate')
      expect(afterConnectCount).toBeGreaterThan(initialListenerCount)

      // Close connection
      controller.abort()
      await new Promise((resolve) => setTimeout(resolve, 100))

      // Listener should be removed
      const afterCloseCount = cache.listenerCount('invalidate')
      expect(afterCloseCount).toBe(initialListenerCount)
    })

    it('should support tag invalidation events', async () => {
      const handler = createSSEHandler(cache)
      const controller = new AbortController()
      const request = new Request('http://localhost/api/cache-events', {
        signal: controller.signal,
      })

      const response = await handler({ request } as any)
      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      const events: string[] = []
      const readEvents = async () => {
        if (!reader) return
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            events.push(decoder.decode(value))
          }
        } catch (e) {
          // Stream closed
        }
      }
      const readPromise = readEvents()

      await new Promise((resolve) => setTimeout(resolve, 100))

      const userCache = cache.define({
        name: 'user',
        key: (userId: string) => userId,
        tags: (userId: string) => [`user:${userId}`],
      })

      await userCache.set('1', { id: '1', name: 'Test' })
      await cache.invalidateTag('user:1')

      await new Promise((resolve) => setTimeout(resolve, 100))

      controller.abort()
      await readPromise

      const fullEvent = events.join('')
      expect(fullEvent).toContain('"tag"')
      expect(fullEvent).toContain('user:1')
    })

    it('should support pattern invalidation events', async () => {
      const handler = createSSEHandler(cache)
      const controller = new AbortController()
      const request = new Request('http://localhost/api/cache-events', {
        signal: controller.signal,
      })

      const response = await handler({ request } as any)
      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      const events: string[] = []
      const readEvents = async () => {
        if (!reader) return
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            events.push(decoder.decode(value))
          }
        } catch (e) {
          // Stream closed
        }
      }
      const readPromise = readEvents()

      await new Promise((resolve) => setTimeout(resolve, 100))

      const userCache = cache.define({
        name: 'user',
        key: (userId: string) => userId,
      })

      await userCache.set('1', { id: '1', name: 'Test' })
      await cache.invalidatePattern('user:*')

      await new Promise((resolve) => setTimeout(resolve, 100))

      controller.abort()
      await readPromise

      const fullEvent = events.join('')
      expect(fullEvent).toContain('"pattern"')
      expect(fullEvent).toContain('user:*')
    })

    it('should handle multiple concurrent connections', async () => {
      const handler = createSSEHandler(cache)

      // Create 3 concurrent connections
      const controllers = [
        new AbortController(),
        new AbortController(),
        new AbortController(),
      ]

      const responses = await Promise.all(
        controllers.map((controller) =>
          handler({
            request: new Request('http://localhost/api/cache-events', {
              signal: controller.signal,
            }),
          } as any)
        )
      )

      await new Promise((resolve) => setTimeout(resolve, 100))

      // All should be connected
      expect(cache.listenerCount('invalidate')).toBe(3)

      // Close all
      controllers.forEach((c) => c.abort())
      await new Promise((resolve) => setTimeout(resolve, 100))

      // All should be cleaned up
      expect(cache.listenerCount('invalidate')).toBe(0)
    })
  })
})
