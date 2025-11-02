import type Redis from 'ioredis'

/**
 * Manages pattern-based cache invalidation.
 * Maintains Redis sets for pattern -> keys mapping.
 */
export class PatternMatcher {
  constructor(
    private redis: Redis,
    private prefix: string
  ) {}

  /**
   * Track a key under a pattern category
   * For key "prefix:name:123", track under pattern "name"
   */
  async trackKey(key: string): Promise<void> {
    // Extract cache name from full key format "prefix:name:key"
    const parts = key.split(':')
    if (parts.length < 3) return

    const pattern = parts[1] // e.g., "user" from "test-cache:user:123"
    const patternKey = `${this.prefix}:pattern:${pattern}`

    await this.redis.sadd(patternKey, key)
  }

  /**
   * Get all keys matching a pattern
   * Pattern should be in format "name:*" (without prefix)
   */
  async getKeysByPattern(pattern: string): Promise<string[]> {
    // If pattern is simple like "user:*", extract base pattern "user"
    const base = pattern.replace(/:\*.*$/, '')
    const patternKey = `${this.prefix}:pattern:${base}`

    const keys = await this.redis.smembers(patternKey)

    // If pattern has wildcards, filter results
    // Need to prepend prefix to pattern for matching full Redis keys
    if (pattern.includes('*')) {
      const fullPattern = `${this.prefix}:${pattern}`
      const regex = this.patternToRegex(fullPattern)
      return keys.filter((key) => regex.test(key))
    }

    return keys
  }

  /**
   * Remove a key from pattern tracking
   */
  async removeKey(key: string): Promise<void> {
    const parts = key.split(':')
    if (parts.length < 3) return

    const pattern = parts[1]
    const patternKey = `${this.prefix}:pattern:${pattern}`

    await this.redis.srem(patternKey, key)
  }

  /**
   * Delete pattern index
   */
  async deletePattern(pattern: string): Promise<void> {
    const base = pattern.replace(/:\*.*$/, '')
    const patternKey = `${this.prefix}:pattern:${base}`
    await this.redis.del(patternKey)
  }

  private patternToRegex(pattern: string): RegExp {
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    const regex = escaped.replace(/\*/g, '.*')
    return new RegExp(`^${regex}$`)
  }
}
