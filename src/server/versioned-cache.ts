import type Redis from 'ioredis'
import type { Serializer } from './serializer.js'

/**
 * Versioned cache for serverless environments.
 * Uses version numbers instead of pub/sub for invalidation.
 */
export class VersionedCache {
  constructor(
    private redis: Redis,
    private serializer: Serializer,
    private prefix: string
  ) {}

  async get<T>(key: string): Promise<T | null> {
    // Get current version
    const versionKey = `${this.prefix}:version:${key}`
    const version = (await this.redis.get(versionKey)) || '0'

    // Try to get versioned cache
    const versionedKey = `${this.prefix}:${key}:v${version}`
    const cached = await this.redis.get(versionedKey)

    if (!cached) {
      return null
    }

    return this.serializer.deserialize<T>(cached)
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    // Get current version
    const versionKey = `${this.prefix}:version:${key}`
    let version = await this.redis.get(versionKey)

    // Initialize version if it doesn't exist
    if (!version) {
      version = '0'
      await this.redis.set(versionKey, version)
      await this.redis.expire(versionKey, 86400) // 24 hours
    }

    // Set versioned cache
    const versionedKey = `${this.prefix}:${key}:v${version}`
    const serialized = this.serializer.serialize(value)

    if (ttl) {
      await this.redis.setex(versionedKey, ttl, serialized)
    } else {
      await this.redis.set(versionedKey, serialized)
    }
  }

  async invalidate(key: string): Promise<void> {
    // Increment version - old cache becomes orphaned
    const versionKey = `${this.prefix}:version:${key}`
    await this.redis.incr(versionKey)

    // Set TTL on version key to prevent infinite growth
    await this.redis.expire(versionKey, 86400) // 24 hours
  }

  async invalidateMany(keys: string[]): Promise<void> {
    const pipeline = this.redis.pipeline()

    for (const key of keys) {
      const versionKey = `${this.prefix}:version:${key}`
      pipeline.incr(versionKey)
      pipeline.expire(versionKey, 86400)
    }

    await pipeline.exec()
  }
}
