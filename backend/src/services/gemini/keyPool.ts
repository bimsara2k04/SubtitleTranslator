import dotenv from 'dotenv';

dotenv.config();

/** Minimum spacing between two calls issued to the same key (~15 RPM per key). */
const MIN_REQUEST_INTERVAL_MS = 4000;

/** Wait longer than this before we assume the daily quota is gone for today. */
const DAILY_LOCK_ABORT_MS = 10 * 60 * 1000;

export interface KeyEntry {
  key: string;
  projectLabel: string;
  cooldownUntil: Date | null;
  /** Per-key min spacing between requests — set after every call. */
  throttleUntil: Date | null;
  dailyCallsUsed: number;
  dailyCallsLimit: number;
  dailyCallsReset: Date;
  lastError: string | null;
  /** Number of in-flight translations currently using this key. */
  inFlight: number;
}

/**
 * Compute the next midnight in America/Los_Angeles, handling DST correctly.
 * A fixed UTC-8 offset is wrong for ~half the year (PDT is UTC-7).
 */
function getNextMidnightPT(): Date {
  const timeZone = 'America/Los_Angeles';
  const now = new Date();

  // Scan candidate UTC instants over the next few days; LA midnight is at a
  // fixed UTC hour that shifts by one when DST begins/ends, so scan until found.
  for (let dayOffset = 1; dayOffset <= 4; dayOffset++) {
    for (let utcHour = 0; utcHour < 24; utcHour++) {
      const candidate = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + dayOffset, utcHour, 0, 0, 0)
      );
      if (isMidnightInZone(candidate, timeZone)) {
        return candidate;
      }
    }
  }

  // Fallback: assume UTC-8 (only reached if Intl is unavailable).
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 8, 0, 0, 0)
  );
}

function isMidnightInZone(date: Date, timeZone: string): boolean {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  const hour = get('hour');
  const minute = get('minute');
  const second = get('second');
  // "24:00:00" is how Intl reports midnight in some environments.
  return hour === '24' || (hour === '00' && minute === '00' && second === '00');
}

export class QuotaExhaustedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QuotaExhaustedError';
  }
}

class KeyPoolManager {
  private keys: KeyEntry[] = [];

  constructor() {
    this.initializePool();
  }

  public initializePool() {
    const rawKeys = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || '';
    // Split by comma or semicolon, trim spaces, filter empty
    const keyStrings = rawKeys
      .split(/[,;]/)
      .map((k) => k.trim())
      .filter((k) => k.length > 0);

    const nextReset = getNextMidnightPT();

    this.keys = keyStrings.map((key, idx) => {
      let masked = key;
      if (key.length > 8) {
        masked = `${key.slice(0, 6)}...${key.slice(-4)}`;
      }
      const label = `project-${idx + 1}`;
      console.log(`[KeyPool] Loaded API key: ${label} (${masked})`);
      return {
        key,
        projectLabel: label,
        cooldownUntil: null,
        throttleUntil: null,
        dailyCallsUsed: 0,
        dailyCallsLimit: 20, // Default for free-tier
        dailyCallsReset: nextReset,
        lastError: null,
        inFlight: 0,
      };
    });

    if (this.keys.length === 0) {
      console.warn('[KeyPool] WARNING: No Gemini API keys loaded. Key pool is empty.');
    }
  }

  public getKeysStatus() {
    const now = new Date();
    this.checkAndResetDailyQuotas();
    return this.keys.map((k) => {
      const remaining = Math.max(0, k.dailyCallsLimit - k.dailyCallsUsed);
      const onCooldown = k.cooldownUntil !== null && k.cooldownUntil > now;
      return {
        label: k.projectLabel,
        dailyCallsUsed: k.dailyCallsUsed,
        dailyCallsLimit: k.dailyCallsLimit,
        dailyCallsRemaining: remaining,
        onCooldown,
        cooldownExpiresAt: onCooldown ? k.cooldownUntil : null,
      };
    });
  }

  public getKeyCount(): number {
    return this.keys.length;
  }

  private checkAndResetDailyQuotas() {
    const now = new Date();
    const nextReset = getNextMidnightPT();
    for (const keyEntry of this.keys) {
      if (now >= keyEntry.dailyCallsReset) {
        console.log(`[KeyPool] Daily quota reset for ${keyEntry.projectLabel}`);
        keyEntry.dailyCallsUsed = 0;
        keyEntry.dailyCallsReset = nextReset;
        keyEntry.cooldownUntil = null;
        keyEntry.throttleUntil = null;
        keyEntry.lastError = null;
      }
    }
  }

  /** Earliest instant (ms epoch) at which a key may be used again. */
  private availableAtMs(key: KeyEntry): number {
    const cooldown = key.cooldownUntil ? key.cooldownUntil.getTime() : 0;
    const throttle = key.throttleUntil ? key.throttleUntil.getTime() : 0;
    return Math.max(cooldown, throttle);
  }

  /** Lower score = preferred key (least used, least in-flight). */
  private keyScore(key: KeyEntry): number {
    return key.dailyCallsUsed * 100 + key.inFlight * 10 + key.dailyCallsUsed;
  }

  /**
   * Reserve a key for one translation request. Awaits until a key is both not
   * in-flight and past its cooldown/throttle, so concurrent workers never
   * hammer the same key at the same time.
   *
   * Throws `QuotaExhaustedError` if every key is locked until the daily reset.
   */
  public async acquireKey(): Promise<KeyEntry> {
    while (true) {
      this.checkAndResetDailyQuotas();
      const now = Date.now();

      const candidates = this.keys.filter(
        (k) => k.inFlight === 0 && this.availableAtMs(k) <= now
      );

      if (candidates.length > 0) {
        const selected = candidates.reduce((prev, curr) =>
          this.keyScore(curr) < this.keyScore(prev) ? curr : prev
        );
        selected.inFlight += 1;
        return selected;
      }

      // No key ready — wait for the earliest available, but abort if the pool
      // is locked until the daily reset (unrecoverable for the rest of today).
      if (this.keys.length === 0) {
        throw new Error(
          'Key pool is empty. Please define GEMINI_API_KEYS or GEMINI_API_KEY in your env.'
        );
      }

      const earliest = [...this.keys].sort(
        (a, b) => this.availableAtMs(a) - this.availableAtMs(b)
      )[0] as KeyEntry;

      const waitMs = this.availableAtMs(earliest) - now;
      if (waitMs > DAILY_LOCK_ABORT_MS) {
        throw new QuotaExhaustedError(
          `All Gemini API keys daily quota exhausted. Soonest reset is for ${earliest.projectLabel} at ${earliest.cooldownUntil?.toLocaleTimeString()}.`
        );
      }

      await new Promise((resolve) => setTimeout(resolve, Math.max(waitMs, 100)));
    }
  }

  public releaseKey(keyString: string): void {
    const entry = this.keys.find((k) => k.key === keyString);
    if (entry && entry.inFlight > 0) {
      entry.inFlight -= 1;
    }
  }

  public reportSuccess(keyString: string) {
    const entry = this.keys.find((k) => k.key === keyString);
    if (entry) {
      entry.dailyCallsUsed += 1;
      entry.cooldownUntil = null;
      entry.lastError = null;
      entry.throttleUntil = new Date(Date.now() + MIN_REQUEST_INTERVAL_MS);
      this.releaseKey(keyString);
    }
  }

  public reportFailure(
    keyString: string,
    error: any,
    customCooldownMs?: number,
    applyCooldown = true
  ) {
    const entry = this.keys.find((k) => k.key === keyString);
    if (!entry) return;

    const errorMsg = error?.message || String(error);
    entry.lastError = errorMsg;

    const isDailyLimit =
      errorMsg.includes('PerDayPerProjectPerModel-FreeTier') ||
      errorMsg.includes('GenerateRequestsPerDay') ||
      (errorMsg.includes('quota') && errorMsg.includes('limit: 20'));

    if (isDailyLimit) {
      // Lock key until midnight PT — the short retryDelay the API returns is misleading;
      // daily quota truly does not reset until midnight.
      const nextReset = getNextMidnightPT();
      entry.cooldownUntil = nextReset;
      entry.dailyCallsUsed = entry.dailyCallsLimit;
      entry.throttleUntil = null;
      console.warn(
        `[KeyPool] Project ${entry.projectLabel} daily quota exhausted. Locked until midnight PT (${nextReset.toISOString()})`
      );
    } else if (applyCooldown) {
      // Standard RPM / transient error — use API's suggested cooldown or default 60s
      const cooldownMs = customCooldownMs || 60000;
      entry.cooldownUntil = new Date(Date.now() + cooldownMs);
      entry.throttleUntil = null;
      console.warn(
        `[KeyPool] Project ${entry.projectLabel} rate-limited. Cooling down for ${Math.round(cooldownMs / 1000)}s.`
      );
    }

    this.releaseKey(keyString);
  }
}

export const keyPool = new KeyPoolManager();
export default keyPool;
