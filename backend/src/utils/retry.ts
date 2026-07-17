export type RetryOptions = {
  maxAttempts?: number;
  delayMs?: number;
  backoffFactor?: number;
  shouldRetry?: (error: any) => boolean;
};

const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 3,
  delayMs: 1000,
  backoffFactor: 2,
  shouldRetry: () => true, // Retry everything by default
};

const MAX_BACKOFF_CAP_MS = 60000; // Cap backoff at 60 seconds

/**
 * Wait helper.
 */
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Extract the retryDelay (in seconds) from a Gemini 429 error body, if present.
 * Gemini includes a `RetryInfo` detail with the suggested wait time.
 */
function extractGeminiRetryDelayMs(error: any): number | null {
  try {
    const raw = typeof error?.message === 'string' ? error.message : '';
    const parsed = JSON.parse(raw);
    const details: any[] = parsed?.error?.details ?? [];
    const retryInfo = details.find((d: any) => d['@type']?.includes('RetryInfo'));
    if (retryInfo?.retryDelay) {
      const seconds = parseFloat(String(retryInfo.retryDelay).replace('s', ''));
      if (!isNaN(seconds) && seconds > 0) {
        return Math.ceil(seconds * 1000);
      }
    }
  } catch {
    // ignore parse errors
  }
  return null;
}

/**
 * Retry an async operation with exponential backoff and full jitter.
 * Respects Gemini's Retry-After hint on 429 quota errors.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let attempts = 0;
  let currentDelay = opts.delayMs;

  while (true) {
    attempts++;
    try {
      return await fn();
    } catch (error: any) {
      if (attempts >= opts.maxAttempts || !opts.shouldRetry(error)) {
        throw error;
      }

      // Check if Gemini suggested a retry delay
      const geminiDelay = extractGeminiRetryDelayMs(error);
      
      let waitMs = currentDelay;
      if (geminiDelay !== null) {
        waitMs = geminiDelay;
      } else {
        // Implement full jitter: a random delay between 0 and currentDelay
        // and cap it at MAX_BACKOFF_CAP_MS.
        const cappedDelay = Math.min(currentDelay, MAX_BACKOFF_CAP_MS);
        waitMs = Math.floor(Math.random() * cappedDelay);
      }

      console.warn(
        `[Retry] Attempt ${attempts} failed. Retrying in ${waitMs}ms (attempts remaining: ${
          opts.maxAttempts - attempts
        }). Error: ${error?.message || error}`
      );

      await sleep(waitMs);
      
      // Grow delay for the next backoff iteration
      currentDelay *= opts.backoffFactor;
    }
  }
}
