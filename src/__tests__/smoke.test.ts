/**
 * Smoke tests - Basic end-to-end functionality tests
 * These tests verify the library works as a whole
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createCache } from '../index.js'
import type { Cache } from '../types/cache.js'

describe('Smoke Tests', () => {
  let cache: Cache
  let testPrefix: string

  beforeEach(() => {
    testPrefix = `smoke-${Math.random().toString(36).substring(7)}`
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

  it('should create cache and perform basic operations', async () => {
    // Define a cache
    const userCache = cache.define({
      name: 'user',
      key: (userId: string) => userId,
      fetch: async (userId: string) => ({
        id: userId,
        name: `User ${userId}`,
        email: `user${userId}@example.com`,
      }),
      ttl: 60,
    })

    // Get (cache miss - will fetch)
    const user1 = await userCache.get('123')
    expect(user1).toEqual({
      id: '123',
      name: 'User 123',
      email: 'user123@example.com',
    })

    // Get again (cache hit)
    const user2 = await userCache.get('123')
    expect(user2).toEqual(user1)

    // Set
    await userCache.set('456', {
      id: '456',
      name: 'Manual User',
      email: 'manual@example.com',
    })

    // Get manually set value
    const user3 = await userCache.get('456')
    expect(user3).toEqual({
      id: '456',
      name: 'Manual User',
      email: 'manual@example.com',
    })

    // Invalidate
    await userCache.invalidate('123')

    // Get after invalidate (will refetch since we have fetch function)
    const user4 = await userCache.get('123')
    expect(user4).toBeDefined() // Will refetch
  })

  it('should handle tags and invalidation', async () => {
    const productCache = cache.define({
      name: 'product',
      key: (id: string) => id,
      fetch: async (id: string) => ({
        id,
        name: `Product ${id}`,
        category: 'electronics',
      }),
      ttl: 60,
      tags: (id, product) => {
        if (!product) return ['product']
        return ['product', `category:${product.category}`]
      },
    })

    // Populate cache
    await productCache.get('1')
    await productCache.get('2')

    // Invalidate by tag
    await cache.invalidateTag('product')

    // Should refetch after invalidation
    const product = await productCache.get('1')
    expect(product).toBeDefined()
  })

  it('should handle bulk operations', async () => {
    const bulkCache = cache.define({
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

    // Verify invalidated
    const afterDelete = await bulkCache.getMany([['1'], ['2'], ['3']])
    expect(afterDelete[0]).toBeNull()
    expect(afterDelete[1]).toBeNull()
    expect(afterDelete[2]).toEqual({ id: '3', value: 'three' })
  })

  it('should work in serverless mode', async () => {
    const serverlessCache = createCache({
      redis: {
        host: 'localhost',
        port: 6379,
      },
      prefix: `serverless-${Math.random().toString(36).substring(7)}`,
      mode: 'serverless', // No local cache
    })

    const dataCache = serverlessCache.define({
      name: 'data',
      key: (id: string) => id,
      fetch: async (id: string) => ({ id, value: `Data ${id}` }),
      ttl: 60,
    })

    const data = await dataCache.get('test')
    expect(data).toEqual({ id: 'test', value: 'Data test' })

    await serverlessCache.close()
  })

  it('should emit events', async () => {
    const events: string[] = []

    cache.on('hit', () => events.push('hit'))
    cache.on('miss', () => events.push('miss'))
    cache.on('set', () => events.push('set'))
    cache.on('invalidate', () => events.push('invalidate'))

    const testCache = cache.define({
      name: 'events',
      key: (id: string) => id,
      fetch: async (id: string) => ({ id }),
      ttl: 60,
    })

    // Miss event
    await testCache.get('1')
    expect(events).toContain('miss')
    expect(events).toContain('set')

    // Hit event
    events.length = 0
    await testCache.get('1')
    expect(events).toContain('hit')

    // Invalidate event
    events.length = 0
    await testCache.invalidate('1')
    expect(events).toContain('invalidate')
  })

  it('should handle multiple cache definitions', async () => {
    const userCache = cache.define({
      name: 'user',
      key: (id: string) => id,
      fetch: async (id: string) => ({ id, name: `User ${id}` }),
      ttl: 60,
    })

    const productCache = cache.define({
      name: 'product',
      key: (id: string) => id,
      fetch: async (id: string) => ({ id, name: `Product ${id}` }),
      ttl: 60,
    })

    // Both caches should work independently
    const user = await userCache.get('1')
    const product = await productCache.get('1')

    expect(user).toEqual({ id: '1', name: 'User 1' })
    expect(product).toEqual({ id: '1', name: 'Product 1' })

    // Invalidating one shouldn't affect the other
    await userCache.invalidate('1')

    const user2 = await userCache.get('1')
    const product2 = await productCache.get('1')

    expect(user2).toEqual({ id: '1', name: 'User 1' }) // Refetched
    expect(product2).toEqual(product) // Still cached
  })
})
