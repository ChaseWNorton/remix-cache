import { describe, it, expect, vi } from 'vitest'
import { Deduplicator } from '../deduplicator.js'

describe('Deduplicator', () => {
  it('should deduplicate concurrent requests for same key', async () => {
    const deduplicator = new Deduplicator()
    const fn = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100))
      return 'result'
    })

    const [result1, result2, result3] = await Promise.all([
      deduplicator.run('key1', fn),
      deduplicator.run('key1', fn),
      deduplicator.run('key1', fn),
    ])

    expect(fn).toHaveBeenCalledTimes(1)
    expect(result1).toBe('result')
    expect(result2).toBe('result')
    expect(result3).toBe('result')
  })

  it('should not deduplicate requests for different keys', async () => {
    const deduplicator = new Deduplicator()
    const fn = vi.fn(async (key: string) => `result-${key}`)

    const [result1, result2, result3] = await Promise.all([
      deduplicator.run('key1', () => fn('key1')),
      deduplicator.run('key2', () => fn('key2')),
      deduplicator.run('key3', () => fn('key3')),
    ])

    expect(fn).toHaveBeenCalledTimes(3)
    expect(result1).toBe('result-key1')
    expect(result2).toBe('result-key2')
    expect(result3).toBe('result-key3')
  })

  it('should clean up pending requests after completion', async () => {
    const deduplicator = new Deduplicator()
    const fn = vi.fn(async () => 'result')

    await deduplicator.run('key1', fn)

    expect(deduplicator.size).toBe(0)
  })

  it('should handle errors properly', async () => {
    const deduplicator = new Deduplicator()
    const fn = vi.fn(async () => {
      throw new Error('Test error')
    })

    await expect(deduplicator.run('key1', fn)).rejects.toThrow('Test error')

    expect(deduplicator.size).toBe(0)
  })

  it('should clear all pending requests', async () => {
    const deduplicator = new Deduplicator()
    const fn = vi.fn(
      async () => new Promise((resolve) => setTimeout(() => resolve('result'), 1000))
    )

    deduplicator.run('key1', fn)
    deduplicator.run('key2', fn)

    expect(deduplicator.size).toBe(2)

    deduplicator.clear()

    expect(deduplicator.size).toBe(0)
  })
})
