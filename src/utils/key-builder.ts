/**
 * Utility functions for building cache keys
 */

/**
 * Build a full cache key with prefix and name
 */
export function buildCacheKey(
  prefix: string,
  name: string,
  key: string
): string {
  return `${prefix}:${name}:${key}`
}

/**
 * Parse a cache key into its components
 */
export function parseCacheKey(
  fullKey: string
): { prefix: string; name: string; key: string } | null {
  const parts = fullKey.split(':')
  if (parts.length < 3) return null

  return {
    prefix: parts[0] || '',
    name: parts[1] || '',
    key: parts.slice(2).join(':'),
  }
}

/**
 * Validate cache key format
 */
export function validateCacheKey(key: string): {
  valid: boolean
  error?: string
} {
  if (!key || key.trim().length === 0) {
    return { valid: false, error: 'Key cannot be empty' }
  }

  if (key.length > 200) {
    return { valid: false, error: 'Key too long (max 200 characters)' }
  }

  if (/\s/.test(key)) {
    return { valid: false, error: 'Key cannot contain spaces' }
  }

  if (!/^[a-zA-Z0-9:_-]+$/.test(key)) {
    return {
      valid: false,
      error: 'Key can only contain alphanumeric, colon, underscore, hyphen',
    }
  }

  return { valid: true }
}
