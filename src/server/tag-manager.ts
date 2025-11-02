import type Redis from 'ioredis'

/**
 * Manages tag indexing for cache invalidation.
 * Maintains Redis sets mapping tags to cache keys.
 */
export class TagManager {
  constructor(
    private redis: Redis,
    private prefix: string
  ) {}

  /**
   * Add tags for a cache key
   */
  async addTags(key: string, tags: string[]): Promise<void> {
    if (tags.length === 0) return

    const pipeline = this.redis.pipeline()

    for (const tag of tags) {
      const tagKey = `${this.prefix}:tag:${tag}`
      pipeline.sadd(tagKey, key)
    }

    await pipeline.exec()
  }

  /**
   * Get all keys for a tag
   */
  async getKeysByTag(tag: string): Promise<string[]> {
    const tagKey = `${this.prefix}:tag:${tag}`
    return this.redis.smembers(tagKey)
  }

  /**
   * Remove tags for a key
   */
  async removeTags(key: string, tags: string[]): Promise<void> {
    if (tags.length === 0) return

    const pipeline = this.redis.pipeline()

    for (const tag of tags) {
      const tagKey = `${this.prefix}:tag:${tag}`
      pipeline.srem(tagKey, key)
    }

    await pipeline.exec()
  }

  /**
   * Delete tag index
   */
  async deleteTag(tag: string): Promise<void> {
    const tagKey = `${this.prefix}:tag:${tag}`
    await this.redis.del(tagKey)
  }

  /**
   * Delete multiple tag indexes
   */
  async deleteTags(tags: string[]): Promise<void> {
    if (tags.length === 0) return

    const tagKeys = tags.map((tag) => `${this.prefix}:tag:${tag}`)
    await this.redis.del(...tagKeys)
  }
}
