import { describe, it, expect, beforeEach } from 'vitest'
import { LocalCache } from '../local-cache.js'

describe('LocalCache', () => {
  let cache: LocalCache

  beforeEach(() => {
    cache = new LocalCache({ maxSize: 100 })
  })

  describe('get/set', () => {
    it('should store and retrieve values', () => {
      cache.set('key1', { data: 'value1' })
      const result = cache.get('key1')

      expect(result).toEqual({ data: 'value1' })
    })

    it('should return undefined for missing keys', () => {
      const result = cache.get('nonexistent')
      expect(result).toBeUndefined()
    })

    it('should handle TTL', async () => {
      cache.set('key1', { data: 'value1' }, 1)

      const result1 = cache.get('key1')
      expect(result1).toEqual({ data: 'value1' })

      await new Promise((resolve) => setTimeout(resolve, 1100))

      const result2 = cache.get('key1')
      expect(result2).toBeUndefined()
    })
  })

  describe('delete', () => {
    it('should delete a key', () => {
      cache.set('key1', { data: 'value1' })
      const deleted = cache.delete('key1')

      expect(deleted).toBe(true)
      expect(cache.get('key1')).toBeUndefined()
    })

    it('should return false when deleting non-existent key', () => {
      const deleted = cache.delete('nonexistent')
      expect(deleted).toBe(false)
    })
  })

  describe('deleteByPattern', () => {
    it('should delete keys matching pattern', () => {
      cache.set('user:1', { id: '1' })
      cache.set('user:2', { id: '2' })
      cache.set('post:1', { id: '1' })

      const count = cache.deleteByPattern('user:*')

      expect(count).toBe(2)
      expect(cache.get('user:1')).toBeUndefined()
      expect(cache.get('user:2')).toBeUndefined()
      expect(cache.get('post:1')).toEqual({ id: '1' })
    })

    it('should handle complex patterns', () => {
      cache.set('user:1:profile', { bio: 'test' })
      cache.set('user:1:posts', [])
      cache.set('user:2:profile', { bio: 'test2' })

      const count = cache.deleteByPattern('user:1:*')

      expect(count).toBe(2)
      expect(cache.get('user:1:profile')).toBeUndefined()
      expect(cache.get('user:1:posts')).toBeUndefined()
      expect(cache.get('user:2:profile')).toEqual({ bio: 'test2' })
    })
  })

  describe('deleteByTag', () => {
    it('should delete all keys in the array', () => {
      cache.set('key1', { data: 'value1' })
      cache.set('key2', { data: 'value2' })
      cache.set('key3', { data: 'value3' })

      const count = cache.deleteByTag('tag', ['key1', 'key2'])

      expect(count).toBe(2)
      expect(cache.get('key1')).toBeUndefined()
      expect(cache.get('key2')).toBeUndefined()
      expect(cache.get('key3')).toEqual({ data: 'value3' })
    })
  })

  describe('clear', () => {
    it('should clear all entries', () => {
      cache.set('key1', { data: 'value1' })
      cache.set('key2', { data: 'value2' })

      cache.clear()

      expect(cache.size).toBe(0)
      expect(cache.get('key1')).toBeUndefined()
      expect(cache.get('key2')).toBeUndefined()
    })
  })

  describe('size', () => {
    it('should track cache size', () => {
      expect(cache.size).toBe(0)

      cache.set('key1', { data: 'value1' })
      expect(cache.size).toBe(1)

      cache.set('key2', { data: 'value2' })
      expect(cache.size).toBe(2)

      cache.delete('key1')
      expect(cache.size).toBe(1)
    })

    it('should respect max size', () => {
      const smallCache = new LocalCache({ maxSize: 2 })

      smallCache.set('key1', { data: 'value1' })
      smallCache.set('key2', { data: 'value2' })
      smallCache.set('key3', { data: 'value3' })

      expect(smallCache.size).toBe(2)
      expect(smallCache.get('key1')).toBeUndefined()
      expect(smallCache.get('key2')).toEqual({ data: 'value2' })
      expect(smallCache.get('key3')).toEqual({ data: 'value3' })
    })
  })
})
