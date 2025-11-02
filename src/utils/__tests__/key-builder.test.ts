import { describe, it, expect } from 'vitest'
import {
  buildCacheKey,
  parseCacheKey,
  validateCacheKey,
} from '../key-builder.js'

describe('key-builder', () => {
  describe('buildCacheKey', () => {
    it('should build cache key with prefix, name, and key', () => {
      const result = buildCacheKey('myapp', 'user', '123')
      expect(result).toBe('myapp:user:123')
    })

    it('should handle complex keys', () => {
      const result = buildCacheKey('myapp', 'user-posts', '123:published')
      expect(result).toBe('myapp:user-posts:123:published')
    })
  })

  describe('parseCacheKey', () => {
    it('should parse cache key into components', () => {
      const result = parseCacheKey('myapp:user:123')

      expect(result).toEqual({
        prefix: 'myapp',
        name: 'user',
        key: '123',
      })
    })

    it('should handle complex keys', () => {
      const result = parseCacheKey('myapp:user-posts:123:published')

      expect(result).toEqual({
        prefix: 'myapp',
        name: 'user-posts',
        key: '123:published',
      })
    })

    it('should return null for invalid keys', () => {
      const result = parseCacheKey('invalid')
      expect(result).toBeNull()
    })
  })

  describe('validateCacheKey', () => {
    it('should validate valid keys', () => {
      const result = validateCacheKey('user-123_test')
      expect(result.valid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('should reject empty keys', () => {
      const result = validateCacheKey('')
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Key cannot be empty')
    })

    it('should reject keys with spaces', () => {
      const result = validateCacheKey('user 123')
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Key cannot contain spaces')
    })

    it('should reject keys that are too long', () => {
      const longKey = 'a'.repeat(201)
      const result = validateCacheKey(longKey)
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Key too long (max 200 characters)')
    })

    it('should reject keys with invalid characters', () => {
      const result = validateCacheKey('user@123')
      expect(result.valid).toBe(false)
      expect(result.error).toBe(
        'Key can only contain alphanumeric, colon, underscore, hyphen'
      )
    })

    it('should allow colons', () => {
      const result = validateCacheKey('user:123:profile')
      expect(result.valid).toBe(true)
    })

    it('should allow underscores', () => {
      const result = validateCacheKey('user_123')
      expect(result.valid).toBe(true)
    })

    it('should allow hyphens', () => {
      const result = validateCacheKey('user-123')
      expect(result.valid).toBe(true)
    })
  })
})
