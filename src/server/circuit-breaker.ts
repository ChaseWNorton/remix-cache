/**
 * Circuit breaker prevents overwhelming a failing Redis instance
 * by temporarily failing fast after a threshold of errors.
 */
export class CircuitBreaker {
  private state: 'closed' | 'open' | 'half-open' = 'closed'
  private failures = 0
  private nextAttempt = 0
  private halfOpenSuccesses = 0
  private onError?: (error: Error) => void

  constructor(
    private threshold = 5,
    private timeout = 30000,
    private halfOpenRequests = 3
  ) {}

  setErrorHandler(handler: (error: Error) => void): void {
    this.onError = handler
  }

  async execute<T>(
    fn: () => Promise<T>,
    fallback: () => Promise<T>
  ): Promise<T> {
    // Circuit is open, use fallback
    if (this.state === 'open') {
      if (Date.now() < this.nextAttempt) {
        return fallback()
      }
      // Time to test if service recovered
      this.state = 'half-open'
      this.halfOpenSuccesses = 0
    }

    try {
      const result = await fn()
      this.onSuccess()
      return result
    } catch (error) {
      this.onFailure()
      if (this.onError && error instanceof Error) {
        this.onError(error)
      }
      return fallback()
    }
  }

  private onSuccess(): void {
    if (this.state === 'half-open') {
      this.halfOpenSuccesses++
      if (this.halfOpenSuccesses >= this.halfOpenRequests) {
        // Service recovered, close circuit
        this.state = 'closed'
        this.failures = 0
      }
    } else {
      this.failures = 0
    }
  }

  private onFailure(): void {
    this.failures++
    if (this.failures >= this.threshold) {
      // Open circuit
      this.state = 'open'
      this.nextAttempt = Date.now() + this.timeout
    }
  }

  getState(): 'closed' | 'open' | 'half-open' {
    return this.state
  }

  reset(): void {
    this.state = 'closed'
    this.failures = 0
    this.nextAttempt = 0
    this.halfOpenSuccesses = 0
  }
}
