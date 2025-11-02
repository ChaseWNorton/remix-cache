import { describe, it, expect } from 'vitest'
import {
  superjsonSerializer,
  jsonSerializer,
  createSerializer,
} from '../serializer.js'

describe('Serializer', () => {
  describe('superjsonSerializer', () => {
    it('should serialize and deserialize plain objects', () => {
      const data = { id: '1', name: 'Test' }
      const serialized = superjsonSerializer.serialize(data)
      const deserialized = superjsonSerializer.deserialize(serialized)

      expect(deserialized).toEqual(data)
    })

    it('should handle Date objects', () => {
      const data = { createdAt: new Date('2025-01-01T00:00:00Z') }
      const serialized = superjsonSerializer.serialize(data)
      const deserialized = superjsonSerializer.deserialize<typeof data>(
        serialized
      )

      expect(deserialized.createdAt).toBeInstanceOf(Date)
      expect(deserialized.createdAt.toISOString()).toBe(
        '2025-01-01T00:00:00.000Z'
      )
    })

    it('should handle Map objects', () => {
      const data = new Map([
        ['key1', 'value1'],
        ['key2', 'value2'],
      ])
      const serialized = superjsonSerializer.serialize(data)
      const deserialized = superjsonSerializer.deserialize<typeof data>(
        serialized
      )

      expect(deserialized).toBeInstanceOf(Map)
      expect(deserialized.get('key1')).toBe('value1')
      expect(deserialized.get('key2')).toBe('value2')
    })

    it('should handle Set objects', () => {
      const data = new Set([1, 2, 3])
      const serialized = superjsonSerializer.serialize(data)
      const deserialized = superjsonSerializer.deserialize<typeof data>(
        serialized
      )

      expect(deserialized).toBeInstanceOf(Set)
      expect(deserialized.has(1)).toBe(true)
      expect(deserialized.has(2)).toBe(true)
      expect(deserialized.has(3)).toBe(true)
    })

    it('should handle undefined values', () => {
      const data = { name: 'Test', optional: undefined }
      const serialized = superjsonSerializer.serialize(data)
      const deserialized = superjsonSerializer.deserialize<typeof data>(
        serialized
      )

      expect(deserialized).toEqual(data)
      expect('optional' in deserialized).toBe(true)
    })

    it('should handle BigInt', () => {
      const data = { bigNumber: BigInt(9007199254740991) }
      const serialized = superjsonSerializer.serialize(data)
      const deserialized = superjsonSerializer.deserialize<typeof data>(
        serialized
      )

      expect(typeof deserialized.bigNumber).toBe('bigint')
      expect(deserialized.bigNumber).toBe(BigInt(9007199254740991))
    })

    it('should handle RegExp', () => {
      const data = { pattern: /test/gi }
      const serialized = superjsonSerializer.serialize(data)
      const deserialized = superjsonSerializer.deserialize<typeof data>(
        serialized
      )

      expect(deserialized.pattern).toBeInstanceOf(RegExp)
      expect(deserialized.pattern.source).toBe('test')
      expect(deserialized.pattern.flags).toBe('gi')
    })
  })

  describe('jsonSerializer', () => {
    it('should serialize and deserialize plain objects', () => {
      const data = { id: '1', name: 'Test' }
      const serialized = jsonSerializer.serialize(data)
      const deserialized = jsonSerializer.deserialize(serialized)

      expect(deserialized).toEqual(data)
    })

    it('should convert Date to string', () => {
      const data = { createdAt: new Date('2025-01-01T00:00:00Z') }
      const serialized = jsonSerializer.serialize(data)
      const deserialized = jsonSerializer.deserialize<{ createdAt: string }>(
        serialized
      )

      expect(typeof deserialized.createdAt).toBe('string')
      expect(deserialized.createdAt).toBe('2025-01-01T00:00:00.000Z')
    })

    it('should strip undefined values', () => {
      const data = { name: 'Test', optional: undefined }
      const serialized = jsonSerializer.serialize(data)
      const deserialized = jsonSerializer.deserialize<{ name: string }>(
        serialized
      )

      expect('optional' in deserialized).toBe(false)
    })
  })

  describe('createSerializer', () => {
    it('should create json serializer', () => {
      const serializer = createSerializer('json')
      expect(serializer).toBe(jsonSerializer)
    })

    it('should create superjson serializer', () => {
      const serializer = createSerializer('superjson')
      expect(serializer).toBe(superjsonSerializer)
    })

    it('should accept custom serializer', () => {
      const customSerializer = {
        serialize: (data: unknown) => JSON.stringify(data),
        deserialize: <T>(data: string): T => JSON.parse(data) as T,
      }

      const serializer = createSerializer(customSerializer)
      expect(serializer).toBe(customSerializer)
    })
  })
})
