import { ChunksRepository } from '../../db/repositories/chunks';
import { JobsRepository } from '../../db/repositories/jobs';
import { translateChunk } from '../gemini/translateChunk';
import { validateTranslations } from '../srt/validate';
import { globalRateLimiter } from '../../utils/rateLimiter';
import { keyPool } from '../gemini/keyPool';
import type { TranslationChunk } from '../../types/jobs';

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

  await ChunksRepository.updateStatus(chunkId, 'processing', {
    startedAt: new Date(),
  });

  const model = modelOverride || job.model;
  let activeProjectLabel = 'unknown';

  try {
    await globalRateLimiter.acquire();
    
    let translatedItems;
    try {
      const maxAttempts = 5;
      let attempt = 0;
      let lastErr: any = null;

      while (attempt < maxAttempts) {
        attempt++;
        const keyEntry = keyPool.acquireKey();

        if (keyEntry.cooldownUntil !== null) {
          const waitMs = keyEntry.cooldownUntil.getTime() - Date.now();
          if (waitMs > 0) {
            if (waitMs > 10 * 60 * 1000) {
              const resetStr = keyEntry.cooldownUntil.toLocaleTimeString();
              throw new Error(
                `All Gemini API keys daily quota exhausted. Soonest reset is for ${keyEntry.projectLabel} at ${resetStr}.`
              );
            }
            console.log(
              `[ProcessChunk] All API keys are on cooldown. Waiting ${Math.round(waitMs / 1000)}s for ${keyEntry.projectLabel}...`
            );
            await new Promise((resolve) => setTimeout(resolve, waitMs));
          }
        }

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

          keyPool.reportSuccess(keyEntry.key);
          activeProjectLabel = keyEntry.projectLabel;
          break;
        } catch (err: any) {
          lastErr = err;
          const msg = String(err?.message || err || '');
          const lower = msg.toLowerCase();

          let customCooldownMs: number | undefined;
          try {
            const parsed = JSON.parse(msg);
            const details: any[] = parsed?.error?.details ?? [];
            const retryInfo = details.find((d: any) => d['@type']?.includes('RetryInfo'));
            if (retryInfo?.retryDelay) {
              const seconds = parseFloat(String(retryInfo.retryDelay).replace('s', ''));
              if (!isNaN(seconds) && seconds > 0) {
                customCooldownMs = Math.ceil(seconds * 1000);
              }
            }
          } catch {
            // ignore JSON parse failures
          }

          keyPool.reportFailure(keyEntry.key, err, customCooldownMs);

          const isRetryable =
            lower.includes('429') ||
            lower.includes('rate limit') ||
            lower.includes('resource_exhausted') ||
            lower.includes('quota') ||
            lower.includes('500') ||
            lower.includes('503') ||
            lower.includes('network') ||
            lower.includes('timeout');

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
    } finally {
      globalRateLimiter.release();
    }

    const validation = validateTranslations(chunk.cuesToTranslate, translatedItems);

    const postIssues = [...validation.errors, ...validation.warnings];
    if (postIssues.length > 0) {
      await JobsRepository.addValidationReport(job.id, chunkId, 'post', postIssues);
    }

    if (!validation.valid) {
      const firstError = validation.errors[0]?.message || 'Translation validation failed';
      throw new Error(firstError);
    }

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

    const updatedChunk = await ChunksRepository.updateSuccess(chunkId, patchedItems, activeProjectLabel);
    await JobsRepository.incrementProcessed(job.id, false);

    return updatedChunk;
  } catch (error: any) {
    const errorMsg = error?.message || 'Unknown chunk translation error';
    console.error(`[ProcessChunk Error] Chunk ${chunkId} failed:`, errorMsg);

    const isDailyQuotaExhausted =
      errorMsg.includes('All Gemini API keys daily quota exhausted') ||
      errorMsg.includes('PerDayPerProjectPerModel-FreeTier') ||
      errorMsg.includes('GenerateRequestsPerDay');

    if (isDailyQuotaExhausted) {
      const userFacingMsg =
        'Gemini API daily free-tier quota exhausted on all configured keys. ' +
        'Please wait until midnight PT for quotas to reset, or add more API keys to the pool.';
      await ChunksRepository.updateFailure(chunkId, userFacingMsg, chunk.retryCount + 1);
      await JobsRepository.incrementProcessed(job.id, true);
      throw new Error(userFacingMsg);
    }

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
        throw new Error(`Chunk split into smaller pieces for retry: ${errorMsg}`);
      } catch (splitErr: any) {
        console.error(`[ProcessChunk Split Error] Could not split chunk ${chunkId}:`, splitErr.message);
      }
    }

    const updatedChunk = await ChunksRepository.updateFailure(
      chunkId,
      errorMsg,
      chunk.retryCount + 1
    );
    await JobsRepository.incrementProcessed(job.id, true);
    return updatedChunk;
  }
}
