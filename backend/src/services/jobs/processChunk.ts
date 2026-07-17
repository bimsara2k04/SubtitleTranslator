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
            // Retry on rate limits (429), transient connection issues, or server errors (5xx)
            const msg = String(err?.message || err || '').toLowerCase();
            return (
              msg.includes('429') ||
              msg.includes('rate limit') ||
              msg.includes('resource_exhausted') ||
              msg.includes('quota') ||
              msg.includes('500') ||
              msg.includes('503') ||
              msg.includes('network') ||
              msg.includes('timeout')
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

    // Dynamically split chunk into two smaller sub-chunks if it has more than one cue.
    // This allows reducing size/token limits and retry smaller inputs.
    if (chunk.cuesToTranslate.length > 1) {
      const mid = Math.floor(chunk.cuesToTranslate.length / 2);
      const cuesA = chunk.cuesToTranslate.slice(0, mid);
      const cuesB = chunk.cuesToTranslate.slice(mid);

      console.warn(
        `[ProcessChunk Split] Chunk ${chunkId} (index ${chunk.chunkIndex}, cues count ${chunk.cuesToTranslate.length}) failed persistently. Splitting into index ${chunk.chunkIndex} (size ${cuesA.length}) and index ${chunk.chunkIndex + 1} (size ${cuesB.length}).`
      );

      try {
        await ChunksRepository.splitChunk(chunkId, cuesA, cuesB);
        // Throw special error indicating split happened, which allows background loop to adapt
        throw new Error(`Chunk split due to persistent failure: ${errorMsg}`);
      } catch (splitErr: any) {
        console.error(`[ProcessChunk Split Error] Failed to split chunk ${chunkId}:`, splitErr.message);
      }
    }

    // Fail update for standard unsplittable chunk
    const updatedChunk = await ChunksRepository.updateFailure(
      chunkId,
      errorMsg,
      chunk.retryCount + 1
    );

    // Update job progress with isFailed = true
    await JobsRepository.incrementProcessed(job.id, true);

    return updatedChunk;
  }
}
