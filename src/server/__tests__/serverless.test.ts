import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createCache } from '../cache.js'
import type { Cache } from '../../types/cache.js'
import Redis from 'ioredis'

describe('Serverless Mode', () => {
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
      prefix: 'test-serverless',
      mode: 'serverless',
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

  describe('tag support in serverless mode', () => {
    it('should track and invalidate by tags in serverless mode', async () => {
      const userCache = cache.define({
        name: 'user',
        key: (userId: string) => userId,
        tags: (userId: string) => [`user:${userId}`, 'users'],
      })

      await userCache.set('1', { id: '1', name: 'User 1' })
      await userCache.set('2', { id: '2', name: 'User 2' })

      // Verify both are cached
      const user1Before = await userCache.get('1')
      const user2Before = await userCache.get('2')
      expect(user1Before).toEqual({ id: '1', name: 'User 1' })
      expect(user2Before).toEqual({ id: '2', name: 'User 2' })

      // Invalidate by tag
      await cache.invalidateTag('users')

      // Both should be invalidated
      const user1After = await userCache.get('1')
      const user2After = await userCache.get('2')
      expect(user1After).toBeNull()
      expect(user2After).toBeNull()
    })

    it('should invalidate specific user by tag in serverless mode', async () => {
      const userCache = cache.define({
        name: 'user',
        key: (userId: string) => userId,
        tags: (userId: string) => [`user:${userId}`],
      })

      await userCache.set('1', { id: '1', name: 'User 1' })
      await userCache.set('2', { id: '2', name: 'User 2' })

      // Invalidate only user:1
      await cache.invalidateTag('user:1')

      const user1 = await userCache.get('1')
      const user2 = await userCache.get('2')

      expect(user1).toBeNull()
      expect(user2).toEqual({ id: '2', name: 'User 2' })
    })
  })

  describe('pattern support in serverless mode', () => {
    it('should track and invalidate by pattern in serverless mode', async () => {
      const userCache = cache.define({
        name: 'user',
        key: (userId: string) => userId,
      })

      await userCache.set('1', { id: '1', name: 'User 1' })
      await userCache.set('2', { id: '2', name: 'User 2' })
      await userCache.set('3', { id: '3', name: 'User 3' })

      // Verify all are cached
      expect(await userCache.get('1')).toEqual({ id: '1', name: 'User 1' })
      expect(await userCache.get('2')).toEqual({ id: '2', name: 'User 2' })
      expect(await userCache.get('3')).toEqual({ id: '3', name: 'User 3' })

      // Invalidate by pattern
      await cache.invalidatePattern('user:*')

      // All should be invalidated
      expect(await userCache.get('1')).toBeNull()
      expect(await userCache.get('2')).toBeNull()
      expect(await userCache.get('3')).toBeNull()
    })
  })

  describe('versioned cache behavior', () => {
    it('should use versioned keys for invalidation', async () => {
      const userCache = cache.define({
        name: 'user',
        key: (userId: string) => userId,
      })

      await userCache.set('1', { id: '1', name: 'User 1' })

      // Get version key
      const versionKey = 'test-serverless:version:test-serverless:user:1'
      const version1 = await redis.get(versionKey)
      expect(version1).toBe('0')

      // Invalidate
      await userCache.invalidate('1')

      // Version should be incremented
      const version2 = await redis.get(versionKey)
      expect(version2).toBe('1')

      // Getting should return null (old version)
      const result = await userCache.get('1')
      expect(result).toBeNull()
    })
  })
})
