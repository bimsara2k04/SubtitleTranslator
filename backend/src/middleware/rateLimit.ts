import type { Request, Response, NextFunction } from 'express';

type WindowState = {
  count: number;
  resetAt: number;
};

/**
 * Minimal fixed-window per-IP rate limiter (no external dependencies).
 *
 * Intended to protect expensive endpoints (/upload, /translate) from abuse.
 * Note: this is per-process; use a shared store (Redis) if scaling horizontally.
 */
export function createRateLimit(options: { windowMs: number; max: number }) {
  const { windowMs, max } = options;
  const buckets = new Map<string, WindowState>();

  // Periodically prune stale buckets to avoid unbounded memory growth.
  const pruneInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, state] of buckets) {
      if (state.resetAt <= now) {
        buckets.delete(key);
      }
    }
  }, Math.max(windowMs, 60_000));
  pruneInterval.unref?.();

  return function rateLimit(req: Request, res: Response, next: NextFunction): void {
    const key = req.ip || 'unknown';
    const now = Date.now();

    let state = buckets.get(key);
    if (!state || state.resetAt <= now) {
      state = { count: 0, resetAt: now + windowMs };
      buckets.set(key, state);
    }

    state.count += 1;

    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - state.count)));

    if (state.count > max) {
      res.status(429).json({
        error: {
          code: 'RATE_LIMITED',
          message: `Too many requests. Please try again in a few minutes.`,
        },
      });
      return;
    }

    next();
  };
}
