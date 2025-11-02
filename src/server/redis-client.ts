import Redis, { type RedisOptions } from 'ioredis'

export type RedisConfig = string | Redis | RedisOptions

export function createRedisClient(config: RedisConfig): Redis {
  if (typeof config === 'string') {
    return new Redis(config)
  } else if (config instanceof Redis) {
    return config
  } else {
    return new Redis(config)
  }
}

export function createRedisClients(config: RedisConfig): {
  client: Redis
  subscriber: Redis
  publisher: Redis
} {
  const client = createRedisClient(config)

  // For pub/sub, we need separate connections
  let subscriber: Redis
  let publisher: Redis

  if (typeof config === 'string') {
    subscriber = new Redis(config)
    publisher = new Redis(config)
  } else if (config instanceof Redis) {
    // If user provided a client, duplicate it for pub/sub
    subscriber = client.duplicate()
    publisher = client.duplicate()
  } else {
    subscriber = new Redis(config)
    publisher = new Redis(config)
  }

  return { client, subscriber, publisher }
}
