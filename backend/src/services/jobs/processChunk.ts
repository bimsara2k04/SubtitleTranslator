import { ChunksRepository } from '../../db/repositories/chunks.js';
import { JobsRepository } from '../../db/repositories/jobs.js';
import { translateChunk } from '../gemini/translateChunk.js';
import { validateTranslations } from '../srt/validate.js';
import { withRetry } from '../../utils/retry.js';
import { globalRateLimiter } from '../../utils/rateLimiter.js';
import type { TranslationChunk } from '../../types/jobs.js';

export async function processChunk(
  chunkId: string,
  modelOverride?: string
): Promise<TranslationChunk> {
  const chunk = await ChunksRepository.findById(chunkId);
  if (!chunk) {
    throw new Error(`Chunk ${chunkId} not found`);
  }

  const job = await JobsRepository.findById(chunk.jobId);
  if (!job) {
    throw new Error(`Job ${chunk.jobId} associated with chunk ${chunkId} not found`);
  }

  // Update chunk status to processing
  await ChunksRepository.updateStatus(chunkId, 'processing', {
    startedAt: new Date(),
  });

  const model = modelOverride || job.model;

  try {
    // Acquire a rate limiter slot before requesting translation from Gemini
    await globalRateLimiter.acquire();
    
    let translatedItems;
    try {
      // Translate with exponential backoff retry for transient API failures
      translatedItems = await withRetry(
        () =>
          translateChunk(
            chunk.cuesToTranslate,
            job.targetLanguage,
            model,
            job.toneStyle,
            job.glossary
          ),
        {
          maxAttempts: 5,
          delayMs: 2000,
          backoffFactor: 2,
          shouldRetry: (err) => {
            const msg = String(err?.message || err || '');
            const lower = msg.toLowerCase();

            // Daily free-tier quota is exhausted — retrying is futile, fail immediately.
            // This quota resets at midnight PT, not per-minute.
            if (msg.includes('PerDayPerProjectPerModel-FreeTier') || msg.includes('GenerateRequestsPerDay')) {
              return false;
            }

            // Retry on per-minute rate limits (429), transient errors, or server errors (5xx)
            return (
              lower.includes('429') ||
              lower.includes('rate limit') ||
              lower.includes('resource_exhausted') ||
              lower.includes('quota') ||
              lower.includes('500') ||
              lower.includes('503') ||
              lower.includes('network') ||
              lower.includes('timeout')
            );
          },
        }
      );
    } finally {
      // Always release rate limiter slot
      globalRateLimiter.release();
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
    // Gemini sometimes omits sound-effect / music-note cues — this ensures the
    // output SRT is always complete with no missing cues.
    const translatedMap = new Map(translatedItems.map((t) => [t.index, t]));
    const patchedItems = chunk.cuesToTranslate.map((sourceCue) => {
      const existing = translatedMap.get(sourceCue.index);
      const isEmpty =
        !existing ||
        existing.translatedLines.length === 0 ||
        existing.translatedLines.every((l) => l.trim() === '');
      if (isEmpty) {
        // Fall back to original source text
        return { index: sourceCue.index, translatedLines: sourceCue.textLines };
      }
      return existing;
    });

    // Success update
    const updatedChunk = await ChunksRepository.updateSuccess(chunkId, patchedItems);
    
    // Update job metrics
    await JobsRepository.incrementProcessed(job.id, false);

    return updatedChunk;
  } catch (error: any) {
    const errorMsg = error?.message || 'Unknown chunk translation error';
    console.error(`[ProcessChunk Error] Chunk ${chunkId} failed:`, errorMsg);

    // Check if this is daily quota exhaustion — splitting won't help since the quota
    // is per-day. Fail the chunk (and job) immediately with a clear message.
    const isDailyQuotaExhausted =
      errorMsg.includes('PerDayPerProjectPerModel-FreeTier') ||
      errorMsg.includes('GenerateRequestsPerDay');

    if (isDailyQuotaExhausted) {
      const userFacingMsg =
        'Gemini API daily free-tier quota exhausted (20 requests/day limit). ' +
        'Please wait until midnight PT for the quota to reset, or upgrade to a paid API key.';
      await ChunksRepository.updateFailure(chunkId, userFacingMsg, chunk.retryCount + 1);
      await JobsRepository.incrementProcessed(job.id, true);
      // Propagate so the background runner marks the whole job failed immediately
      throw new Error(userFacingMsg);
    }

    // For non-quota persistent failures: dynamically split into two smaller sub-chunks.
    // This reduces payload size and allows the smaller pieces to be retried.
    if (chunk.cuesToTranslate.length > 1) {
      const mid = Math.floor(chunk.cuesToTranslate.length / 2);
      const cuesA = chunk.cuesToTranslate.slice(0, mid);
      const cuesB = chunk.cuesToTranslate.slice(mid);

      console.warn(
        `[ProcessChunk Split] Chunk ${chunkId} (index ${chunk.chunkIndex}, ${chunk.cuesToTranslate.length} cues) splitting into ` +
        `index ${chunk.chunkIndex} (${cuesA.length} cues) and index ${chunk.chunkIndex + 1} (${cuesB.length} cues).`
      );

      try {
        await ChunksRepository.splitChunk(chunkId, cuesA, cuesB);
        // Return early — the original chunk is deleted; the background loop will pick up the new sub-chunks.
        // Do NOT call updateFailure/incrementProcessed here since the chunk no longer exists.
        throw new Error(`Chunk split into smaller pieces for retry: ${errorMsg}`);
      } catch (splitErr: any) {
        // If the split itself failed, fall through to the standard failure path below.
        console.error(`[ProcessChunk Split Error] Could not split chunk ${chunkId}:`, splitErr.message);
      }
    }

    // Standard failure update for unsplittable chunks (size == 1 or split failed)
    const updatedChunk = await ChunksRepository.updateFailure(
      chunkId,
      errorMsg,
      chunk.retryCount + 1
    );
    await JobsRepository.incrementProcessed(job.id, true);
    return updatedChunk;
  }
}
