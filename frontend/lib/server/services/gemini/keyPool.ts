export interface KeyEntry {
  key: string;
  projectLabel: string;
  cooldownUntil: Date | null;
  dailyCallsUsed: number;
  dailyCallsLimit: number;
  dailyCallsReset: Date;
  lastError: string | null;
}

function getNextMidnightPT(): Date {
  const now = new Date();
  const ptOffset = -8 * 60;
  const localTime = now.getTime();
  const localOffset = now.getTimezoneOffset();
  const ptTime = new Date(localTime + (localOffset + ptOffset) * 60000);
  
  const nextMidnightPT = new Date(ptTime);
  nextMidnightPT.setHours(24, 0, 0, 0);
  
  return new Date(nextMidnightPT.getTime() - (localOffset + ptOffset) * 60000);
}

class KeyPoolManager {
  private keys: KeyEntry[] = [];

  constructor() {
    this.initializePool();
  }

  public initializePool() {
    const rawKeys = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || '';
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
        dailyCallsUsed: 0,
        dailyCallsLimit: 20,
        dailyCallsReset: nextReset,
        lastError: null,
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
        canCompleteJobAlone: false,
        onCooldown,
        cooldownExpiresAt: onCooldown ? k.cooldownUntil : null,
      };
    });
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
        keyEntry.lastError = null;
      }
    }
  }

  public acquireKey(): KeyEntry {
    this.checkAndResetDailyQuotas();
    const now = new Date();

    if (this.keys.length === 0) {
      throw new Error('Key pool is empty. Please define GEMINI_API_KEYS or GEMINI_API_KEY in your env.');
    }

    const healthyKeys = this.keys.filter(
      (k) => k.cooldownUntil === null || k.cooldownUntil <= now
    );

    if (healthyKeys.length > 0) {
      const selected = healthyKeys.reduce((prev, curr) => 
        curr.dailyCallsUsed < prev.dailyCallsUsed ? curr : prev
      ) as KeyEntry;
      return selected;
    }

    const sortedByExpiry = [...this.keys].sort((a, b) => {
      const aTime = a.cooldownUntil ? a.cooldownUntil.getTime() : 0;
      const bTime = b.cooldownUntil ? b.cooldownUntil.getTime() : 0;
      return aTime - bTime;
    });

    const soonest = sortedByExpiry[0] as KeyEntry;
    return soonest;
  }

  public reportSuccess(keyString: string) {
    const entry = this.keys.find((k) => k.key === keyString);
    if (entry) {
      entry.dailyCallsUsed += 1;
      entry.cooldownUntil = null;
      entry.lastError = null;
    }
  }

  public reportFailure(keyString: string, error: any, customCooldownMs?: number) {
    const entry = this.keys.find((k) => k.key === keyString);
    if (!entry) return;

    const errorMsg = error?.message || String(error);
    entry.lastError = errorMsg;

    const isDailyLimit =
      errorMsg.includes('PerDayPerProjectPerModel-FreeTier') ||
      errorMsg.includes('GenerateRequestsPerDay') ||
      errorMsg.includes('quota') && errorMsg.includes('limit: 20');

    if (isDailyLimit) {
      const nextReset = getNextMidnightPT();
      entry.cooldownUntil = nextReset;
      entry.dailyCallsUsed = entry.dailyCallsLimit;
      console.warn(
        `[KeyPool] Project ${entry.projectLabel} daily quota exhausted. Cool down until midnight PT (${nextReset.toISOString()})`
      );
    } else {
      const cooldownMs = customCooldownMs || 60000;
      entry.cooldownUntil = new Date(Date.now() + cooldownMs);
      console.warn(
        `[KeyPool] Project ${entry.projectLabel} failed. Cool down for ${Math.round(cooldownMs / 1000)}s`
      );
    }
  }
}

export const keyPool = new KeyPoolManager();
export default keyPool;
