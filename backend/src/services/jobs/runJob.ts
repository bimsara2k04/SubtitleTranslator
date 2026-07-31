import { JobsRepository } from '../../db/repositories/jobs.js';
import { ChunksRepository } from '../../db/repositories/chunks.js';
import { processChunk, QuotaExhaustedError } from './processChunk.js';
import { rebuildOutput } from './rebuildOutput.js';
import { keyPool } from '../gemini/keyPool.js';

const DEFAULT_CONCURRENCY = 4;
const MAX_CONCURRENCY = 8;
const IDLE_RESCAN_MS = 200;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * How many chunks to translate in parallel. Defaults to the number of API keys
 * (capped), and can be overridden with MAX_CONCURRENT_CHUNKS.
 */
function getMaxConcurrency(): number {
  const fromEnv = parseInt(process.env.MAX_CONCURRENT_CHUNKS ?? '', 10);
  if (!isNaN(fromEnv) && fromEnv > 0) {
    return Math.min(fromEnv, MAX_CONCURRENCY);
  }
  return Math.max(1, Math.min(DEFAULT_CONCURRENCY, keyPool.getKeyCount()));
}

/**
 * Background worker that translates all pending/failed chunks of a job using a
 * pool of concurrent workers — one per API key by default. Each worker claims a
 * chunk atomically and reserves its own key, so chunks run in parallel across
 * keys without ever double-booking a single key.
 *
 * The job must already be claimed (status == 'translating') by the caller via
 * `JobsRepository.claimForTranslation` — this guarantees only one runner is
 * active per job at a time.
 *
 * Handles chunk splits transparently: split chunks are created as new `pending`
 * rows and are picked up by idle workers.
 */
export async function runBackgroundJob(jobId: string): Promise<void> {
  try {
    const attempted = new Set<string>();
    let running = 0;
    let quotaError: Error | null = null;

    const workers = Array.from({ length: getMaxConcurrency() }, async () => {
      while (true) {
        if (quotaError) return;

        const chunks = await ChunksRepository.findByJobId(jobId);
        const next = chunks.find(
          (c) => (c.status === 'pending' || c.status === 'failed') && !attempted.has(c.id)
        );

        if (!next) {
          // No work left right now. If other workers are still active they may
          // yet split a chunk and create new work — rescan shortly.
          if (running === 0) return;
          await sleep(IDLE_RESCAN_MS);
          continue;
        }

        attempted.add(next.id);
        running += 1;
        try {
          await processChunk(next.id);
        } catch (err: any) {
          if (err instanceof QuotaExhaustedError || err?.name === 'QuotaExhaustedError') {
            quotaError = err;
            return;
          }
          const msg = err?.message || String(err);
          console.warn(`[BackgroundJob] Chunk ${next.id} failed:`, msg);
        } finally {
          running -= 1;
        }
      }
    });

    await Promise.all(workers);

    if (quotaError) {
      throw quotaError;
    }

    // Check status of chunks to see if we can rebuild
    const updatedChunks = await ChunksRepository.findByJobId(jobId);
    if (updatedChunks.length === 0) {
      // Degenerate job with no chunks — nothing to rebuild.
      await JobsRepository.updateStatus(jobId, 'failed', {
        errorMessage: 'No subtitle chunks were created for this job.',
      });
      return;
    }

    const allCompleted = updatedChunks.every((c) => c.status === 'completed');

    if (allCompleted) {
      await JobsRepository.updateStatus(jobId, 'rebuilding');
      await rebuildOutput(jobId);
      await JobsRepository.updateStatus(jobId, 'completed');
    } else {
      // Some chunks failed, set job to failed so user can see and retry specific chunks
      await JobsRepository.updateStatus(jobId, 'failed', {
        errorMessage: 'Some subtitle chunks failed to translate.',
      });
    }
  } catch (error: any) {
    console.error(`[BackgroundJob Error] Job ${jobId} failed:`, error);
    await JobsRepository.updateStatus(jobId, 'failed', {
      errorMessage: error?.message || 'Unexpected background error',
    });
  }
}
