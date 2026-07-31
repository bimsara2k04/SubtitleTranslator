import type { Request, Response, NextFunction } from 'express';
import { JobsRepository } from '../db/repositories/jobs.js';
import { ChunksRepository } from '../db/repositories/chunks.js';
import { runBackgroundJob } from '../services/jobs/runJob.js';
import { isValidUuid } from '../utils/validate.js';

export async function handleGetJob(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = req.params.id as string;
    if (!isValidUuid(id)) {
      res.status(400).json({ error: { code: 'INVALID_ID', message: 'Invalid job id.' } });
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

export async function handleStartTranslation(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = req.params.id as string;
    if (!isValidUuid(id)) {
      res.status(400).json({ error: { code: 'INVALID_ID', message: 'Invalid job id.' } });
      return;
    }

    const job = await JobsRepository.findById(id);
    if (!job) {
      res.status(404).json({ error: { message: 'Job not found' } });
      return;
    }

    // Atomically claim the job. A second concurrent call loses the claim.
    const claimed = await JobsRepository.claimForTranslation(id);
    if (!claimed) {
      res.status(409).json({ error: { message: 'Job is already being processed.' } });
      return;
    }

    // Run background worker asynchronously
    void runBackgroundJob(id);

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
    if (!isValidUuid(id) || !isValidUuid(chunkId)) {
      res.status(400).json({ error: { code: 'INVALID_ID', message: 'Invalid job or chunk id.' } });
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

    // The background worker retries failed chunks on its own while running.
    // Refuse to spawn a second worker mid-run to avoid duplicate Gemini calls.
    if (job.status === 'translating' || job.status === 'rebuilding') {
      res.status(409).json({
        error: { message: 'Job is still being processed. Wait for it to finish before retrying chunks.' },
      });
      return;
    }

    if (chunk.status === 'completed') {
      res.status(400).json({ error: { message: 'This chunk already translated successfully.' } });
      return;
    }

    if (chunk.status === 'processing') {
      res.status(409).json({ error: { message: 'This chunk is currently being translated.' } });
      return;
    }

    // Reset the chunk so the worker picks it up, then claim + start the worker.
    await ChunksRepository.updateStatus(chunkId, 'pending', {
      errorMessage: null,
      completedAt: null,
    });

    const claimed = await JobsRepository.claimForTranslation(id);
    if (!claimed) {
      // Another worker won the race — it will pick up the pending chunk itself.
      res.status(202).json({ message: 'Chunk retry queued for the active worker.' });
      return;
    }

    void runBackgroundJob(id);

    res.status(202).json({ message: 'Chunk retry started.' });
  } catch (error) {
    next(error);
  }
}
