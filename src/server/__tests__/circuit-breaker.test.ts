import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CircuitBreaker } from '../circuit-breaker.js'

describe('CircuitBreaker', () => {
  let circuitBreaker: CircuitBreaker

  beforeEach(() => {
    circuitBreaker = new CircuitBreaker(3, 1000, 2)
  })

  it('should start in closed state', () => {
    expect(circuitBreaker.getState()).toBe('closed')
  })

  it('should execute function successfully when closed', async () => {
    const fn = vi.fn(async () => 'success')
    const fallback = vi.fn(async () => 'fallback')

    const result = await circuitBreaker.execute(fn, fallback)

    expect(result).toBe('success')
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fallback).not.toHaveBeenCalled()
  })

  it('should open circuit after threshold failures', async () => {
    const fn = vi.fn(async () => {
      throw new Error('failure')
    })
    const fallback = vi.fn(async () => 'fallback')

    await circuitBreaker.execute(fn, fallback)
    await circuitBreaker.execute(fn, fallback)
    await circuitBreaker.execute(fn, fallback)

    expect(circuitBreaker.getState()).toBe('open')
  })

  it('should use fallback when circuit is open', async () => {
    const fn = vi.fn(async () => {
      throw new Error('failure')
    })
    const fallback = vi.fn(async () => 'fallback')

    await circuitBreaker.execute(fn, fallback)
    await circuitBreaker.execute(fn, fallback)
    await circuitBreaker.execute(fn, fallback)

    expect(circuitBreaker.getState()).toBe('open')

    const result = await circuitBreaker.execute(fn, fallback)

    expect(result).toBe('fallback')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('should transition to half-open after timeout', async () => {
    const fn = vi.fn(async () => {
      throw new Error('failure')
    })
    const fallback = vi.fn(async () => 'fallback')

    await circuitBreaker.execute(fn, fallback)
    await circuitBreaker.execute(fn, fallback)
    await circuitBreaker.execute(fn, fallback)

    expect(circuitBreaker.getState()).toBe('open')

    await new Promise((resolve) => setTimeout(resolve, 1100))

    const successFn = vi.fn(async () => 'success')

    await circuitBreaker.execute(successFn, fallback)

    expect(circuitBreaker.getState()).toBe('half-open')
  })

  it('should close circuit after successful half-open requests', async () => {
    const fn = vi.fn(async () => {
      throw new Error('failure')
    })
    const fallback = vi.fn(async () => 'fallback')

    await circuitBreaker.execute(fn, fallback)
    await circuitBreaker.execute(fn, fallback)
    await circuitBreaker.execute(fn, fallback)

    expect(circuitBreaker.getState()).toBe('open')

    await new Promise((resolve) => setTimeout(resolve, 1100))

    const successFn = vi.fn(async () => 'success')

    await circuitBreaker.execute(successFn, fallback)
    await circuitBreaker.execute(successFn, fallback)

    expect(circuitBreaker.getState()).toBe('closed')
  })

  it('should reset circuit', () => {
    const cb = new CircuitBreaker(1, 1000, 1)

    cb.reset()

    expect(cb.getState()).toBe('closed')
  })
})
