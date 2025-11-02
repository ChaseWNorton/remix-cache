import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { CacheProvider } from '../provider.js'
import { useCacheContext } from '../context.js'

// Mock useEventSource from remix-utils
vi.mock('remix-utils/sse/react', () => ({
  useEventSource: vi.fn(),
}))

import { useEventSource } from 'remix-utils/sse/react'

describe('CacheProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render children', () => {
    vi.mocked(useEventSource).mockReturnValue(null)

    render(
      <CacheProvider>
        <div>Test Child</div>
      </CacheProvider>
    )

    expect(screen.getByText('Test Child')).toBeInTheDocument()
  })

  it('should provide cache context to children', () => {
    vi.mocked(useEventSource).mockReturnValue(null)

    function TestComponent() {
      const context = useCacheContext()
      return <div>Invalidations: {context.invalidations.length}</div>
    }

    render(
      <CacheProvider>
        <TestComponent />
      </CacheProvider>
    )

    expect(screen.getByText('Invalidations: 0')).toBeInTheDocument()
  })

  it('should use default endpoint /api/cache-events', () => {
    vi.mocked(useEventSource).mockReturnValue(null)

    render(
      <CacheProvider>
        <div>Test</div>
      </CacheProvider>
    )

    expect(useEventSource).toHaveBeenCalledWith(
      '/api/cache-events',
      expect.objectContaining({ event: 'invalidate' })
    )
  })

  it('should use custom endpoint when provided', () => {
    vi.mocked(useEventSource).mockReturnValue(null)

    render(
      <CacheProvider endpoint="/custom/events">
        <div>Test</div>
      </CacheProvider>
    )

    expect(useEventSource).toHaveBeenCalledWith(
      '/custom/events',
      expect.objectContaining({ event: 'invalidate' })
    )
  })

  it('should add invalidation events to context when received', async () => {
    const mockEvent = JSON.stringify({
      key: 'test:user:123',
      timestamp: Date.now(),
    })

    // First return null, then return the event
    vi.mocked(useEventSource)
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(mockEvent)

    function TestComponent() {
      const context = useCacheContext()
      return (
        <div>
          <div>Count: {context.invalidations.length}</div>
          {context.invalidations.map((inv, i) => (
            <div key={i}>Key: {inv.key}</div>
          ))}
        </div>
      )
    }

    const { rerender } = render(
      <CacheProvider>
        <TestComponent />
      </CacheProvider>
    )

    expect(screen.getByText('Count: 0')).toBeInTheDocument()

    // Trigger rerender with new event
    rerender(
      <CacheProvider>
        <TestComponent />
      </CacheProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('Count: 1')).toBeInTheDocument()
    })

    expect(screen.getByText('Key: test:user:123')).toBeInTheDocument()
  })

  it('should parse JSON event data correctly', async () => {
    const mockEvent = JSON.stringify({
      tag: 'user:123',
      keys: ['test:user:123', 'test:user:456'],
      timestamp: 1234567890,
    })

    vi.mocked(useEventSource)
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(mockEvent)

    function TestComponent() {
      const context = useCacheContext()
      return (
        <div>
          {context.invalidations.map((inv, i) => (
            <div key={i}>
              <div>Tag: {inv.tag}</div>
              <div>Keys: {inv.keys?.length}</div>
              <div>Timestamp: {inv.timestamp}</div>
            </div>
          ))}
        </div>
      )
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

    await waitFor(() => {
      expect(screen.getByText('Tag: user:123')).toBeInTheDocument()
    })

    expect(screen.getByText('Keys: 2')).toBeInTheDocument()
    expect(screen.getByText('Timestamp: 1234567890')).toBeInTheDocument()
  })

  it('should accumulate multiple invalidation events', async () => {
    const event1 = JSON.stringify({ key: 'test:user:1', timestamp: 1000 })
    const event2 = JSON.stringify({ key: 'test:user:2', timestamp: 2000 })
    const event3 = JSON.stringify({ tag: 'users', timestamp: 3000 })

    vi.mocked(useEventSource)
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(event1)
      .mockReturnValueOnce(event2)
      .mockReturnValueOnce(event3)

    function TestComponent() {
      const context = useCacheContext()
      return <div>Count: {context.invalidations.length}</div>
    }

    const { rerender } = render(
      <CacheProvider>
        <TestComponent />
      </CacheProvider>
    )

    // Trigger all rerenders to simulate events coming in
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

    // Should accumulate all 3 events
    await waitFor(() => {
      expect(screen.getByText('Count: 3')).toBeInTheDocument()
    })
  })

  it('should handle pattern invalidation events', async () => {
    const mockEvent = JSON.stringify({
      pattern: 'user:*',
      keys: ['test:user:1', 'test:user:2'],
      timestamp: Date.now(),
    })

    vi.mocked(useEventSource)
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(mockEvent)

    function TestComponent() {
      const context = useCacheContext()
      return (
        <div>
          {context.invalidations.map((inv, i) => (
            <div key={i}>Pattern: {inv.pattern}</div>
          ))}
        </div>
      )
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

    await waitFor(() => {
      expect(screen.getByText('Pattern: user:*')).toBeInTheDocument()
    })
  })

  it('should throw error when useCacheContext is used outside provider', () => {
    function TestComponent() {
      useCacheContext()
      return <div>Test</div>
    }

    // Suppress console.error for this test
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {})

    expect(() => render(<TestComponent />)).toThrow(
      'useCacheContext must be used within CacheProvider'
    )

    consoleError.mockRestore()
  })

  it('should handle malformed JSON gracefully', async () => {
    const malformedEvent = 'not valid json'

    vi.mocked(useEventSource)
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(malformedEvent)

    function TestComponent() {
      const context = useCacheContext()
      return <div>Count: {context.invalidations.length}</div>
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

    // Should still be 0 since malformed event should be ignored
    await waitFor(() => {
      expect(screen.getByText('Count: 0')).toBeInTheDocument()
    })
  })
})
