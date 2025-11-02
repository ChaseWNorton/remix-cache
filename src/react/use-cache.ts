import { useEffect } from 'react'
import { useRevalidator } from '@remix-run/react'
import { useCacheContext, type InvalidationEvent } from './context.js'
import { matchPattern } from '../utils/pattern-match.js'

export interface UseCacheOptions {
  tags?: string[]
  keys?: string[]
  patterns?: string[]
  debounce?: number
}

function matchesFilter(
  event: InvalidationEvent,
  options?: UseCacheOptions
): boolean {
  // No options or no filters means revalidate on all invalidations
  if (!options) return true

  const hasFilters =
    (options.keys && options.keys.length > 0) ||
    (options.tags && options.tags.length > 0) ||
    (options.patterns && options.patterns.length > 0)

  // If no filters specified, revalidate on all invalidations
  if (!hasFilters) return true

  // Check keys
  if (options.keys && options.keys.length > 0 && event.key) {
    if (options.keys.includes(event.key)) {
      return true
    }
  }

  // Check tags (support both event.tag and event.tags array)
  if (options.tags && options.tags.length > 0) {
    if (event.tag && options.tags.includes(event.tag)) {
      return true
    }
    if (
      event.tags &&
      event.tags.some((tag) => options.tags!.includes(tag))
    ) {
      return true
    }
  }

  // Check patterns
  if (options.patterns && options.patterns.length > 0 && event.pattern) {
    if (
      options.patterns.some((pattern) => matchPattern(pattern, event.pattern!))
    ) {
      return true
    }
  }

  return false
}

export function useCache(options?: UseCacheOptions) {
  const { invalidations } = useCacheContext()
  const revalidator = useRevalidator()

  useEffect(() => {
    if (invalidations.length === 0) return

    const latestInvalidation = invalidations[invalidations.length - 1]

    // Check if we should revalidate
    const shouldRevalidate = matchesFilter(latestInvalidation, options)

    if (shouldRevalidate) {
      const debounceMs = options?.debounce ?? 100

      const timeout = setTimeout(() => {
        revalidator.revalidate()
      }, debounceMs)

      return () => clearTimeout(timeout)
    }
  }, [invalidations, revalidator, options])
}
