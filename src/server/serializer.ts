import superjson from 'superjson'

export interface Serializer {
  serialize: <T>(data: T) => string
  deserialize: <T>(data: string) => T
}

export const superjsonSerializer: Serializer = {
  serialize: <T>(data: T): string => {
    return superjson.stringify(data)
  },
  deserialize: <T>(data: string): T => {
    return superjson.parse(data) as T
  },
}

export const jsonSerializer: Serializer = {
  serialize: <T>(data: T): string => {
    return JSON.stringify(data)
  },
  deserialize: <T>(data: string): T => {
    return JSON.parse(data) as T
  },
}

export function createSerializer(
  type: 'json' | 'superjson' | Serializer
): Serializer {
  if (typeof type === 'object') {
    return type
  }
  return type === 'json' ? jsonSerializer : superjsonSerializer
}
