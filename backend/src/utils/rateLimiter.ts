/**
 * A global rate limiter / throttler to serialize requests and maintain spacing.
 * Ensures we respect API limits (e.g., maximum 15 Requests Per Minute).
 */
export class RateLimiter {
  private queue: (() => void)[] = [];
  private processing = false;
  private lastRequestCompletedAt = 0;
  private minIntervalMs: number;

  constructor(minIntervalMs = 4000) {
    this.minIntervalMs = minIntervalMs;
  }

  /**
   * Acquire a slot in the queue and wait until rate limit conditions are met.
   */
  async acquire(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
      this.processQueue();
    });
  }

  private async processQueue() {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;
    const nextResolve = this.queue.shift();

    if (nextResolve) {
      // Calculate delay needed to respect minIntervalMs since last completion
      const now = Date.now();
      const elapsed = now - this.lastRequestCompletedAt;
      const delayNeeded = Math.max(0, this.minIntervalMs - elapsed);

      if (delayNeeded > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayNeeded));
      }

      // Execute task
      nextResolve();
    }
  }

  /**
   * Notify the rate limiter that a request has finished, updating the timestamp
   * and allowing the next queued request to process after spacing.
   */
  release(): void {
    this.lastRequestCompletedAt = Date.now();
    this.processing = false;
    // Process next item in queue
    this.processQueue();
  }
}

// Global singleton instance for all background workers
export const globalRateLimiter = new RateLimiter(4500); // 4.5s spacing = ~13 RPM max (safe under 15 RPM)
