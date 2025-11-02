import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createCache } from '../cache.js'
import type { Cache } from '../../types/cache.js'
import Redis from 'ioredis'

describe('CacheDefinition', () => {
  let cache: Cache
  let redis: Redis

  beforeEach(async () => {
    redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: Number(process.env.REDIS_PORT) || 6379,
    })

    // Ensure Redis is connected and clean before each test
    await redis.flushdb()

    cache = createCache({
      redis,
      prefix: 'test-cache',
      debug: false,
    })
  })

  afterEach(async () => {
    try {
      // Flush before closing to ensure clean state
      if (redis.status === 'ready') {
        await redis.flushdb()
      }
    } catch (e) {
      // Ignore errors during cleanup
    }
    try {
      // Close cache (this will quit all 3 Redis clients including the one we passed in)
      await cache.close()
    } catch (e) {
      // Ignore errors during cleanup
    }
  })

  describe('get', () => {
    it('should return null for cache miss without fetch', async () => {
      const userCache = cache.define({
        name: 'user',
        key: (userId: string) => userId,
      })

      const result = await userCache.get('1')
      expect(result).toBeNull()
    })

    it('should fetch and cache on miss when fetch is provided', async () => {
      const fetchFn = vi.fn(async (userId: string) => ({
        id: userId,
        name: `User ${userId}`,
      }))

      const userCache = cache.define({
        name: 'user',
        key: (userId: string) => userId,
        fetch: fetchFn,
      })

      const result1 = await userCache.get('1')
      expect(result1).toEqual({ id: '1', name: 'User 1' })
      expect(fetchFn).toHaveBeenCalledTimes(1)

      const result2 = await userCache.get('1')
      expect(result2).toEqual({ id: '1', name: 'User 1' })
      expect(fetchFn).toHaveBeenCalledTimes(1)
    })

    it('should return cached value on hit', async () => {
      const userCache = cache.define({
        name: 'user',
        key: (userId: string) => userId,
      })

      await userCache.set('1', { id: '1', name: 'Test User' })
      const result = await userCache.get('1')

      expect(result).toEqual({ id: '1', name: 'Test User' })
    })

    it('should support multi-argument keys', async () => {
      const postsCache = cache.define({
        name: 'user-posts',
        key: (userId: string, status: string) => `${userId}:${status}`,
        fetch: async (userId: string, status: string) => [
          { id: 'p1', userId, status },
        ],
      })

      const result = await postsCache.get('1', 'published')
      expect(result).toEqual([{ id: 'p1', userId: '1', status: 'published' }])
    })
  })

  describe('set', () => {
    it('should store value in cache', async () => {
      const userCache = cache.define({
        name: 'user',
        key: (userId: string) => userId,
      })

      await userCache.set('1', { id: '1', name: 'Test User' })
      const result = await userCache.get('1')

      expect(result).toEqual({ id: '1', name: 'Test User' })
    })

    it('should respect TTL', async () => {
      const userCache = cache.define({
        name: 'user',
        key: (userId: string) => userId,
        ttl: 1,
      })

      await userCache.set('1', { id: '1', name: 'Test User' })

      const result1 = await userCache.get('1')
      expect(result1).toEqual({ id: '1', name: 'Test User' })

      await new Promise((resolve) => setTimeout(resolve, 1100))

      const result2 = await userCache.get('1')
      expect(result2).toBeNull()
    })

    it('should handle conditional TTL', async () => {
      const userCache = cache.define({
        name: 'user',
        key: (userId: string) => userId,
        ttl: (data: { isPremium: boolean }) => (data.isPremium ? 3600 : 60),
      })

      await userCache.set('1', { id: '1', isPremium: true })
      await userCache.set('2', { id: '2', isPremium: false })

      const ttl1 = await redis.ttl('test-cache:user:1')
      const ttl2 = await redis.ttl('test-cache:user:2')

      expect(ttl1).toBeGreaterThan(3500)
      expect(ttl2).toBeLessThan(100)
    })

    it('should handle no TTL', async () => {
      const userCache = cache.define({
        name: 'user',
        key: (userId: string) => userId,
        ttl: false,
      })

      await userCache.set('1', { id: '1', name: 'Test User' })
      const ttl = await redis.ttl('test-cache:user:1')

      expect(ttl).toBe(-1)
    })
  })

  describe('invalidate', () => {
    it('should remove value from cache', async () => {
      const userCache = cache.define({
        name: 'user',
        key: (userId: string) => userId,
      })

      await userCache.set('1', { id: '1', name: 'Test User' })
      await userCache.invalidate('1')

      const result = await userCache.get('1')
      expect(result).toBeNull()
    })

    it('should handle cascading invalidation', async () => {
      const userCache = cache.define({
        name: 'user',
        key: (userId: string) => userId,
        invalidates: (userId: string) => [
          `test-cache:user-posts:${userId}`,
          `test-cache:user-profile:${userId}`,
        ],
      })

      const postsCache = cache.define({
        name: 'user-posts',
        key: (userId: string) => userId,
      })

      const profileCache = cache.define({
        name: 'user-profile',
        key: (userId: string) => userId,
      })

      await userCache.set('1', { id: '1', name: 'Test' })
      await postsCache.set('1', [{ id: 'p1' }])
      await profileCache.set('1', { bio: 'Test bio' })

      await userCache.invalidate('1')

      const posts = await postsCache.get('1')
      const profile = await profileCache.get('1')

      expect(posts).toBeNull()
      expect(profile).toBeNull()
    })
  })

  describe('getMany', () => {
    it('should get multiple values at once', async () => {
      const userCache = cache.define({
        name: 'user',
        key: (userId: string) => userId,
      })

      await userCache.set('1', { id: '1', name: 'User 1' })
      await userCache.set('2', { id: '2', name: 'User 2' })
      await userCache.set('3', { id: '3', name: 'User 3' })

      const results = await userCache.getMany([['1'], ['2'], ['3']])

      expect(results).toEqual([
        { id: '1', name: 'User 1' },
        { id: '2', name: 'User 2' },
        { id: '3', name: 'User 3' },
      ])
    })

    it('should return null for missing values', async () => {
      const userCache = cache.define({
        name: 'user',
        key: (userId: string) => userId,
      })

      await userCache.set('1', { id: '1', name: 'User 1' })

      const results = await userCache.getMany([['1'], ['2'], ['3']])

      expect(results).toEqual([
        { id: '1', name: 'User 1' },
        null,
        null,
      ])
    })
  })

  describe('setMany', () => {
    it('should set multiple values at once', async () => {
      const userCache = cache.define({
        name: 'user',
        key: (userId: string) => userId,
      })

      await userCache.setMany([
        { args: ['1'], value: { id: '1', name: 'User 1' } },
        { args: ['2'], value: { id: '2', name: 'User 2' } },
        { args: ['3'], value: { id: '3', name: 'User 3' } },
      ])

      const user1 = await userCache.get('1')
      const user2 = await userCache.get('2')
      const user3 = await userCache.get('3')

      expect(user1).toEqual({ id: '1', name: 'User 1' })
      expect(user2).toEqual({ id: '2', name: 'User 2' })
      expect(user3).toEqual({ id: '3', name: 'User 3' })
    })
  })

  describe('invalidateMany', () => {
    it('should invalidate multiple values at once', async () => {
      const userCache = cache.define({
        name: 'user',
        key: (userId: string) => userId,
      })

      await userCache.set('1', { id: '1', name: 'User 1' })
      await userCache.set('2', { id: '2', name: 'User 2' })
      await userCache.set('3', { id: '3', name: 'User 3' })

      await userCache.invalidateMany([['1'], ['2']])

      const user1 = await userCache.get('1')
      const user2 = await userCache.get('2')
      const user3 = await userCache.get('3')

      expect(user1).toBeNull()
      expect(user2).toBeNull()
      expect(user3).toEqual({ id: '3', name: 'User 3' })
    })
  })

  describe('warm', () => {
    it('should pre-populate cache with values', async () => {
      const userCache = cache.define({
        name: 'user',
        key: (userId: string) => userId,
      })

      await userCache.warm([
        { args: ['1'], value: { id: '1', name: 'User 1' } },
        { args: ['2'], value: { id: '2', name: 'User 2' } },
      ])

      const user1 = await userCache.get('1')
      const user2 = await userCache.get('2')

      expect(user1).toEqual({ id: '1', name: 'User 1' })
      expect(user2).toEqual({ id: '2', name: 'User 2' })
    })

    it('should fetch values when only args provided', async () => {
      const fetchFn = vi.fn(async (userId: string) => ({
        id: userId,
        name: `User ${userId}`,
      }))

      const userCache = cache.define({
        name: 'user',
        key: (userId: string) => userId,
        fetch: fetchFn,
      })

      await userCache.warm([['1'], ['2'], ['3']])

      expect(fetchFn).toHaveBeenCalledTimes(3)

      const user1 = await userCache.get('1')
      expect(user1).toEqual({ id: '1', name: 'User 1' })
      expect(fetchFn).toHaveBeenCalledTimes(3)
    })
  })

  describe('tags', () => {
    it('should track tags for cache entries', async () => {
      const userCache = cache.define({
        name: 'user',
        key: (userId: string) => userId,
        tags: (userId: string) => [`user:${userId}`, 'users'],
      })

      await userCache.set('1', { id: '1', name: 'User 1' })

      const userTags = await redis.smembers('test-cache:tag:user:1')
      const usersTag = await redis.smembers('test-cache:tag:users')

      expect(userTags).toContain('test-cache:user:1')
      expect(usersTag).toContain('test-cache:user:1')
    })
  })

  describe('deduplication', () => {
    it('should prevent stampede by deduplicating concurrent requests', async () => {
      const fetchFn = vi.fn(async (userId: string) => {
        await new Promise((resolve) => setTimeout(resolve, 100))
        return { id: userId, name: `User ${userId}` }
      })

      const userCache = cache.define({
        name: 'user',
        key: (userId: string) => userId,
        fetch: fetchFn,
        dedupe: true,
      })

      const [result1, result2, result3] = await Promise.all([
        userCache.get('1'),
        userCache.get('1'),
        userCache.get('1'),
      ])

      expect(fetchFn).toHaveBeenCalledTimes(1)
      expect(result1).toEqual({ id: '1', name: 'User 1' })
      expect(result2).toEqual({ id: '1', name: 'User 1' })
      expect(result3).toEqual({ id: '1', name: 'User 1' })
    })

    it('should allow disabling deduplication', async () => {
      const fetchFn = vi.fn(async (userId: string) => ({
        id: userId,
        name: `User ${userId}`,
      }))

      const userCache = cache.define({
        name: 'user',
        key: (userId: string) => userId,
        fetch: fetchFn,
        dedupe: false,
      })

      await Promise.all([
        userCache.get('1'),
        userCache.get('1'),
        userCache.get('1'),
      ])

      expect(fetchFn).toHaveBeenCalledTimes(3)
    })
  })

  describe('stale-while-revalidate', () => {
    it('should serve stale data immediately while fetching fresh data', async () => {
      vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'setInterval', 'setImmediate', 'clearTimeout', 'clearInterval', 'clearImmediate'] })
      const fetchFn = vi.fn(async (userId: string) => ({
        id: userId,
        name: `User ${userId}`,
        timestamp: Date.now(),
      }))

      const userCache = cache.define({
        name: 'user',
        key: (userId: string) => userId,
        fetch: fetchFn,
        ttl: 1,
        staleWhileRevalidate: 10,
      })

      // First fetch - cache miss
      const result1 = await userCache.get('1')
      expect(fetchFn).toHaveBeenCalledTimes(1)
      const firstTimestamp = result1?.timestamp

      // Advance time past TTL but within stale period
      vi.advanceTimersByTime(2000)

      // Should return stale data immediately
      const result2 = await userCache.get('1')
      expect(result2?.timestamp).toBe(firstTimestamp)

      // Background revalidation should have been triggered
      // Wait for microtasks and timers to complete
      await vi.runAllTimersAsync()
      expect(fetchFn).toHaveBeenCalledTimes(2)

      // Next fetch should have fresh data
      const result3 = await userCache.get('1')
      expect(result3?.timestamp).toBeGreaterThan(firstTimestamp!)

      vi.useRealTimers()
    })

    it('should not serve data past stale period', async () => {
      vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'setInterval', 'setImmediate', 'clearTimeout', 'clearInterval', 'clearImmediate'] })
      const fetchFn = vi.fn(async (userId: string) => ({
        id: userId,
        name: `User ${userId}`,
      }))

      const userCache = cache.define({
        name: 'user',
        key: (userId: string) => userId,
        fetch: fetchFn,
        ttl: 1,
        staleWhileRevalidate: 5,
      })

      await userCache.get('1')
      expect(fetchFn).toHaveBeenCalledTimes(1)

      // Advance past TTL + staleWhileRevalidate
      vi.advanceTimersByTime(7000)

      await userCache.get('1')
      // Should fetch fresh since past stale period
      expect(fetchFn).toHaveBeenCalledTimes(2)

      vi.useRealTimers()
    })
  })

  describe('sliding window TTL', () => {
    it(
      'should reset TTL on each access when sliding is enabled',
      async () => {
        const userCache = cache.define({
          name: 'user',
          key: (userId: string) => userId,
          ttl: {
            duration: 5,
            sliding: true,
          },
        })

        await userCache.set('1', { id: '1', name: 'User 1' })

        // Wait 3 seconds
        await new Promise((resolve) => setTimeout(resolve, 3000))

        // Access should reset TTL
        const result1 = await userCache.get('1')
        expect(result1).toEqual({ id: '1', name: 'User 1' })

        // Wait another 3 seconds (would expire if not sliding)
        await new Promise((resolve) => setTimeout(resolve, 3000))

        // Should still be cached because TTL was reset
        const result2 = await userCache.get('1')
        expect(result2).toEqual({ id: '1', name: 'User 1' })
      },
      15000
    )

    it(
      'should expire normally when sliding is not enabled',
      async () => {
        const userCache = cache.define({
          name: 'user',
          key: (userId: string) => userId,
          ttl: 2,
        })

        await userCache.set('1', { id: '1', name: 'User 1' })

        // Wait for expiry
        await new Promise((resolve) => setTimeout(resolve, 2100))

        const result = await userCache.get('1')
        expect(result).toBeNull()
      },
      10000
    )
  })

  describe('setMany event emission', () => {
    it('should emit set events for bulk operations', async () => {
      const onSet = vi.fn()
      cache.on('set', onSet)

      const userCache = cache.define({
        name: 'user',
        key: (userId: string) => userId,
      })

      await userCache.setMany([
        { args: ['1'], value: { id: '1', name: 'User 1' } },
        { args: ['2'], value: { id: '2', name: 'User 2' } },
        { args: ['3'], value: { id: '3', name: 'User 3' } },
      ])

      expect(onSet).toHaveBeenCalledTimes(3)
    })
  })

  describe('error event emission', () => {
    it('should emit error events when Redis fails', async () => {
      const onError = vi.fn()

      // Create a spy on redis.get that throws an error
      const getSpy = vi.spyOn(redis, 'get').mockRejectedValueOnce(
        new Error('Redis connection failed')
      )

      cache.on('error', onError)

      const userCache = cache.define({
        name: 'user',
        key: (userId: string) => userId,
        fetch: async (userId: string) => ({ id: userId, name: 'User' }),
      })

      // This should trigger the error since redis.get will fail
      const result = await userCache.get('1')

      // Should fallback to fetch
      expect(result).toEqual({ id: '1', name: 'User' })
      expect(onError).toHaveBeenCalled()
      expect(onError.mock.calls[0][0].error.message).toBe(
        'Redis connection failed'
      )

      // Restore the spy
      getSpy.mockRestore()
    })
  })

  describe('pattern tracking in setMany', () => {
    it('should track patterns correctly for bulk operations', async () => {
      const userCache = cache.define({
        name: 'user',
        key: (userId: string) => userId,
      })

      await userCache.setMany([
        { args: ['1'], value: { id: '1', name: 'User 1' } },
        { args: ['2'], value: { id: '2', name: 'User 2' } },
        { args: ['3'], value: { id: '3', name: 'User 3' } },
      ])

      // Invalidate by pattern
      await cache.invalidatePattern('user:*')

      // All should be invalidated
      const user1 = await userCache.get('1')
      const user2 = await userCache.get('2')
      const user3 = await userCache.get('3')

      expect(user1).toBeNull()
      expect(user2).toBeNull()
      expect(user3).toBeNull()
    })
  })

  describe('cascading invalidation pub/sub', () => {
    it('should publish invalidation events for cascaded keys', async () => {
      const userCache = cache.define({
        name: 'user',
        key: (userId: string) => userId,
        invalidates: (userId: string) => [
          `test-cache:user-posts:${userId}`,
          `test-cache:user-profile:${userId}`,
        ],
      })

      await userCache.set('1', { id: '1', name: 'User 1' })

      // Set up related caches
      await redis.set('test-cache:user-posts:1', 'posts-data')
      await redis.set('test-cache:user-profile:1', 'profile-data')

      // Invalidate user
      await userCache.invalidate('1')

      // Cascaded keys should also be deleted
      const posts = await redis.get('test-cache:user-posts:1')
      const profile = await redis.get('test-cache:user-profile:1')

      expect(posts).toBeNull()
      expect(profile).toBeNull()
    })
  })
})
