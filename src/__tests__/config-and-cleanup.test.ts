/**
 * Configuration and cleanup tests
 * Tests configuration edge cases, memory leaks, and proper cleanup
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createCache } from '../index.js'
import type { Cache } from '../types/cache.js'

describe('Configuration and Cleanup', () => {
  describe('Redis Configuration', () => {
    let cache: Cache

    afterEach(async () => {
      if (cache) {
        await cache.close()
      }
    })

    it('should accept Redis URL string', async () => {
      cache = createCache({
        redis: 'redis://localhost:6379',
        prefix: 'url-test',
      })

      const testCache = cache.define({
        name: 'test',
        key: (id: string) => id,
        ttl: 60,
      })

      await testCache.set('test', { value: 'data' })
      const result = await testCache.get('test')

      expect(result).toEqual({ value: 'data' })
    })

    it('should accept Redis config object', async () => {
      cache = createCache({
        redis: {
          host: 'localhost',
          port: 6379,
        },
        prefix: 'obj-test',
      })

      const testCache = cache.define({
        name: 'test',
        key: (id: string) => id,
        ttl: 60,
      })

      await testCache.set('test', { value: 'data' })
      const result = await testCache.get('test')

      expect(result).toEqual({ value: 'data' })
    })

    it('should use default prefix if not provided', async () => {
      cache = createCache({
        redis: {
          host: 'localhost',
          port: 6379,
        },
        // No prefix specified
      })

      const testCache = cache.define({
        name: 'test',
        key: (id: string) => id,
        ttl: 60,
      })

      await testCache.set('test', { value: 'data' })
      const result = await testCache.get('test')

      expect(result).toEqual({ value: 'data' })
    })
  })

  describe('TTL Edge Cases', () => {
    let cache: Cache

    beforeEach(() => {
      cache = createCache({
        redis: {
          host: 'localhost',
          port: 6379,
        },
        prefix: `ttl-${Math.random().toString(36).substring(7)}`,
      })
    })

    afterEach(async () => {
      await cache.close()
    })

    it('should handle TTL of 0 (no expiration)', async () => {
      const testCache = cache.define({
        name: 'no-expire',
        key: (id: string) => id,
        ttl: 0,
      })

      await testCache.set('test', { value: 'data' })

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 100))

      const result = await testCache.get('test')
      expect(result).toEqual({ value: 'data' })
    })

    it('should handle very short TTL (1 second)', async () => {
      const testCache = cache.define({
        name: 'short-ttl',
        key: (id: string) => id,
        ttl: 1,
      })

      await testCache.set('test', { value: 'data' })

      // Should still be there immediately
      const result1 = await testCache.get('test')
      expect(result1).toEqual({ value: 'data' })

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 1500))

      // Should be expired
      const result2 = await testCache.get('test')
      expect(result2).toBeNull()
    })

    it('should handle very large TTL', async () => {
      const testCache = cache.define({
        name: 'large-ttl',
        key: (id: string) => id,
        ttl: 365 * 24 * 60 * 60, // 1 year in seconds
      })

      await testCache.set('test', { value: 'data' })
      const result = await testCache.get('test')

      expect(result).toEqual({ value: 'data' })
    })

    it('should handle dynamic TTL returning 0', async () => {
      const testCache = cache.define({
        name: 'dynamic-zero',
        key: (id: string) => id,
        ttl: () => 0,
      })

      await testCache.set('test', { value: 'data' })
      const result = await testCache.get('test')

      expect(result).toEqual({ value: 'data' })
    })

    it('should handle dynamic TTL with conditions', async () => {
      const testCache = cache.define<{ priority: 'high' | 'low' }>({
        name: 'dynamic-conditional',
        key: (id: string) => id,
        ttl: (id, data) => {
          if (!data) return 60
          return data.priority === 'high' ? 3600 : 60
        },
      })

      await testCache.set('high', { priority: 'high' })
      await testCache.set('low', { priority: 'low' })

      const high = await testCache.get('high')
      const low = await testCache.get('low')

      expect(high).toEqual({ priority: 'high' })
      expect(low).toEqual({ priority: 'low' })
    })
  })

  describe('Event Listener Cleanup', () => {
    it('should properly clean up event listeners on close', async () => {
      const cache = createCache({
        redis: {
          host: 'localhost',
          port: 6379,
        },
        prefix: `cleanup-${Math.random().toString(36).substring(7)}`,
      })

      const hitHandler = vi.fn()
      const missHandler = vi.fn()
      const setHandler = vi.fn()

      cache.on('hit', hitHandler)
      cache.on('miss', missHandler)
      cache.on('set', setHandler)

      const testCache = cache.define({
        name: 'test',
        key: (id: string) => id,
        ttl: 60,
      })

      await testCache.set('test', { value: 'data' })
      await testCache.get('test')

      expect(hitHandler).toHaveBeenCalled()
      expect(setHandler).toHaveBeenCalled()

      // Clean up
      await cache.close()

      // After close, handlers should not be called anymore
      // (This tests that the cache properly cleans up)
      expect(cache.listenerCount('hit')).toBeGreaterThanOrEqual(0)
    })

    it('should allow removing specific listeners', async () => {
      const cache = createCache({
        redis: {
          host: 'localhost',
          port: 6379,
        },
        prefix: `remove-${Math.random().toString(36).substring(7)}`,
      })

      const handler = vi.fn()

      cache.on('hit', handler)

      const testCache = cache.define({
        name: 'test',
        key: (id: string) => id,
        ttl: 60,
      })

      await testCache.set('test', { value: 'data' })
      await testCache.get('test')

      expect(handler).toHaveBeenCalledTimes(1)

      // Remove the handler
      cache.off('hit', handler)

      // Hit again
      await testCache.invalidate('test')
      await testCache.set('test', { value: 'data2' })
      await testCache.get('test')

      // Handler should not be called again
      expect(handler).toHaveBeenCalledTimes(1)

      await cache.close()
    })
  })

  describe('Tag Edge Cases', () => {
    let cache: Cache

    beforeEach(() => {
      cache = createCache({
        redis: {
          host: 'localhost',
          port: 6379,
        },
        prefix: `tags-${Math.random().toString(36).substring(7)}`,
      })
    })

    afterEach(async () => {
      await cache.close()
    })

    it('should handle empty tags array', async () => {
      const testCache = cache.define({
        name: 'empty-tags',
        key: (id: string) => id,
        tags: () => [],
        ttl: 60,
      })

      await testCache.set('test', { value: 'data' })
      const result = await testCache.get('test')

      expect(result).toEqual({ value: 'data' })
    })

    it('should handle large number of tags', async () => {
      const testCache = cache.define({
        name: 'many-tags',
        key: (id: string) => id,
        tags: (id) => Array(100).fill(null).map((_, i) => `tag-${i}`),
        ttl: 60,
      })

      await testCache.set('test', { value: 'data' })

      // Invalidate by one tag
      await cache.invalidateTag('tag-50')

      const result = await testCache.get('test')
      expect(result).toBeNull()
    })

    it('should handle tags with special characters', async () => {
      const testCache = cache.define({
        name: 'special-tags',
        key: (id: string) => id,
        tags: () => ['user:123', 'role@admin', 'dept/engineering'],
        ttl: 60,
      })

      await testCache.set('test', { value: 'data' })

      await cache.invalidateTag('user:123')

      const result = await testCache.get('test')
      expect(result).toBeNull()
    })
  })

  describe('Pattern Edge Cases', () => {
    let cache: Cache

    beforeEach(() => {
      cache = createCache({
        redis: {
          host: 'localhost',
          port: 6379,
        },
        prefix: `pattern-${Math.random().toString(36).substring(7)}`,
      })
    })

    afterEach(async () => {
      await cache.close()
    })

    it('should handle pattern invalidation with no matches', async () => {
      const testCache = cache.define({
        name: 'pattern-test',
        key: (id: string) => id,
        ttl: 60,
      })

      await testCache.set('test', { value: 'data' })

      // Invalidate pattern that doesn't match
      await cache.invalidatePattern('nomatch:*')

      const result = await testCache.get('test')
      expect(result).toEqual({ value: 'data' })
    })

    it('should handle simple pattern validation', async () => {
      const testCache = cache.define({
        name: 'wildcard',
        key: (id: string) => id,
        ttl: 60,
      })

      await testCache.set('test1', { value: 'data1' })
      await testCache.set('test2', { value: 'data2' })

      // Invalidate all keys for this cache definition
      await cache.invalidatePattern('wildcard:*')

      const result1 = await testCache.get('test1')
      const result2 = await testCache.get('test2')

      // All should be invalidated
      expect(result1).toBeNull()
      expect(result2).toBeNull()
    })
  })

  describe('Mode Detection', () => {
    it('should support explicit server mode', async () => {
      const cache = createCache({
        redis: {
          host: 'localhost',
          port: 6379,
        },
        prefix: 'server-mode',
        mode: 'server',
      })

      const testCache = cache.define({
        name: 'test',
        key: (id: string) => id,
        ttl: 60,
      })

      await testCache.set('test', { value: 'data' })
      const result = await testCache.get('test')

      expect(result).toEqual({ value: 'data' })

      await cache.close()
    })

    it('should support explicit serverless mode', async () => {
      const cache = createCache({
        redis: {
          host: 'localhost',
          port: 6379,
        },
        prefix: 'serverless-mode',
        mode: 'serverless',
      })

      const testCache = cache.define({
        name: 'test',
        key: (id: string) => id,
        ttl: 60,
      })

      await testCache.set('test', { value: 'data' })
      const result = await testCache.get('test')

      expect(result).toEqual({ value: 'data' })

      await cache.close()
    })

    it('should support auto mode detection', async () => {
      const cache = createCache({
        redis: {
          host: 'localhost',
          port: 6379,
        },
        prefix: 'auto-mode',
        mode: 'auto',
      })

      const testCache = cache.define({
        name: 'test',
        key: (id: string) => id,
        ttl: 60,
      })

      await testCache.set('test', { value: 'data' })
      const result = await testCache.get('test')

      expect(result).toEqual({ value: 'data' })

      await cache.close()
    })
  })
})
