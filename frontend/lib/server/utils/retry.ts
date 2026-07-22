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
  shouldRetry: () => true,
};

const MAX_BACKOFF_CAP_MS = 60000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

      const geminiDelay = extractGeminiRetryDelayMs(error);
      
      let waitMs = currentDelay;
      if (geminiDelay !== null) {
        waitMs = geminiDelay;
      } else {
        const cappedDelay = Math.min(currentDelay, MAX_BACKOFF_CAP_MS);
        waitMs = Math.floor(Math.random() * cappedDelay);
      }

      console.warn(
        `[Retry] Attempt ${attempts} failed. Retrying in ${waitMs}ms (attempts remaining: ${
          opts.maxAttempts - attempts
        }). Error: ${error?.message || error}`
      );

      await sleep(waitMs);
      currentDelay *= opts.backoffFactor;
    }
  }
}
