/**
 * Convert glob pattern to RegExp
 */
export function patternToRegex(pattern: string): RegExp {
  // Escape special regex characters except *
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&')

  // Replace * with .*
  const regex = escaped.replace(/\*/g, '.*')

  return new RegExp(`^${regex}$`)
}

/**
 * Check if a key matches a pattern
 */
export function matchPattern(pattern: string, key: string): boolean {
  const regex = patternToRegex(pattern)
  return regex.test(key)
}

/**
 * Filter keys by pattern
 */
export function filterByPattern(pattern: string, keys: string[]): string[] {
  const regex = patternToRegex(pattern)
  return keys.filter((key) => regex.test(key))
}
