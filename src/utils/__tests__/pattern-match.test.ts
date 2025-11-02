import { describe, it, expect } from 'vitest'
import { patternToRegex, matchPattern, filterByPattern } from '../pattern-match.js'

describe('pattern-match', () => {
  describe('patternToRegex', () => {
    it('should convert simple wildcard pattern to regex', () => {
      const regex = patternToRegex('user:*')
      expect(regex.test('user:123')).toBe(true)
      expect(regex.test('post:123')).toBe(false)
    })

    it('should match exact strings without wildcards', () => {
      const regex = patternToRegex('user:123')
      expect(regex.test('user:123')).toBe(true)
      expect(regex.test('user:124')).toBe(false)
    })

    it('should handle multiple wildcards', () => {
      const regex = patternToRegex('*:*:profile')
      expect(regex.test('user:123:profile')).toBe(true)
      expect(regex.test('post:456:profile')).toBe(true)
      expect(regex.test('user:123:posts')).toBe(false)
    })

    it('should escape special regex characters', () => {
      const regex = patternToRegex('user.123')
      expect(regex.test('user.123')).toBe(true)
      expect(regex.test('userX123')).toBe(false)
    })
  })

  describe('matchPattern', () => {
    it('should match keys against pattern', () => {
      expect(matchPattern('user:*', 'user:123')).toBe(true)
      expect(matchPattern('user:*', 'post:123')).toBe(false)
    })

    it('should match complex patterns', () => {
      expect(matchPattern('user:*:profile', 'user:123:profile')).toBe(true)
      expect(matchPattern('user:*:profile', 'user:123:posts')).toBe(false)
    })
  })

  describe('filterByPattern', () => {
    it('should filter keys by pattern', () => {
      const keys = [
        'user:1',
        'user:2',
        'post:1',
        'user:3',
      ]

      const filtered = filterByPattern('user:*', keys)

      expect(filtered).toEqual(['user:1', 'user:2', 'user:3'])
    })

    it('should filter with complex patterns', () => {
      const keys = [
        'user:1:profile',
        'user:1:posts',
        'user:2:profile',
        'post:1',
      ]

      const filtered = filterByPattern('user:*:profile', keys)

      expect(filtered).toEqual(['user:1:profile', 'user:2:profile'])
    })

    it('should return empty array when no matches', () => {
      const keys = ['post:1', 'post:2', 'post:3']
      const filtered = filterByPattern('user:*', keys)

      expect(filtered).toEqual([])
    })

    it('should match all keys with wildcard only pattern', () => {
      const keys = ['user:1', 'post:2', 'comment:3']
      const filtered = filterByPattern('*', keys)

      expect(filtered).toEqual(keys)
    })
  })
})
