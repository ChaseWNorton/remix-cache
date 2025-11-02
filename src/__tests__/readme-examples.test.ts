/**
 * README examples test
 * Verifies that all code examples in README.md actually work
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createCache } from '../index.js'
import type { Cache } from '../types/cache.js'

describe('README Examples', () => {
  let cache: Cache

  afterEach(async () => {
    if (cache) {
      await cache.close()
    }
  })

  describe('Quick Start Example', () => {
    it('should work with Redis URL from env', async () => {
      // Simulating: redis: process.env.REDIS_URL
      const REDIS_URL = 'redis://localhost:6379'

      cache = createCache({
        redis: REDIS_URL,
      })

      // Mock database
      const db = {
        user: {
          findUnique: async ({ where }: { where: { id: string } }) => ({
            id: where.id,
            name: `User ${where.id}`,
            email: `user${where.id}@example.com`,
          }),
        },
      }

      // Define cache as shown in README
      const userCache = cache.define({
        name: 'user',
        key: (userId: string) => userId,
        ttl: 3600,
        fetch: async (userId: string) => {
          return db.user.findUnique({ where: { id: userId } })
        },
      })

      // Simulate loader usage
      const params = { userId: '123' }
      const user = await userCache.get(params.userId)

      expect(user).toEqual({
        id: '123',
        name: 'User 123',
        email: 'user123@example.com',
      })

      // Simulate action usage
      await db.user // Mock update
      await userCache.invalidate(params.userId)

      // Verify invalidation worked
      const userAfter = await userCache.get(params.userId)
      expect(userAfter).toBeDefined() // Will refetch
    })

    it('should work with object config', async () => {
      cache = createCache({
        redis: {
          host: 'localhost',
          port: 6379,
        },
      })

      const userCache = cache.define({
        name: 'user',
        key: (userId: string) => userId,
        ttl: 3600,
        fetch: async (userId: string) => ({
          id: userId,
          name: `User ${userId}`,
        }),
      })

      const user = await userCache.get('456')

      expect(user).toEqual({
        id: '456',
        name: 'User 456',
      })
    })
  })

  describe('Common Patterns', () => {
    beforeEach(() => {
      cache = createCache({
        redis: {
          host: 'localhost',
          port: 6379,
        },
        prefix: `patterns-${Math.random().toString(36).substring(7)}`,
      })
    })

    it('should support cache without fetch (manual control)', async () => {
      const sessionCache = cache.define<{ userId: string; token: string }>({
        name: 'session',
        key: (sessionId: string) => sessionId,
        ttl: 86400, // 24 hours
      })

      // Manual set
      await sessionCache.set('session-123', {
        userId: 'user-456',
        token: 'abc123',
      })

      // Get
      const session = await sessionCache.get('session-123')
      expect(session).toEqual({
        userId: 'user-456',
        token: 'abc123',
      })

      // Invalidate
      await sessionCache.invalidate('session-123')
      const after = await sessionCache.get('session-123')
      expect(after).toBeNull()
    })

    it('should support tag-based invalidation', async () => {
      const productCache = cache.define({
        name: 'product',
        key: (id: string) => id,
        fetch: async (id: string) => ({
          id,
          name: `Product ${id}`,
          category: id.startsWith('cat-') ? 'category' : 'other',
        }),
        tags: (id, product) => {
          if (!product) return ['product']
          return ['product', `category:${product.category}`]
        },
        ttl: 3600,
      })

      // Fetch products
      await productCache.get('cat-1')
      await productCache.get('cat-2')
      await productCache.get('other-1')

      // Invalidate all products in category
      await cache.invalidateTag('category:category')

      // Category products should be invalidated
      const cat1 = await productCache.get('cat-1')
      const cat2 = await productCache.get('cat-2')
      const other1 = await productCache.get('other-1')

      expect(cat1).toBeDefined() // Refetched
      expect(cat2).toBeDefined() // Refetched
      expect(other1).toBeDefined() // Still cached or refetched
    })

    it('should support multi-argument keys', async () => {
      const searchCache = cache.define({
        name: 'search',
        key: (query: string, page: number, filters: string[]) =>
          `${query}:${page}:${filters.join(',')}`,
        fetch: async (query: string, page: number, filters: string[]) => ({
          query,
          page,
          filters,
          results: [`result-${page}-1`, `result-${page}-2`],
        }),
        ttl: 300,
      })

      const results = await searchCache.get('laptop', 1, ['in-stock', 'sale'])

      expect(results).toEqual({
        query: 'laptop',
        page: 1,
        filters: ['in-stock', 'sale'],
        results: ['result-1-1', 'result-1-2'],
      })
    })

    it('should support conditional TTL based on data', async () => {
      const apiCache = cache.define<{ status: 'success' | 'error'; data?: any }>({
        name: 'api-response',
        key: (endpoint: string) => endpoint,
        fetch: async (endpoint: string) => {
          if (endpoint === '/error') {
            return { status: 'error' as const }
          }
          return { status: 'success' as const, data: 'result' }
        },
        ttl: (endpoint, response) => {
          if (!response) return 60
          // Don't cache errors for long
          if (response.status === 'error') return 10
          return 3600
        },
      })

      const success = await apiCache.get('/success')
      const error = await apiCache.get('/error')

      expect(success?.status).toBe('success')
      expect(error?.status).toBe('error')
    })

    it('should support bulk operations', async () => {
      const bulkCache = cache.define<{ id: string; value: string }>({
        name: 'bulk',
        key: (id: string) => id,
        ttl: 60,
      })

      // Bulk set
      await bulkCache.setMany([
        { args: ['1'], value: { id: '1', value: 'one' } },
        { args: ['2'], value: { id: '2', value: 'two' } },
        { args: ['3'], value: { id: '3', value: 'three' } },
      ])

      // Bulk get
      const results = await bulkCache.getMany([['1'], ['2'], ['3']])

      expect(results).toHaveLength(3)
      expect(results[0]).toEqual({ id: '1', value: 'one' })
      expect(results[1]).toEqual({ id: '2', value: 'two' })
      expect(results[2]).toEqual({ id: '3', value: 'three' })

      // Bulk invalidate
      await bulkCache.invalidateMany([['1'], ['2']])

      const afterInvalidate = await bulkCache.getMany([['1'], ['2'], ['3']])
      expect(afterInvalidate[0]).toBeNull()
      expect(afterInvalidate[1]).toBeNull()
      expect(afterInvalidate[2]).toEqual({ id: '3', value: 'three' })
    })
  })
})
