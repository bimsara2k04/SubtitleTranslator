import type { Request, Response, NextFunction } from 'express';
import { JobsRepository } from '../db/repositories/jobs.js';
import { ChunksRepository } from '../db/repositories/chunks.js';
import { processChunk } from '../services/jobs/processChunk.js';
import { rebuildOutput } from '../services/jobs/rebuildOutput.js';

export async function handleGetJob(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = req.params.id as string;
    if (!id) {
      res.status(400).json({ error: { message: 'Missing job id' } });
      return;
    }

    const job = await JobsRepository.findById(id);
    if (!job) {
      res.status(404).json({ error: { message: 'Job not found' } });
      return;
    }

    const chunks = await ChunksRepository.findByJobId(id);
    const validationIssues = await JobsRepository.getValidationIssues(id);

    res.json({
      job: {
        ...job,
        chunks: chunks.map((c) => ({
          id: c.id,
          chunkIndex: c.chunkIndex,
          status: c.status,
          retryCount: c.retryCount,
          cueIndexes: c.cueIndexes,
          cuesToTranslate: c.cuesToTranslate,
          translatedItems: c.translatedItems,
          errorMessage: c.errorMessage,
          startedAt: c.startedAt,
          completedAt: c.completedAt,
        })),
        validationIssues,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Sequential background worker to translate all pending/failed chunks of a job
 */
async function runBackgroundJob(jobId: string): Promise<void> {
  try {
    // 1. Set job status to translating
    await JobsRepository.updateStatus(jobId, 'translating');

    // 3. Process each chunk that is pending or failed dynamically.
    // We re-query the database to handle chunk splits created during translation failures.
    const attemptedChunkIds = new Set<string>();
    while (true) {
      const currentChunks = await ChunksRepository.findByJobId(jobId);
      // Find the next chunk that needs processing. Skip any that failed in this run to prevent infinite loops.
      const nextChunk = currentChunks.find(
        (c) => (c.status === 'pending' || c.status === 'failed') && !attemptedChunkIds.has(c.id)
      );
      if (!nextChunk) {
        break;
      }

      attemptedChunkIds.add(nextChunk.id);
      try {
        await processChunk(nextChunk.id);
      } catch (err: any) {
        const msg = err?.message || String(err);
        // Daily quota exhaustion is unrecoverable for the rest of today —
        // abort the entire job immediately instead of continuing to hammer the API.
        if (msg.includes('daily free-tier quota exhausted') || msg.includes('PerDayPerProjectPerModel-FreeTier')) {
          throw err;
        }
        // For splits or transient chunk failures, just log and continue to the next chunk
        console.warn(`[BackgroundJob] Chunk ${nextChunk.id} failed or was split:`, msg);
      }
    }

    // 4. Check status of chunks to see if we can rebuild
    const updatedChunks = await ChunksRepository.findByJobId(jobId);
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

export async function handleStartTranslation(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = req.params.id as string;
    if (!id) {
      res.status(400).json({ error: { message: 'Missing job id' } });
      return;
    }

    const job = await JobsRepository.findById(id);
    if (!job) {
      res.status(404).json({ error: { message: 'Job not found' } });
      return;
    }

    if (job.status === 'translating') {
      res.status(400).json({ error: { message: 'Job is already translating.' } });
      return;
    }

    // Run background worker asynchronously
    runBackgroundJob(id);

    res.status(202).json({
      message: 'Translation started in background.',
      jobId: id,
    });
  } catch (error) {
    next(error);
  }
}

export async function handleRetryChunk(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = req.params.id as string;
    const chunkId = req.params.chunkId as string;
    if (!id || !chunkId) {
      res.status(400).json({ error: { message: 'Missing job id or chunk id' } });
      return;
    }

    const job = await JobsRepository.findById(id);
    if (!job) {
      res.status(404).json({ error: { message: 'Job not found' } });
      return;
    }

    const chunk = await ChunksRepository.findById(chunkId);
    if (!chunk || chunk.jobId !== id) {
      res.status(404).json({ error: { message: 'Chunk not found in this job' } });
      return;
    }

    // We can retry this single chunk synchronously or start it in background.
    // Retrying immediately is nice because it is simple.
    res.status(202).json({ message: 'Chunk retry started.' });

    // Background process the single chunk
    (async () => {
      try {
        // Reset job status to translating if it was failed/completed
        await JobsRepository.updateStatus(id, 'translating');

        // Process chunk
        await processChunk(chunkId);

        // Check if all chunks are now completed
        const chunks = await ChunksRepository.findByJobId(id);
        const allCompleted = chunks.every((c) => c.status === 'completed');

        if (allCompleted) {
          await JobsRepository.updateStatus(id, 'rebuilding');
          await rebuildOutput(id);
          await JobsRepository.updateStatus(id, 'completed');
        } else if (chunks.every((c) => c.status !== 'processing' && c.status !== 'pending')) {
          await JobsRepository.updateStatus(id, 'failed', {
            errorMessage: 'Some subtitle chunks are still in a failed state.',
          });
        }
      } catch (err) {
        console.error(`[RetryChunk BG Error] Failed retrying chunk ${chunkId}:`, err);
      }
    })();
  } catch (error) {
    next(error);
  }
}
