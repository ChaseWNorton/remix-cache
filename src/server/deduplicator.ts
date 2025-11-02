/**
 * Deduplicator prevents cache stampede by ensuring only one request
 * fetches data for a given key at a time. Other concurrent requests
 * wait for the first request to complete.
 */
export class Deduplicator {
  private pending = new Map<string, Promise<any>>()

  async run<T>(key: string, fn: () => Promise<T>): Promise<T> {
    // If already fetching this key, return existing promise
    const existing = this.pending.get(key)
    if (existing) {
      return existing as Promise<T>
    }

    // Start new fetch
    const promise = fn().finally(() => {
      // Clean up when done
      this.pending.delete(key)
    })

    this.pending.set(key, promise)
    return promise
  }

  /**
   * Clear all pending requests
   */
  clear(): void {
    this.pending.clear()
  }

  /**
   * Get number of pending requests
   */
  get size(): number {
    return this.pending.size
  }
}
