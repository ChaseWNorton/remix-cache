import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createCache } from '../cache.js'
import type { Cache } from '../../types/cache.js'
import Redis from 'ioredis'

describe('Cache', () => {
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
    await redis.flushdb()
    await redis.quit()
  })

  describe('createCache', () => {
    it('should create a cache instance', () => {
      expect(cache).toBeDefined()
      expect(typeof cache.define).toBe('function')
    })

    it('should accept Redis URL string', () => {
      const urlCache = createCache({
        redis: 'redis://localhost:6379',
        prefix: 'test',
      })
      expect(urlCache).toBeDefined()
    })

    it('should auto-detect mode', () => {
      const autoCache = createCache({
        redis,
        mode: 'auto',
      })
      expect(autoCache).toBeDefined()
    })
  })

  describe('define', () => {
    it('should create a cache definition', () => {
      const userCache = cache.define({
        name: 'user',
        key: (userId: string) => userId,
        fetch: async (userId: string) => ({ id: userId, name: 'Test User' }),
      })

      expect(userCache).toBeDefined()
      expect(typeof userCache.get).toBe('function')
      expect(typeof userCache.set).toBe('function')
      expect(typeof userCache.invalidate).toBe('function')
    })
  })

  describe('event emitters', () => {
    it('should emit hit events', async () => {
      const onHit = vi.fn()
      cache.on('hit', onHit)

      const userCache = cache.define({
        name: 'user',
        key: (userId: string) => userId,
        fetch: async (userId: string) => ({ id: userId, name: 'Test' }),
      })

      await userCache.get('1')
      await userCache.get('1')

      expect(onHit).toHaveBeenCalled()
    })

    it('should emit miss events', async () => {
      const onMiss = vi.fn()
      cache.on('miss', onMiss)

      const userCache = cache.define({
        name: 'user',
        key: (userId: string) => userId,
        fetch: async (userId: string) => ({ id: userId, name: 'Test' }),
      })

      // Use a different key to avoid collision with other tests
      await userCache.get('999')

      expect(onMiss).toHaveBeenCalled()
    })

    it('should emit set events', async () => {
      const onSet = vi.fn()
      cache.on('set', onSet)

      const userCache = cache.define({
        name: 'user',
        key: (userId: string) => userId,
      })

      await userCache.set('1', { id: '1', name: 'Test' })

      expect(onSet).toHaveBeenCalled()
    })

    it('should emit invalidate events', async () => {
      const onInvalidate = vi.fn()
      cache.on('invalidate', onInvalidate)

      const userCache = cache.define({
        name: 'user',
        key: (userId: string) => userId,
      })

      await userCache.set('1', { id: '1', name: 'Test' })
      await userCache.invalidate('1')

      expect(onInvalidate).toHaveBeenCalled()
    })
  })

  describe('invalidateTag', () => {
    it('should invalidate all caches with a tag', async () => {
      const userCache = cache.define({
        name: 'user',
        key: (userId: string) => userId,
        tags: (userId: string) => [`user:${userId}`],
      })

      const userPostsCache = cache.define({
        name: 'user-posts',
        key: (userId: string) => userId,
        tags: (userId: string) => [`user:${userId}`, 'posts'],
      })

      await userCache.set('1', { id: '1', name: 'Test' })
      await userPostsCache.set('1', [{ id: 'p1', title: 'Post 1' }])

      await cache.invalidateTag('user:1')

      const user = await userCache.get('1')
      const posts = await userPostsCache.get('1')

      expect(user).toBeNull()
      expect(posts).toBeNull()
    })
  })

  describe('invalidatePattern', () => {
    it('should invalidate all caches matching a pattern', async () => {
      const userCache = cache.define({
        name: 'user',
        key: (userId: string) => userId,
      })

      await userCache.set('1', { id: '1', name: 'User 1' })
      await userCache.set('2', { id: '2', name: 'User 2' })
      await userCache.set('3', { id: '3', name: 'User 3' })

      await cache.invalidatePattern('user:*')

      const user1 = await userCache.get('1')
      const user2 = await userCache.get('2')
      const user3 = await userCache.get('3')

      expect(user1).toBeNull()
      expect(user2).toBeNull()
      expect(user3).toBeNull()
    })
  })

  describe('invalidateMany', () => {
    it('should invalidate multiple keys at once', async () => {
      const userCache = cache.define({
        name: 'user',
        key: (userId: string) => userId,
      })

      await userCache.set('1', { id: '1', name: 'User 1' })
      await userCache.set('2', { id: '2', name: 'User 2' })

      await cache.invalidateMany([
        'test-cache:user:1',
        'test-cache:user:2',
      ])

      const user1 = await userCache.get('1')
      const user2 = await userCache.get('2')

      expect(user1).toBeNull()
      expect(user2).toBeNull()
    })
  })
})
