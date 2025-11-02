/**
 * Edge case tests - Testing boundary conditions and unusual inputs
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createCache } from '../index.js'
import type { Cache } from '../types/cache.js'

describe('Edge Cases', () => {
  let cache: Cache
  let testPrefix: string

  beforeEach(() => {
    testPrefix = `edge-${Math.random().toString(36).substring(7)}`
    cache = createCache({
      redis: {
        host: 'localhost',
        port: 6379,
      },
      prefix: testPrefix,
    })
  })

  afterEach(async () => {
    await cache.close()
  })

  describe('Null and Undefined Values', () => {
    it('should cache and retrieve null values', async () => {
      const testCache = cache.define<null>({
        name: 'null-test',
        key: (id: string) => id,
        ttl: 60,
      })

      await testCache.set('test', null)
      const result = await testCache.get('test')

      expect(result).toBeNull()
    })

    it('should handle fetch returning null', async () => {
      const testCache = cache.define<null>({
        name: 'null-fetch',
        key: (id: string) => id,
        fetch: async () => null,
        ttl: 60,
      })

      const result = await testCache.get('test')
      expect(result).toBeNull()
    })

    it('should return null for non-existent keys without fetch', async () => {
      const testCache = cache.define<{ value: string }>({
        name: 'no-fetch',
        key: (id: string) => id,
        ttl: 60,
      })

      const result = await testCache.get('non-existent')
      expect(result).toBeNull()
    })
  })

  describe('Empty Values', () => {
    it('should cache empty objects', async () => {
      const testCache = cache.define<object>({
        name: 'empty-object',
        key: (id: string) => id,
        ttl: 60,
      })

      const emptyObj = {}
      await testCache.set('test', emptyObj)
      const result = await testCache.get('test')

      expect(result).toEqual({})
    })

    it('should cache empty arrays', async () => {
      const testCache = cache.define<any[]>({
        name: 'empty-array',
        key: (id: string) => id,
        ttl: 60,
      })

      await testCache.set('test', [])
      const result = await testCache.get('test')

      expect(result).toEqual([])
    })

    it('should cache empty strings', async () => {
      const testCache = cache.define<string>({
        name: 'empty-string',
        key: (id: string) => id,
        ttl: 60,
      })

      await testCache.set('test', '')
      const result = await testCache.get('test')

      expect(result).toBe('')
    })

    it('should cache zero values', async () => {
      const testCache = cache.define<number>({
        name: 'zero',
        key: (id: string) => id,
        ttl: 60,
      })

      await testCache.set('test', 0)
      const result = await testCache.get('test')

      expect(result).toBe(0)
    })

    it('should cache false boolean', async () => {
      const testCache = cache.define<boolean>({
        name: 'false-bool',
        key: (id: string) => id,
        ttl: 60,
      })

      await testCache.set('test', false)
      const result = await testCache.get('test')

      expect(result).toBe(false)
    })
  })

  describe('Special Characters in Keys', () => {
    it('should handle keys with spaces', async () => {
      const testCache = cache.define({
        name: 'spaces',
        key: (id: string) => id,
        ttl: 60,
      })

      await testCache.set('key with spaces', { value: 'test' })
      const result = await testCache.get('key with spaces')

      expect(result).toEqual({ value: 'test' })
    })

    it('should handle keys with unicode characters', async () => {
      const testCache = cache.define({
        name: 'unicode',
        key: (id: string) => id,
        ttl: 60,
      })

      await testCache.set('用户-123', { value: 'test' })
      const result = await testCache.get('用户-123')

      expect(result).toEqual({ value: 'test' })
    })

    it('should handle keys with emojis', async () => {
      const testCache = cache.define({
        name: 'emoji',
        key: (id: string) => id,
        ttl: 60,
      })

      await testCache.set('user-🔥-123', { value: 'test' })
      const result = await testCache.get('user-🔥-123')

      expect(result).toEqual({ value: 'test' })
    })

    it('should handle keys with special symbols', async () => {
      const testCache = cache.define({
        name: 'symbols',
        key: (id: string) => id,
        ttl: 60,
      })

      await testCache.set('user@email.com', { value: 'test' })
      const result = await testCache.get('user@email.com')

      expect(result).toEqual({ value: 'test' })
    })
  })

  describe('Large Payloads', () => {
    it('should handle large objects (100KB+)', async () => {
      const testCache = cache.define<{ data: string[] }>({
        name: 'large',
        key: (id: string) => id,
        ttl: 60,
      })

      // Create a large array of strings (~100KB)
      const largeData = {
        data: Array(1000)
          .fill(null)
          .map((_, i) => `Item ${i} with some additional text to increase size`),
      }

      await testCache.set('large-item', largeData)
      const result = await testCache.get('large-item')

      expect(result).toEqual(largeData)
      expect(result?.data).toHaveLength(1000)
    })

    it('should handle deeply nested objects', async () => {
      const testCache = cache.define<any>({
        name: 'nested',
        key: (id: string) => id,
        ttl: 60,
      })

      // Create a deeply nested object
      let nested: any = { value: 'deep' }
      for (let i = 0; i < 50; i++) {
        nested = { level: i, child: nested }
      }

      await testCache.set('deep', nested)
      const result = await testCache.get('deep')

      expect(result).toEqual(nested)
    })
  })

  describe('Multiple Cache Instances', () => {
    it('should support multiple independent cache instances', async () => {
      const cache1 = createCache({
        redis: { host: 'localhost', port: 6379 },
        prefix: 'cache1',
      })

      const cache2 = createCache({
        redis: { host: 'localhost', port: 6379 },
        prefix: 'cache2',
      })

      const def1 = cache1.define({
        name: 'test',
        key: (id: string) => id,
        ttl: 60,
      })

      const def2 = cache2.define({
        name: 'test',
        key: (id: string) => id,
        ttl: 60,
      })

      await def1.set('1', { cache: 'cache1' })
      await def2.set('1', { cache: 'cache2' })

      const result1 = await def1.get('1')
      const result2 = await def2.get('1')

      expect(result1).toEqual({ cache: 'cache1' })
      expect(result2).toEqual({ cache: 'cache2' })

      await cache1.close()
      await cache2.close()
    })
  })

  describe('Concurrent Operations', () => {
    it('should handle concurrent get requests for same key', async () => {
      let fetchCount = 0

      const testCache = cache.define({
        name: 'concurrent',
        key: (id: string) => id,
        fetch: async (id: string) => {
          fetchCount++
          await new Promise((resolve) => setTimeout(resolve, 100))
          return { id, value: `Item ${id}` }
        },
        ttl: 60,
      })

      // Make 10 concurrent requests for the same key
      const promises = Array(10)
        .fill(null)
        .map(() => testCache.get('1'))

      const results = await Promise.all(promises)

      // All should return the same value
      expect(results).toHaveLength(10)
      results.forEach((result) => {
        expect(result).toEqual({ id: '1', value: 'Item 1' })
      })

      // Fetch should only be called once due to deduplication
      expect(fetchCount).toBe(1)
    })

    it('should handle concurrent set/get operations', async () => {
      const testCache = cache.define<{ value: number }>({
        name: 'concurrent-write',
        key: (id: string) => id,
        ttl: 60,
      })

      // Concurrent writes to different keys
      const writePromises = Array(50)
        .fill(null)
        .map((_, i) => testCache.set(`key-${i}`, { value: i }))

      await Promise.all(writePromises)

      // Read them all back
      const readPromises = Array(50)
        .fill(null)
        .map((_, i) => testCache.get(`key-${i}`))

      const results = await Promise.all(readPromises)

      results.forEach((result, i) => {
        expect(result).toEqual({ value: i })
      })
    })
  })

  describe('Error Handling', () => {
    it('should handle fetch function throwing errors', async () => {
      const testCache = cache.define({
        name: 'error-fetch',
        key: (id: string) => id,
        fetch: async () => {
          throw new Error('Fetch failed')
        },
        ttl: 60,
      })

      await expect(testCache.get('test')).rejects.toThrow('Fetch failed')
    })

    it('should invalidate non-existent keys without error', async () => {
      const testCache = cache.define({
        name: 'invalidate-missing',
        key: (id: string) => id,
        ttl: 60,
      })

      // Should not throw
      await expect(testCache.invalidate('non-existent')).resolves.toBeUndefined()
    })

    it('should handle invalidating already invalidated keys', async () => {
      const testCache = cache.define({
        name: 'double-invalidate',
        key: (id: string) => id,
        ttl: 60,
      })

      await testCache.set('test', { value: 'data' })
      await testCache.invalidate('test')

      // Invalidate again should not error
      await expect(testCache.invalidate('test')).resolves.toBeUndefined()
    })
  })
})
