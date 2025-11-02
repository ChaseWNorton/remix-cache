import type Redis from 'ioredis'

export interface InvalidationEvent {
  key?: string
  tag?: string
  pattern?: string
  keys?: string[]
  timestamp: number
}

export class PubSubHandler {
  private channels = {
    INVALIDATE_KEY: 'remix-cache:invalidate:key',
    INVALIDATE_TAG: 'remix-cache:invalidate:tag',
    INVALIDATE_PATTERN: 'remix-cache:invalidate:pattern',
  }

  constructor(
    private subscriber: Redis,
    private publisher: Redis
  ) {}

  async subscribe(
    handler: (channel: string, event: InvalidationEvent) => void
  ): Promise<void> {
    await this.subscriber.subscribe(
      this.channels.INVALIDATE_KEY,
      this.channels.INVALIDATE_TAG,
      this.channels.INVALIDATE_PATTERN
    )

    this.subscriber.on('message', (channel, message) => {
      const event = JSON.parse(message) as InvalidationEvent
      handler(channel, event)
    })
  }

  async publishKeyInvalidation(key: string): Promise<void> {
    await this.publisher.publish(
      this.channels.INVALIDATE_KEY,
      JSON.stringify({ key, timestamp: Date.now() })
    )
  }

  async publishTagInvalidation(tag: string, keys: string[]): Promise<void> {
    await this.publisher.publish(
      this.channels.INVALIDATE_TAG,
      JSON.stringify({ tag, keys, timestamp: Date.now() })
    )
  }

  async publishPatternInvalidation(
    pattern: string,
    keys: string[]
  ): Promise<void> {
    await this.publisher.publish(
      this.channels.INVALIDATE_PATTERN,
      JSON.stringify({ pattern, keys, timestamp: Date.now() })
    )
  }

  async unsubscribe(): Promise<void> {
    await this.subscriber.unsubscribe()
  }
}
