import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { useCache } from '../use-cache.js'
import { CacheProvider } from '../provider.js'
import type { InvalidationEvent } from '../context.js'

// Mock @remix-run/react
vi.mock('@remix-run/react', () => ({
  useRevalidator: vi.fn(),
}))

// Mock remix-utils
vi.mock('remix-utils/sse/react', () => ({
  useEventSource: vi.fn(),
}))

import { useRevalidator } from '@remix-run/react'
import { useEventSource } from 'remix-utils/sse/react'

describe('useCache', () => {
  let mockRevalidate: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    mockRevalidate = vi.fn()
    vi.mocked(useRevalidator).mockReturnValue({
      revalidate: mockRevalidate,
      state: 'idle',
    } as any)
    vi.mocked(useEventSource).mockReturnValue(null)
  })

  it('should not revalidate when no invalidations', async () => {
    function TestComponent() {
      useCache()
      return <div>Test</div>
    }

    render(
      <CacheProvider>
        <TestComponent />
      </CacheProvider>
    )

    await waitFor(() => {
      expect(mockRevalidate).not.toHaveBeenCalled()
    })
  })

  it('should revalidate when any invalidation occurs with no filter', async () => {
    const event = JSON.stringify({
      key: 'test:user:123',
      timestamp: Date.now(),
    })

    vi.mocked(useEventSource)
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(event)

    function TestComponent() {
      useCache()
      return <div>Test</div>
    }

    const { rerender } = render(
      <CacheProvider>
        <TestComponent />
      </CacheProvider>
    )

    rerender(
      <CacheProvider>
        <TestComponent />
      </CacheProvider>
    )

    await waitFor(
      () => {
        expect(mockRevalidate).toHaveBeenCalled()
      },
      { timeout: 500 }
    )
  })

  it('should revalidate when matching key is invalidated', async () => {
    const event = JSON.stringify({
      key: 'test:user:123',
      timestamp: Date.now(),
    })

    vi.mocked(useEventSource)
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(event)

    function TestComponent() {
      useCache({ keys: ['test:user:123'] })
      return <div>Test</div>
    }

    const { rerender } = render(
      <CacheProvider>
        <TestComponent />
      </CacheProvider>
    )

    rerender(
      <CacheProvider>
        <TestComponent />
      </CacheProvider>
    )

    await waitFor(
      () => {
        expect(mockRevalidate).toHaveBeenCalled()
      },
      { timeout: 500 }
    )
  })

  it('should not revalidate when non-matching key is invalidated', async () => {
    const event = JSON.stringify({
      key: 'test:user:999',
      timestamp: Date.now(),
    })

    vi.mocked(useEventSource)
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(event)

    function TestComponent() {
      useCache({ keys: ['test:user:123'] })
      return <div>Test</div>
    }

    const { rerender } = render(
      <CacheProvider>
        <TestComponent />
      </CacheProvider>
    )

    rerender(
      <CacheProvider>
        <TestComponent />
      </CacheProvider>
    )

    // Wait a bit to ensure it doesn't revalidate
    await new Promise((resolve) => setTimeout(resolve, 200))

    expect(mockRevalidate).not.toHaveBeenCalled()
  })

  it('should revalidate when matching tag is invalidated', async () => {
    const event = JSON.stringify({
      tag: 'user:123',
      keys: ['test:user:123'],
      timestamp: Date.now(),
    })

    vi.mocked(useEventSource)
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(event)

    function TestComponent() {
      useCache({ tags: ['user:123'] })
      return <div>Test</div>
    }

    const { rerender } = render(
      <CacheProvider>
        <TestComponent />
      </CacheProvider>
    )

    rerender(
      <CacheProvider>
        <TestComponent />
      </CacheProvider>
    )

    await waitFor(
      () => {
        expect(mockRevalidate).toHaveBeenCalled()
      },
      { timeout: 500 }
    )
  })

  it('should not revalidate when non-matching tag is invalidated', async () => {
    const event = JSON.stringify({
      tag: 'user:999',
      keys: ['test:user:999'],
      timestamp: Date.now(),
    })

    vi.mocked(useEventSource)
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(event)

    function TestComponent() {
      useCache({ tags: ['user:123'] })
      return <div>Test</div>
    }

    const { rerender } = render(
      <CacheProvider>
        <TestComponent />
      </CacheProvider>
    )

    rerender(
      <CacheProvider>
        <TestComponent />
      </CacheProvider>
    )

    await new Promise((resolve) => setTimeout(resolve, 200))

    expect(mockRevalidate).not.toHaveBeenCalled()
  })

  it('should support multiple tags filter', async () => {
    const event = JSON.stringify({
      tag: 'posts',
      timestamp: Date.now(),
    })

    vi.mocked(useEventSource)
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(event)

    function TestComponent() {
      useCache({ tags: ['user:123', 'posts', 'comments'] })
      return <div>Test</div>
    }

    const { rerender } = render(
      <CacheProvider>
        <TestComponent />
      </CacheProvider>
    )

    rerender(
      <CacheProvider>
        <TestComponent />
      </CacheProvider>
    )

    await waitFor(
      () => {
        expect(mockRevalidate).toHaveBeenCalled()
      },
      { timeout: 500 }
    )
  })

  it('should support pattern matching', async () => {
    const event = JSON.stringify({
      pattern: 'user:*',
      keys: ['test:user:1', 'test:user:2'],
      timestamp: Date.now(),
    })

    vi.mocked(useEventSource)
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(event)

    function TestComponent() {
      useCache({ patterns: ['user:*'] })
      return <div>Test</div>
    }

    const { rerender } = render(
      <CacheProvider>
        <TestComponent />
      </CacheProvider>
    )

    rerender(
      <CacheProvider>
        <TestComponent />
      </CacheProvider>
    )

    await waitFor(
      () => {
        expect(mockRevalidate).toHaveBeenCalled()
      },
      { timeout: 500 }
    )
  })

  it('should debounce revalidation calls', async () => {
    const event1 = JSON.stringify({ key: 'test:user:1', timestamp: 1000 })
    const event2 = JSON.stringify({ key: 'test:user:2', timestamp: 2000 })
    const event3 = JSON.stringify({ key: 'test:user:3', timestamp: 3000 })

    vi.mocked(useEventSource)
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(event1)
      .mockReturnValueOnce(event2)
      .mockReturnValueOnce(event3)

    function TestComponent() {
      useCache({ debounce: 200 })
      return <div>Test</div>
    }

    const { rerender } = render(
      <CacheProvider>
        <TestComponent />
      </CacheProvider>
    )

    // Trigger 3 events in quick succession
    rerender(
      <CacheProvider>
        <TestComponent />
      </CacheProvider>
    )
    rerender(
      <CacheProvider>
        <TestComponent />
      </CacheProvider>
    )
    rerender(
      <CacheProvider>
        <TestComponent />
      </CacheProvider>
    )

    // Should not have called immediately
    expect(mockRevalidate).not.toHaveBeenCalled()

    // Wait for debounce period
    await new Promise((resolve) => setTimeout(resolve, 250))

    // Should have called only once due to debounce
    expect(mockRevalidate).toHaveBeenCalledTimes(1)
  })

  it('should use default debounce of 100ms when not specified', async () => {
    const event = JSON.stringify({
      key: 'test:user:123',
      timestamp: Date.now(),
    })

    vi.mocked(useEventSource)
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(event)

    function TestComponent() {
      useCache()
      return <div>Test</div>
    }

    const { rerender } = render(
      <CacheProvider>
        <TestComponent />
      </CacheProvider>
    )

    rerender(
      <CacheProvider>
        <TestComponent />
      </CacheProvider>
    )

    // Should not have called immediately
    expect(mockRevalidate).not.toHaveBeenCalled()

    // Wait for default debounce (100ms)
    await new Promise((resolve) => setTimeout(resolve, 150))

    expect(mockRevalidate).toHaveBeenCalled()
  })

  it('should support combined filters (keys + tags)', async () => {
    const event = JSON.stringify({
      tag: 'user:123',
      keys: ['test:user:123'],
      timestamp: Date.now(),
    })

    vi.mocked(useEventSource)
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(event)

    function TestComponent() {
      useCache({
        keys: ['test:post:456'],
        tags: ['user:123'],
      })
      return <div>Test</div>
    }

    const { rerender } = render(
      <CacheProvider>
        <TestComponent />
      </CacheProvider>
    )

    rerender(
      <CacheProvider>
        <TestComponent />
      </CacheProvider>
    )

    // Should revalidate because tag matches (OR logic)
    await waitFor(
      () => {
        expect(mockRevalidate).toHaveBeenCalled()
      },
      { timeout: 500 }
    )
  })

  it('should cleanup timeout on unmount', async () => {
    const event = JSON.stringify({
      key: 'test:user:123',
      timestamp: Date.now(),
    })

    vi.mocked(useEventSource)
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(event)

    function TestComponent() {
      useCache({ debounce: 1000 })
      return <div>Test</div>
    }

    const { rerender, unmount } = render(
      <CacheProvider>
        <TestComponent />
      </CacheProvider>
    )

    rerender(
      <CacheProvider>
        <TestComponent />
      </CacheProvider>
    )

    // Unmount before debounce completes
    unmount()

    // Wait past debounce period
    await new Promise((resolve) => setTimeout(resolve, 1100))

    // Should not have called since component was unmounted
    expect(mockRevalidate).not.toHaveBeenCalled()
  })

  it('should handle empty invalidation arrays gracefully', async () => {
    function TestComponent() {
      useCache({ tags: [], keys: [], patterns: [] })
      return <div>Test</div>
    }

    render(
      <CacheProvider>
        <TestComponent />
      </CacheProvider>
    )

    // Should render without errors
    await waitFor(() => {
      expect(mockRevalidate).not.toHaveBeenCalled()
    })
  })

  it('should handle tag invalidation with event.tags array', async () => {
    const event = JSON.stringify({
      tags: ['user:123', 'posts'],
      timestamp: Date.now(),
    })

    vi.mocked(useEventSource)
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(event)

    function TestComponent() {
      useCache({ tags: ['user:123'] })
      return <div>Test</div>
    }

    const { rerender } = render(
      <CacheProvider>
        <TestComponent />
      </CacheProvider>
    )

    rerender(
      <CacheProvider>
        <TestComponent />
      </CacheProvider>
    )

    await waitFor(
      () => {
        expect(mockRevalidate).toHaveBeenCalled()
      },
      { timeout: 500 }
    )
  })
})
