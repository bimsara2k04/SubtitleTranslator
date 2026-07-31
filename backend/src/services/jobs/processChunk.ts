import { ChunksRepository } from '../../db/repositories/chunks.js';
import { JobsRepository } from '../../db/repositories/jobs.js';
import { translateChunk } from '../gemini/translateChunk.js';
import { validateTranslations } from '../srt/validate.js';
import { keyPool, QuotaExhaustedError } from '../gemini/keyPool.js';
import type { TranslationChunk } from '../../types/jobs.js';

export { QuotaExhaustedError } from '../gemini/keyPool.js';

export type ProcessChunkResult =
  | { outcome: 'completed'; chunk: TranslationChunk }
  | { outcome: 'failed'; chunk: TranslationChunk }
  | { outcome: 'split' }
  | { outcome: 'skipped'; chunk: TranslationChunk };

const isContextTooLong = (message: string): boolean => {
  const lower = message.toLowerCase();
  return (
    lower.includes('context') ||
    lower.includes('too long') ||
    lower.includes('token') ||
    lower.includes('max_input') ||
    lower.includes('input length') ||
    lower.includes('exceeds')
  );
};

/**
 * Extract the suggested retry delay (ms) from a Gemini 429 error body, if any.
 */
function extractRetryDelayMs(error: any): number | undefined {
  try {
    const msg = String(error?.message || '');
    const parsed = JSON.parse(msg);
    const details: any[] = parsed?.error?.details ?? [];
    const retryInfo = details.find((d: any) => d['@type']?.includes('RetryInfo'));
    if (retryInfo?.retryDelay) {
      const seconds = parseFloat(String(retryInfo.retryDelay).replace('s', ''));
      if (!isNaN(seconds) && seconds > 0) {
        return Math.ceil(seconds * 1000);
      }
    }
  } catch {
    // ignore JSON parse failures
  }
  return undefined;
}

export async function processChunk(
  chunkId: string,
  modelOverride?: string
): Promise<ProcessChunkResult> {
  // Atomically claim the chunk. Already-processing/completed chunks are a
  // no-op, which prevents duplicate Gemini calls from concurrent workers.
  const claimed = await ChunksRepository.claimForProcessing(chunkId);
  if (!claimed) {
    const existing = await ChunksRepository.findById(chunkId);
    if (!existing) {
      throw new Error(`Chunk ${chunkId} not found`);
    }
    return { outcome: 'skipped', chunk: existing };
  }

  const { chunk } = claimed;

  const job = await JobsRepository.findById(chunk.jobId);
  if (!job) {
    throw new Error(`Job ${chunk.jobId} associated with chunk ${chunkId} not found`);
  }

  const model = modelOverride || job.model;

  try {
    const poolSize = Math.max(keyPool.getKeyCount(), 1);
    // Allow up to 2× pool size attempts: first pass tries every key,
    // second pass waits out short RPM cooldowns and retries them.
    const maxAttempts = Math.max(poolSize * 2, 2);
    let attempt = 0;
    let lastErr: any = null;
    let translatedItems = null;

    while (attempt < maxAttempts) {
      attempt++;

      // Reserve a key. Waits until a healthy key is free (never double-books
      // a key across concurrent workers). Throws QuotaExhaustedError when the
      // whole pool is locked until the daily reset.
      const keyEntry = await keyPool.acquireKey();

      try {
        console.log(
          `[ProcessChunk] Attempt ${attempt}/${maxAttempts} for chunk ${chunk.chunkIndex} using project key: ${keyEntry.projectLabel}`
        );

        translatedItems = await translateChunk(
          chunk.cuesToTranslate,
          job.targetLanguage,
          model,
          job.toneStyle,
          job.glossary,
          keyEntry.key
        );

        // Success: report and break
        keyPool.reportSuccess(keyEntry.key);
        break;
      } catch (err: any) {
        lastErr = err;
        const lower = String(err?.message || err || '').toLowerCase();

        // Non-retryable errors (400, model not found, parse errors) are not the
        // key's fault — don't cool the key down for them.
        const isRetryable =
          lower.includes('429') ||
          lower.includes('rate limit') ||
          lower.includes('resource_exhausted') ||
          lower.includes('quota') ||
          lower.includes('500') ||
          lower.includes('503') ||
          lower.includes('network') ||
          lower.includes('timeout');

        keyPool.reportFailure(keyEntry.key, err, extractRetryDelayMs(err), isRetryable);

        if (!isRetryable) {
          throw err;
        }

        console.warn(
          `[ProcessChunk Failover] Attempt ${attempt} failed on project key ${keyEntry.projectLabel}. Rotating to next available key...`
        );
      }
    }

    if (!translatedItems) {
      throw lastErr || new Error('Failed to translate after max attempts.');
    }

    // Validate structure of translated items
    const validation = validateTranslations(chunk.cuesToTranslate, translatedItems);

    // Save validation report if there are warnings or errors
    const postIssues = [...validation.errors, ...validation.warnings];
    if (postIssues.length > 0) {
      await JobsRepository.addValidationReport(job.id, chunkId, 'post', postIssues);
    }

    // Hard structural errors (unexpected/duplicate indexes) abort the chunk
    if (!validation.valid) {
      const firstError = validation.errors[0]?.message || 'Translation validation failed';
      throw new Error(firstError);
    }

    // Patch any missing or empty translations with the source text as fallback.
    const translatedMap = new Map(translatedItems.map((t) => [t.index, t]));
    const patchedItems = chunk.cuesToTranslate.map((sourceCue) => {
      const existing = translatedMap.get(sourceCue.index);
      const isEmpty =
        !existing ||
        existing.translatedLines.length === 0 ||
        existing.translatedLines.every((l) => l.trim() === '');
      if (isEmpty) {
        return { index: sourceCue.index, translatedLines: sourceCue.textLines };
      }
      return existing;
    });

    // Success update (atomic — guards on the chunk being `processing`)
    const updatedChunk = await ChunksRepository.markCompleted(chunkId, job.id, patchedItems);
    if (!updatedChunk) {
      // Lost the race (e.g. duplicate worker) — treat as skipped
      const existing = await ChunksRepository.findById(chunkId);
      return existing
        ? { outcome: 'skipped', chunk: existing }
        : { outcome: 'skipped', chunk };
    }

    return { outcome: 'completed', chunk: updatedChunk };
  } catch (error: any) {
    const errorMsg = error?.message || 'Unknown chunk translation error';

    // True daily quota exhaustion — abort the whole job immediately.
    if (error?.name === 'QuotaExhaustedError') {
      const userFacingMsg =
        'Gemini API daily free-tier quota exhausted on all configured keys. ' +
        'Please wait until midnight PT for quotas to reset, or add more API keys to the pool.';
      await ChunksRepository.markFailed(chunkId, job.id, userFacingMsg, chunk.retryCount + 1);
      throw error;
    }

    const isDailyQuotaExhausted =
      errorMsg.includes('PerDayPerProjectPerModel-FreeTier') ||
      errorMsg.includes('GenerateRequestsPerDay');

    if (isDailyQuotaExhausted) {
      const userFacingMsg =
        'Gemini API daily free-tier quota exhausted on all configured keys. ' +
        'Please wait until midnight PT for quotas to reset, or add more API keys to the pool.';
      await ChunksRepository.markFailed(chunkId, job.id, userFacingMsg, chunk.retryCount + 1);
      throw new QuotaExhaustedError(userFacingMsg);
    }

    // Rate-limit / quota errors: do NOT split.
    // Model-not-found, bad-request, parse errors: also do NOT split — the same error
    // will happen regardless of chunk size.
    // ONLY split when the model reports the input is too long for its context window.
    if (isContextTooLong(errorMsg) && chunk.cuesToTranslate.length > 1) {
      const mid = Math.floor(chunk.cuesToTranslate.length / 2);
      const cuesA = chunk.cuesToTranslate.slice(0, mid);
      const cuesB = chunk.cuesToTranslate.slice(mid);

      console.warn(
        `[ProcessChunk Split] Chunk ${chunkId} (index ${chunk.chunkIndex}, ${chunk.cuesToTranslate.length} cues) splitting into ` +
        `index ${chunk.chunkIndex} (${cuesA.length} cues) and index ${chunk.chunkIndex + 1} (${cuesB.length} cues).`
      );

      await ChunksRepository.splitChunk(chunkId, cuesA, cuesB);
      // Success — the two new pending chunks will be picked up by the worker loop.
      return { outcome: 'split' };
    }

    // Standard failure — mark chunk failed, job continues with remaining chunks.
    const updatedChunk = await ChunksRepository.markFailed(
      chunkId,
      job.id,
      errorMsg,
      chunk.retryCount + 1
    );

    if (!updatedChunk) {
      const existing = await ChunksRepository.findById(chunkId);
      return existing
        ? { outcome: 'skipped', chunk: existing }
        : { outcome: 'skipped', chunk };
    }

    return { outcome: 'failed', chunk: updatedChunk };
  }
}
