/**
 * Package exports verification test
 * Ensures all public APIs are properly exported
 */
import { describe, it, expect } from 'vitest'

describe('Package Exports', () => {
  describe('Server exports', () => {
    it('should export createCache from main entry', async () => {
      const { createCache } = await import('../index.js')
      expect(createCache).toBeDefined()
      expect(typeof createCache).toBe('function')
    })

    it('should export createSSEHandler from server', async () => {
      const { createSSEHandler } = await import('../server/sse-handler.js')
      expect(createSSEHandler).toBeDefined()
      expect(typeof createSSEHandler).toBe('function')
    })

    it('should export Cache type', async () => {
      const types = await import('../types/cache.js')
      expect(types).toBeDefined()
    })
  })

  describe('React exports', () => {
    it('should export CacheProvider from react', async () => {
      const { CacheProvider } = await import('../react.js')
      expect(CacheProvider).toBeDefined()
    })

    it('should export useCache from react', async () => {
      const { useCache } = await import('../react.js')
      expect(useCache).toBeDefined()
      expect(typeof useCache).toBe('function')
    })

    it('should export useCacheContext from react', async () => {
      const { useCacheContext } = await import('../react.js')
      expect(useCacheContext).toBeDefined()
      expect(typeof useCacheContext).toBe('function')
    })
  })

  describe('Type exports', () => {
    it('should export all cache types', async () => {
      const cacheTypes = await import('../types/cache.js')
      expect(cacheTypes).toBeDefined()
    })

    it('should export all event types', async () => {
      const eventTypes = await import('../types/events.js')
      expect(eventTypes).toBeDefined()
    })

    it('should export all config types', async () => {
      const configTypes = await import('../types/config.js')
      expect(configTypes).toBeDefined()
    })

    it('should export all react types', async () => {
      const reactTypes = await import('../types/react.js')
      expect(reactTypes).toBeDefined()
    })
  })
})
